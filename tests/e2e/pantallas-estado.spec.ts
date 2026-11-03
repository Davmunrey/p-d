import postgres from "postgres";

import { expect, test } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import { RUTA_RETRATO_DE_ESTRELLAS } from "../../src/config/constants";

/**
 * LAS PANTALLAS DE ESTADO LLEVAN EL RETRATO, NO LA LIRA
 *
 * La 404, el error y «estamos preparando la web» llevaban la Lira encima del
 * titular. Los novios la quitaron de toda la web y en su lugar va su retrato
 * de estrellas, impreso como en la tarjeta del Save the Date y dibujándose al
 * llegar. Se prueba en la 404, que es la que se puede provocar, y en la ruta
 * de donde la pantalla de error saca las estrellas.
 *
 * Si la base no tiene ningún retrato publicado, se pone uno para la prueba y
 * se quita al acabar.
 */

const cadenaBase = process.env.DATABASE_URL;
const RUTA_INEXISTENTE = "/esta-pagina-no-existe-retrato";

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadenaBase!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

test.describe("El retrato en las pantallas de estado", () => {
  test.skip(!cadenaBase, "Hace falta DATABASE_URL para leer el retrato.");

  const RUTA_RETRATO = "retrato/e2e-pantallas-estado.png";
  let alternativo = "";

  test.beforeAll(async () => {
    await conBase(async (sql) => {
      const [primero] = await sql<{ alternativo: string }[]>`
        select texto_alternativo ->> 'es' as alternativo
          from public.medios
         where publicado and seccion = 'retrato' and tipo = 'imagen' and estrellas is not null
         order by orden nulls last, creado_en
         limit 1
      `;
      if (primero) {
        alternativo = primero.alternativo;
        return;
      }
      alternativo = "(DES) Retrato de prueba de las pantallas de estado";
      const estrellas = {
        proporcion: 0.9,
        estrellas: Array.from({ length: 60 }, (_, i) => {
          const angulo = (i / 60) * 2 * Math.PI;
          return [
            Number((0.5 + 0.45 * Math.cos(angulo)).toFixed(4)),
            Number((0.5 + 0.45 * Math.sin(angulo)).toFixed(4)),
            i % 10 === 0 ? 1 : 0.6,
          ];
        }),
      };
      await sql`
        insert into public.medios
          (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado, orden, ancho, alto, estrellas)
        select ${RUTA_RETRATO}, ${sql.json({ es: alternativo })}, 'retrato', 'imagen', true,
               coalesce(max(orden), -1) + 1, 900, 1000, ${sql.json(estrellas)}
          from public.medios where seccion = 'retrato'
      `;
    });
  });

  test.afterAll(async () => {
    if (!cadenaBase) return;
    await conBase(
      (sql) => sql`delete from public.medios where ruta_almacenamiento = ${RUTA_RETRATO}`,
    );
  });

  test("la 404 lleva el retrato sobre el titular, dibujado entero", async ({ page }) => {
    const respuesta = await page.goto(RUTA_INEXISTENTE);
    expect(respuesta?.status()).toBe(404);

    const dibujo = page.locator("[data-retrato-estado]");
    await expect(dibujo.locator("svg circle").first()).toBeAttached();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.errores.noEncontrado);

    // Encima del titular, no debajo.
    const caja = await dibujo.boundingBox();
    const titular = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(titular!.y);

    // Se dibuja al llegar y lo dibujado se queda.
    await expect
      .poll(() =>
        dibujo.evaluate((nodo) => Number(getComputedStyle(nodo).getPropertyValue("--trazado"))),
      )
      .toBe(1);

    // Ni rastro de la Lira: una constelación se reconoce por sus trazos.
    await expect(page.locator("main svg line")).toHaveCount(0);
  });

  /**
   * CASO DE ERROR / PRIVACIDAD. Una 404 la ve cualquiera, también un
   * rastreador, y el texto alternativo del retrato nombra a quien sale en la
   * foto. Aquí el dibujo es adorno: no se anuncia ni deja su nombre en la
   * página.
   */
  test("el retrato es adorno: no se anuncia ni deja el nombre de nadie", async ({ page }) => {
    await page.goto(RUTA_INEXISTENTE);
    await expect(page.locator("[data-retrato-estado]")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("main").getByRole("img")).toHaveCount(0);
    expect(await page.content()).not.toContain(alternativo);
  });

  test("la pantalla de error saca las estrellas de una ruta, sin el texto alternativo", async ({
    request,
  }) => {
    const respuesta = await request.get(RUTA_RETRATO_DE_ESTRELLAS);
    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()["cache-control"]).toMatch(/public/);

    const cuerpo = await respuesta.json();
    expect(cuerpo.proporcion).toBeGreaterThan(0);
    expect(cuerpo.estrellas.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(cuerpo).sort()).toEqual(["estrellas", "proporcion"]);
  });

  /** CASO DE ERROR. La ruta sólo se lee: escribir en ella no hace nada. */
  test("la ruta del retrato no acepta escrituras", async ({ request }) => {
    const respuesta = await request.post(RUTA_RETRATO_DE_ESTRELLAS, { data: {} });
    expect(respuesta.status()).toBe(405);
  });
});

/**
 * CON MOVIMIENTO REDUCIDO no se dibuja: está entero desde el primer
 * fotograma, sin animación que esperar.
 */
test.describe("El retrato en las pantallas de estado, sin movimiento", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test.skip(!cadenaBase, "Hace falta DATABASE_URL para leer el retrato.");

  test("sale entero y sin animación", async ({ page }) => {
    await page.goto(RUTA_INEXISTENTE);
    const dibujo = page.locator("[data-retrato-estado]");
    // Sin retrato en la base no hay dibujo y no hay nada que comprobar aquí.
    test.skip((await dibujo.count()) === 0, "No hay retrato publicado.");

    await expect(dibujo).toHaveCSS("animation-name", "none");
    expect(
      await dibujo.evaluate((nodo) =>
        Number(getComputedStyle(nodo).getPropertyValue("--trazado")),
      ),
    ).toBe(1);
  });
});
