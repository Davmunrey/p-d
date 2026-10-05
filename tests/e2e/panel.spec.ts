import { expect, test } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_CUENTA, RUTA_PANEL } from "../../src/config/constants";
import { MODULOS, MODULOS_ENTREGADOS } from "../../src/config/modulos";

/**
 * BODA-42 · El esqueleto del panel
 *
 * El recorrido de verdad —entrar, navegar, cerrar sesión— necesita GoTrue, así
 * que vive en el trabajo de CI que levanta el Supabase local y se salta en
 * cualquier otro sitio.
 *
 * Lo que sí se prueba en todas partes está más abajo: que las pantallas del
 * panel no se guardan en la caché del navegador. Esa es la que muerde de
 * verdad, y no hace falta sesión para comprobarla.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

test.describe("Dentro del panel", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
  });

  test("se navega entre módulos y el menú dice dónde estás", async ({ page }) => {
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();

    await expect(menu.getByRole("link", { name: copy.panel.modulos.resumen })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await menu.getByRole("link", { name: copy.panel.modulos.cuenta }).click();

    await expect(page).toHaveURL(new RegExp(RUTA_CUENTA));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.panel.cuenta.titulo);
    await expect(menu.getByRole("link", { name: copy.panel.modulos.cuenta })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("el nombre que se guarda es el que aparece arriba", async ({ page }) => {
    // Escribe de verdad en `perfiles`: si esto pasa, la pantalla está cableada.
    const nombre = "(PRUEBA) Nombre cambiado";

    await page.goto(RUTA_CUENTA);
    await page.getByLabel(copy.panel.cuenta.nombre).fill(nombre);
    await page.getByRole("button", { name: copy.panel.cuenta.guardar }).click();

    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      copy.panel.cuenta.guardado,
    );
    await expect(page.getByRole("banner")).toContainText(nombre);

    // Y sigue ahí al recargar, que es lo que separa guardar de aparentarlo.
    await page.reload();
    await expect(page.getByLabel(copy.panel.cuenta.nombre)).toHaveValue(nombre);
  });

  test("un nombre de sólo espacios no se guarda", async ({ page }) => {
    await page.goto(RUTA_CUENTA);
    const campo = page.getByLabel(copy.panel.cuenta.nombre);
    const original = await campo.inputValue();

    // DOS espacios, y no uno, a propósito. Con uno el navegador ni siquiera
    // envía el formulario —lo para su propio `minlength`— y lo que se estaría
    // probando es el navegador, no nuestro código. Con dos pasa esa criba y
    // llega al servidor, que es quien tiene que darse cuenta de que un nombre
    // que al recortarlo se queda en nada no es un nombre.
    await campo.fill("  ");
    await page.getByRole("button", { name: copy.panel.cuenta.guardar }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      copy.panel.cuenta.nombreCorto,
    );

    await page.goto(RUTA_CUENTA);
    await expect(campo).toHaveValue(original);
  });

  test("los módulos sin terminar no están en el menú", async ({ page }) => {
    // Un menú que enseña ocho módulos cuando funcionan dos no es una promesa:
    // es una trampa.
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();

    for (const modulo of MODULOS.filter((cada) => !cada.entregado)) {
      await expect(
        menu.getByRole("link", { name: copy.panel.modulos[modulo.clave] }),
      ).toHaveCount(0);
    }
  });

  // --- El caso que de verdad importa -----------------------------------

  test("tras cerrar sesión, «atrás» no devuelve al panel", async ({ page }) => {
    await page.goto(RUTA_CUENTA);
    await page.getByRole("button", { name: copy.acceso.cerrarSesion }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));

    await page.goBack();

    // En un portátil compartido, esto es la diferencia entre haber salido y
    // dejar la lista de invitados a la vista de quien lo coja después.
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toHaveCount(0);
  });
});

test.describe("La caché del panel", () => {
  test("las pantallas del panel no se guardan en el navegador", async ({ request }) => {
    // Sin `no-store`, el navegador devuelve la pantalla desde su historial sin
    // volver a pedirla: ni el middleware ni RLS llegan a enterarse de que la
    // sesión ya no vale.
    //
    // Se pide sin seguir la redirección a propósito: lo que no puede quedarse
    // guardada es también la respuesta que echa a la puerta.
    for (const ruta of [RUTA_PANEL, RUTA_CUENTA]) {
      const respuesta = await request.get(ruta, { maxRedirects: 0 });
      expect(respuesta.headers()["cache-control"] ?? "", ruta).toContain("no-store");
    }
  });
});

/*
 * No hay aquí el test contrario —«la landing sí se cachea»— porque hoy sería
 * falso: la landing se sirve con `force-dynamic` y también sin caché. Fue una
 * decisión meditada y está explicada en `src/app/page.tsx`: cuando se cacheaba
 * una hora, un fallo puntual de la base dejaba la pantalla de «estamos
 * preparando la web» servida durante esa hora entera, y pasó en producción.
 */

/*
  AUDITORÍA DE DISEÑO · LA NAVEGACIÓN DEL PANEL.

  · En el móvil, la barra de abajo repartía su ancho a partes iguales: con
    trece módulos en 390 px, cada casilla tenía 28 px y los rótulos —que no se
    parten— se montaban unos encima de otros.
  · En escritorio, el lateral fijo no se desplazaba: con menos de ~750 px de
    alto, los últimos módulos quedaban fuera de la pantalla y no había forma de
    llegar a ellos.
*/
test.describe("La navegación del panel en pantallas pequeñas", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  async function entrar(page: import("@playwright/test").Page) {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
  }

  test("en el móvil cada rótulo de la barra se lee entero, y el módulo actual está a la vista", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page);
    const ultimo = MODULOS_ENTREGADOS.at(-1)!;
    await page.goto(ultimo.ruta);

    const barra = page.getByRole("navigation", { name: copy.panel.navegacion }).last();
    const enlaces = barra.getByRole("link");
    const medidas = await enlaces.evaluateAll((todos) =>
      todos.map((enlace) => ({
        sobra: enlace.scrollWidth - enlace.clientWidth,
        ancho: enlace.getBoundingClientRect().width,
      })),
    );
    for (const medida of medidas) {
      // Ningún rótulo se sale de su enlace ni queda en una casilla mínima.
      expect(medida.sobra).toBeLessThanOrEqual(1);
      expect(medida.ancho).toBeGreaterThanOrEqual(44);
    }

    const actual = barra.locator('[aria-current="page"]');
    await expect(actual).toBeInViewport();
  });

  test("en un portátil bajo, el lateral se desplaza y llega al último módulo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await entrar(page);

    const lateral = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    const ultimo = lateral.getByRole("link", {
      name: copy.panel.modulos[MODULOS_ENTREGADOS.at(-1)!.clave],
    });
    await ultimo.scrollIntoViewIfNeeded();
    await expect(ultimo).toBeInViewport();
    await ultimo.click();
    await expect(page).toHaveURL(new RegExp(MODULOS_ENTREGADOS.at(-1)!.ruta));
  });
});
