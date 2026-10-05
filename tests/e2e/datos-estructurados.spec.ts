import { expect, test, type Page } from "./utiles/origen-propio";

import postgres from "postgres";

import { conSeccionApagada } from "./utiles/secciones";

/**
 * BODA-92 · LOS DATOS ESTRUCTURADOS DICEN LO MISMO QUE LA PÁGINA, Y NADA MÁS
 *
 * El bloque `application/ld+json` es lo que leen los buscadores y los
 * asistentes de voz. Su propia cabecera promete no publicar nada que no esté
 * ya a la vista, y se rompía justo donde más importa: con «Cómo llegar»
 * apagado —que es como los novios esconden dónde es la boda mientras no
 * quieren anunciarlo—, la página dejaba de enseñar la dirección y el mapa, y
 * el bloque los seguía llevando.
 */

const cadena = process.env.DATABASE_URL;

type Evento = {
  name: string;
  startDate: string;
  location?: {
    name: string;
    address?: { streetAddress: string };
    geo?: { latitude: number; longitude: number };
  };
};

/** El bloque tal cual lo entrega el servidor, sin pasar por el navegador. */
async function datosDeLaPortada(page: Page): Promise<Evento> {
  const respuesta = await page.request.get("/");
  expect(respuesta.status()).toBe(200);
  const html = await respuesta.text();
  const bloque = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(bloque, "la portada tiene que llevar su bloque de datos estructurados").not.toBeNull();
  return JSON.parse(bloque![1]!) as Evento;
}

async function configuracion() {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [fila] = await sql<
      {
        direccion: string | null;
        ciudad: string | null;
        latitud: number | null;
        longitud: number | null;
      }[]
    >`
      select direccion_ceremonia as direccion, ciudad_ceremonia as ciudad,
             latitud_ceremonia as latitud, longitud_ceremonia as longitud
        from public.configuracion_boda
    `;
    return fila!;
  } finally {
    await sql.end();
  }
}

test.describe("Datos estructurados de la portada", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: el bloque sale de la base real.");

  test("con «Cómo llegar» publicado, llevan la dirección y el punto del mapa de la base", async ({
    page,
  }) => {
    const base = await configuracion();
    expect(base.direccion, "el seed tiene que traer una dirección").toBeTruthy();
    expect(base.latitud, "y unas coordenadas").not.toBeNull();

    const evento = await datosDeLaPortada(page);
    expect(evento.location?.address?.streetAddress).toBe(base.direccion);
    expect(evento.location?.geo?.latitude).toBe(Number(base.latitud));
    expect(evento.location?.geo?.longitude).toBe(Number(base.longitud));
  });

  test("con «Cómo llegar» apagado, no publican ni la dirección ni las coordenadas", async ({
    page,
  }) => {
    const base = await configuracion();
    // La portada enseña la dirección cuando no hay ciudad: con ciudad, la
    // única que la enseñaba era «Cómo llegar».
    expect(base.ciudad, "el seed tiene que traer la ciudad").toBeTruthy();

    await conSeccionApagada("transporte", async () => {
      // El texto que se lee, no el HTML: el HTML lleva dentro el propio bloque
      // que se está probando. `innerText` deja fuera los `<script>`.
      await page.goto("/");
      await expect(
        page.locator("body"),
        "la página ya no enseña la dirección",
      ).not.toContainText(base.direccion!, { useInnerText: true });

      const evento = await datosDeLaPortada(page);
      // Lo que sí está a la vista sigue: quién, cuándo y el nombre del sitio.
      expect(evento.name).toBeTruthy();
      expect(evento.startDate).toBeTruthy();
      expect(evento.location?.address).toBeUndefined();
      expect(evento.location?.geo).toBeUndefined();
    });
  });
});
