import { expect, test } from "@playwright/test";

import {
  CLS_MAXIMO,
  IMAGENES_PRIORITARIAS_MAXIMO,
  PESO_MAXIMO_PAGINA_KB,
} from "../../src/config/constants";

/**
 * BODA-90 · RENDIMIENTO DE LA LANDING, COMPROBADO EN CI
 *
 * La landing se abre desde datos móviles, muchas veces con la cobertura del
 * pueblo donde es la boda. Aquí se vigila lo que de verdad protege eso:
 *
 *   1. El PESO: lo que viaja por la red al abrir la portada, contra el
 *      presupuesto de `PESO_MAXIMO_PAGINA_KB`.
 *   2. Las DIMENSIONES: toda imagen declara su hueco: sin `width`/`height`
 *      (o el modo `fill` de next/image), la página salta al cargar.
 *   3. El CLS medido de verdad, recorriendo la página entera.
 *   4. La CARGA DIFERIDA: solo lo del primer pantallazo se pide por
 *      adelantado.
 *
 * Lighthouse como cifra única no corre aquí: en el hardware compartido de CI
 * la puntuación baila con la máquina, no con el código. Lo que Lighthouse
 * mide de la página —peso, saltos, carga diferida— está cubierto abajo con
 * umbrales deterministas.
 */

const cadena = process.env.DATABASE_URL;

test.describe("El peso y la estabilidad de la landing", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing se mide con su contenido real.");

  test("entra en el presupuesto de peso", async ({ page }) => {
    let bytes = 0;

    page.on("response", async (respuesta) => {
      /*
        Se suma lo TRANSFERIDO (comprimido), que es lo que paga el invitado.
        `sizes()` no está disponible para todas las peticiones (las que
        fallan, las de caché); las que no lo den, se estiman por el cuerpo.
      */
      try {
        const medidas = await respuesta.request().sizes();
        bytes += medidas.responseBodySize + medidas.responseHeadersSize;
      } catch {
        try {
          bytes += (await respuesta.body()).length;
        } catch {
          // Peticiones abortadas o sin cuerpo: no pesan.
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const kilobytes = Math.round(bytes / 1024);
    expect(
      kilobytes,
      `La portada pesa ${kilobytes} KB y el presupuesto es ${PESO_MAXIMO_PAGINA_KB} KB. ` +
        "Antes de subir el presupuesto, mirar qué lo ha engordado.",
    ).toBeLessThanOrEqual(PESO_MAXIMO_PAGINA_KB);
  });

  test("toda imagen declara su hueco", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Y se recorre entera: las secciones de abajo también cuentan.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");

    const sinHueco = await page.$$eval("img", (imagenes) =>
      imagenes
        .filter((imagen) => {
          const declaraMedidas = imagen.hasAttribute("width") && imagen.hasAttribute("height");
          // El modo `fill` de next/image reserva el hueco desde el contenedor.
          const esFill = getComputedStyle(imagen).position === "absolute";
          return !declaraMedidas && !esFill;
        })
        .map((imagen) => imagen.getAttribute("src") ?? imagen.outerHTML.slice(0, 120)),
    );

    expect(
      sinHueco,
      "Estas imágenes no declaran width/height ni usan fill, y harán saltar la página al cargar:",
    ).toEqual([]);
  });

  test("la página no pega saltos mientras carga", async ({ page }) => {
    await page.addInitScript(() => {
      const ventana = window as typeof window & { __cls: number };
      ventana.__cls = 0;
      new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries() as PerformanceEntry[]) {
          const salto = entrada as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!salto.hadRecentInput) ventana.__cls += salto.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Se baja despacio, como un invitado: los saltos aparecen al entrar cada
    // sección en pantalla, no en la portada.
    await page.evaluate(async () => {
      const paso = window.innerHeight / 2;
      for (let y = 0; y < document.body.scrollHeight; y += paso) {
        window.scrollTo(0, y);
        await new Promise((listo) => setTimeout(listo, 120));
      }
    });

    // Nada de `networkidle` aquí: el vídeo del paisaje sigue descargando en
    // bucle y la red no se calla nunca. Medio segundo da tiempo a que el
    // observador anote los últimos saltos, que es lo único que se espera.
    await page.waitForTimeout(500);

    const cls = await page.evaluate(() => (window as typeof window & { __cls: number }).__cls);
    expect(
      cls,
      `El CLS medido es ${cls.toFixed(3)} y el tope es ${CLS_MAXIMO}. ` +
        "Buscar qué imagen o sección entra sin hueco reservado.",
    ).toBeLessThan(CLS_MAXIMO);
  });

  test("solo lo del primer pantallazo se pide por adelantado", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ansiosas = await page.$$eval("img", (imagenes) =>
      imagenes
        .filter((imagen) => imagen.getAttribute("loading") !== "lazy")
        .map((imagen) => imagen.getAttribute("src") ?? "(sin src)"),
    );

    expect(
      ansiosas.length,
      `Hay ${ansiosas.length} imágenes cargándose por adelantado (tope: ` +
        `${IMAGENES_PRIORITARIAS_MAXIMO}). Deberían llevar carga diferida:\n${ansiosas.join("\n")}`,
    ).toBeLessThanOrEqual(IMAGENES_PRIORITARIAS_MAXIMO);
  });
});
