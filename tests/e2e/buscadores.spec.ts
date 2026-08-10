import { expect, test } from "@playwright/test";
import postgres from "postgres";

import { RUTA_ACCESO, RUTA_PANEL, RUTA_RSVP } from "../../src/config/constants";

/**
 * BODA-92 · Buscadores: lo público sí, lo privado no
 *
 * LO QUE DE VERDAD PROTEGE ES LA CABECERA, y por eso se prueba aparte. Un
 * `robots.txt` es una petición que cada rastreador decide si respeta; los que
 * van a por datos personales no la respetan. `X-Robots-Tag` es una
 * instrucción, y detrás de ella están el middleware y RLS.
 *
 * El sitemap se prueba por lo que NO lleva. Que contenga la portada es fácil;
 * lo que arruinaría una boda es que enumerara los enlaces de invitación, que
 * llevan un token dentro y son de una familia cada uno.
 */

const cadena = process.env.DATABASE_URL;

test.describe("Lo privado no se indexa", () => {
  /*
    Las rutas que no pueden acabar en un buscador. Se listan por lo que son y
    no por un patrón: `/cocina` no comparte prefijo con ninguna, y una
    expresión que las cubriera todas escondería justo eso.
  */
  const PRIVADAS = [RUTA_PANEL, `${RUTA_PANEL}/invitados`, RUTA_ACCESO, "/cocina"];

  for (const ruta of PRIVADAS) {
    test(`${ruta} responde con noindex en la cabecera`, async ({ request }) => {
      const respuesta = await request.get(ruta, { maxRedirects: 0 });
      expect(respuesta.headers()["x-robots-tag"] ?? "").toContain("noindex");
    });
  }

  test("un enlace de invitación tampoco, exista o no", async ({ request }) => {
    // Con token inventado: si sólo se protegieran los válidos, bastaría con
    // probar cadenas para saber cuáles lo son.
    const respuesta = await request.get(`${RUTA_RSVP}/token-que-no-existe-000000`);
    expect(respuesta.headers()["x-robots-tag"] ?? "").toContain("noindex");
  });

  test("el robots.txt lo pide además, por si acaso", async ({ request }) => {
    const texto = await (await request.get("/robots.txt")).text();

    expect(texto).toContain(`Disallow: ${RUTA_PANEL}/`);
    expect(texto).toContain(`Disallow: ${RUTA_RSVP}/`);
    expect(texto).toContain("Disallow: /cocina");
  });
});

test.describe("El sitemap", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: las páginas salen de la base.");

  test("lleva la portada y no lleva ni un enlace de invitación", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();

    expect(xml).toContain("<urlset");

    /*
      LO QUE NO PUEDE ESTAR. Un sitemap con enlaces de invitación los publica:
      son URLs con un token dentro, y cada una abre los datos de una familia.
      Se comprueba por el prefijo de la ruta, no por un token concreto, porque
      lo que no puede aparecer es la sección entera.
    */
    expect(xml, "el sitemap no puede enumerar invitaciones").not.toContain(`${RUTA_RSVP}/`);
    expect(xml).not.toContain(RUTA_PANEL);
    expect(xml).not.toContain(RUTA_ACCESO);
  });

  /**
   * CASO DE ERROR · Una sección apagada no se ofrece a los buscadores.
   *
   * `reserva_la_fecha` es una página propia y su ruta devuelve 404 cuando la
   * sección está apagada. Un sitemap escrito a mano la citaría igual y mandaría
   * a los buscadores contra una página que no existe.
   */
  test("una página apagada no aparece", async ({ request }) => {
    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    const [previo] = await sql<{ visible: boolean }[]>`
      select visible from public.secciones_landing where seccion = 'reserva_la_fecha'
    `;

    try {
      await sql`
        update public.secciones_landing set visible = false where seccion = 'reserva_la_fecha'
      `;
      const xml = await (await request.get("/sitemap.xml")).text();
      expect(xml).not.toContain("/reserva-la-fecha");
    } finally {
      await sql`
        update public.secciones_landing
           set visible = ${previo?.visible ?? true}
         where seccion = 'reserva_la_fecha'
      `;
      await sql.end();
    }
  });
});

test.describe("Los datos estructurados del evento", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la fecha sale de la base.");

  test("dicen la fecha que hay en la base, no una escrita a mano", async ({
    page,
    request,
  }) => {
    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    const [boda] = await sql<{ fecha_hora_ceremonia: Date }[]>`
      select fecha_hora_ceremonia from public.configuracion_boda
    `;
    await sql.end();

    await page.goto("/");
    const bruto = await page.locator('script[type="application/ld+json"]').textContent();
    const datos = JSON.parse(bruto!) as { "@type": string; startDate: string };

    expect(datos["@type"]).toBe("Event");
    expect(new Date(datos.startDate).getTime()).toBe(boda.fecha_hora_ceremonia.getTime());

    // Y no se cuela nada privado: los datos estructurados son lo más fácil de
    // recolectar de toda la página.
    expect(bruto).not.toContain(RUTA_RSVP);
    const html = await (await request.get("/")).text();
    expect(html).toContain("application/ld+json");
  });
});
