import { expect, test, type Page } from "@playwright/test";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_AJUSTES,
  RUTA_CUENTA,
  RUTA_GASTOS,
  RUTA_INVITADOS,
  RUTA_MEDIOS,
  RUTA_MENSAJES,
  RUTA_PAGOS,
  RUTA_PANEL,
  RUTA_PENDIENTES,
  RUTA_PRESUPUESTO,
  RUTA_PROVEEDORES,
} from "@/config/constants";

/**
 * REPASO DEL PANEL, PANTALLA POR PANTALLA
 *
 * Los demás specs del panel comprueban que cada módulo HACE lo suyo: que un
 * invitado se da de alta, que un pago se marca, que un proveedor no se borra
 * con gastos colgando. Ninguno mira si esas pantallas se pueden USAR desde un
 * móvil, y ahí es donde se van a usar: los novios miran el panel en el sofá y
 * en la cola del catering, no sentados en un escritorio.
 *
 * Este fichero recorre TODAS las rutas del panel a lo ancho de un móvil y
 * afirma cuatro cosas que no se ven leyendo el código:
 *
 *   · Nada se sale por la derecha. Una tabla que desborda convierte la página
 *     entera en un carrusel horizontal y esconde la mitad del contenido.
 *   · Nada que se toque baja de 44 px. Es el mínimo de la WCAG 2.5.8, y en un
 *     panel lleno de botones de fila es justo lo que se dibuja apretado.
 *   · Hay un `h1` y sólo uno. Es lo que le dice a un lector de pantalla dónde
 *     ha caído.
 *   · Ningún texto se desborda de su caja.
 *
 * SÓLO CORRE DONDE HAY SUPABASE DE VERDAD, igual que el resto de specs del
 * panel: hace falta sesión, y sesión hace falta GoTrue. Fuera de ese trabajo se
 * salta solo.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

/** Todas las pantallas del panel, con el nombre que se lee en un fallo. */
const PANTALLAS = [
  ["la portada del panel", RUTA_PANEL],
  ["invitados", RUTA_INVITADOS],
  ["los que no han contestado", RUTA_PENDIENTES],
  ["mensajes", RUTA_MENSAJES],
  ["fotos y vídeos", RUTA_MEDIOS],
  ["proveedores", RUTA_PROVEEDORES],
  ["presupuesto", RUTA_PRESUPUESTO],
  ["gastos", RUTA_GASTOS],
  ["pagos", RUTA_PAGOS],
  ["ajustes", RUTA_AJUSTES],
  ["la cuenta", RUTA_CUENTA],
] as const;

/** El mínimo táctil de la WCAG 2.5.8, en píxeles CSS. */
const MINIMO_TACTIL = 44;

/** Lo ancho que es el móvil más estrecho que se ve hoy en día. */
const ANCHO_MOVIL = 360;

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

/**
 * Lo que se sale por la derecha, y de quién es la culpa.
 *
 * SE IGNORA LO QUE VIVE DENTRO DE UN CONTENEDOR QUE YA SE DESPLAZA. Una tabla
 * ancha metida en un `overflow-x: auto` es la solución correcta, no el problema:
 * se arrastra ella sola y la página no se mueve. Lo que hay que cazar es lo que
 * empuja al DOCUMENTO.
 */
async function loQueSeSale(pagina: Page) {
  return pagina.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return [];

    const culpables: string[] = [];
    for (const nodo of document.querySelectorAll<HTMLElement>("body *")) {
      const caja = nodo.getBoundingClientRect();
      if (caja.width === 0 || caja.right <= doc.clientWidth + 1) continue;

      // ¿Algún antepasado se encarga ya de desplazarlo?
      let padre = nodo.parentElement;
      let contenido = false;
      while (padre && padre !== document.body) {
        const desbordamiento = getComputedStyle(padre).overflowX;
        if (
          desbordamiento === "auto" ||
          desbordamiento === "scroll" ||
          desbordamiento === "hidden"
        ) {
          contenido = true;
          break;
        }
        padre = padre.parentElement;
      }
      if (contenido) continue;

      culpables.push(
        `${nodo.tagName.toLowerCase()}.${(nodo.className || "").toString().split(" ")[0]} llega a ${Math.round(caja.right)} de ${doc.clientWidth}`,
      );
    }
    return [...new Set(culpables)].slice(0, 6);
  });
}

/**
 * Controles por debajo del mínimo táctil.
 *
 * DOS EXENCIONES, Y LAS DOS SON DE LA NORMA, NO ATAJOS:
 *
 *   · Un enlace dentro de un párrafo tiene como objetivo la línea de texto, no
 *     un botón. Forzarle altura rompería el renglón.
 *   · EL OBJETIVO DE UNA CASILLA ES SU ETIQUETA. Pulsar el rótulo marca la
 *     casilla, así que lo que hay que medir es la etiqueta entera y no el
 *     cuadradito de 16 px. Medir el `input` daba un fallo real —la etiqueta se
 *     quedaba en 32 px— pero señalando al elemento equivocado, y «arreglarlo»
 *     habría sido dibujar una casilla gigante en vez de una etiqueta cómoda.
 */
async function loQueNoSeDejaTocar(pagina: Page, minimo: number) {
  return pagina.evaluate((tope) => {
    const pequenos: string[] = [];
    for (const nodo of document.querySelectorAll<HTMLElement>(
      "a, button, summary, input, select, [role=button]",
    )) {
      if (nodo.closest(".sr-only") || nodo.closest("p")) continue;
      if (nodo.getAttribute("type") === "hidden") continue;

      // Si vive dentro de una etiqueta, la etiqueta es el objetivo.
      const objetivo = nodo.closest("label") ?? nodo;
      const caja = objetivo.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0) continue;

      if (caja.height < tope) {
        pequenos.push(
          `${objetivo.tagName.toLowerCase()} «${(objetivo.textContent ?? "").trim().slice(0, 24) || nodo.getAttribute("aria-label") || "?"}» ${Math.round(caja.height)}px`,
        );
      }
    }
    return [...new Set(pequenos)].slice(0, 8);
  }, minimo);
}

test.describe("El panel en un móvil", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.use({ viewport: { width: ANCHO_MOVIL, height: 740 } });

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  for (const [nombre, ruta] of PANTALLAS) {
    test(`${nombre} se puede usar con el pulgar`, async ({ page }) => {
      await page.goto(ruta);

      // Que la pantalla ha cargado de verdad y no es un error.
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      expect(await loQueSeSale(page), `${nombre}: algo empuja la página a lo ancho`).toEqual(
        [],
      );

      expect(
        await loQueNoSeDejaTocar(page, MINIMO_TACTIL),
        `${nombre}: controles por debajo de ${MINIMO_TACTIL}px`,
      ).toEqual([]);
    });
  }
});

/**
 * Y en escritorio, lo único que no se puede comprobar en móvil: que las tablas
 * anchas se desplacen DENTRO de su caja y no arrastren la página. Es el fallo
 * que convierte un panel en un mapa: se mueve todo menos lo que quieres leer.
 */
test.describe("El panel en escritorio", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  for (const [nombre, ruta] of PANTALLAS) {
    test(`${nombre} no arrastra la página a lo ancho`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      expect(await loQueSeSale(page), `${nombre}: desborda en escritorio`).toEqual([]);
    });
  }
});
