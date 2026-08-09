import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";

/**
 * BODA-09 · La web se recupera sola cuando la base vuelve
 *
 * El fallo que motiva esto pasó en producción: un despliegue sin
 * `DATABASE_URL` horneó la pantalla de «estamos preparando la web» y la sirvió
 * cacheada una hora entera. La base podía haber vuelto a los diez segundos.
 *
 * Aquí se prueba el comportamiento entero contra la base real: se le quita el
 * permiso de lectura a `anon` —que es exactamente lo que ve la web cuando la
 * base no le responde—, se comprueba que la página lo dice en vez de romperse,
 * se devuelve el permiso y se comprueba que **la visita siguiente ya enseña los
 * datos**, sin esperar a que expire ninguna caché.
 *
 * TODO EL FICHERO EN SERIE. Se toca un permiso que afecta a toda la base, así
 * que dos tests de este fichero no pueden solaparse. Entre ficheros distintos
 * el aislamiento lo da el CI, que corre con un único worker; en local, con
 * paralelismo, este fichero conviene lanzarlo solo.
 */

test.describe.configure({ mode: "serial" });

const cadena = process.env.DATABASE_URL;

test.skip(!cadena, "Hace falta DATABASE_URL para simular la caída.");

async function conPermisoDeLectura(permitido: boolean) {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    if (permitido) {
      await sql`grant select on public.v_configuracion_publica to anon`;
    } else {
      await sql`revoke select on public.v_configuracion_publica from anon`;
    }
  } finally {
    await sql.end();
  }
}

test.afterAll(async () => {
  if (cadena) await conPermisoDeLectura(true);
});

test("con la base sin responder, la landing lo dice en lugar de romperse", async ({ page }) => {
  try {
    await conPermisoDeLectura(false);

    const respuesta = await page.goto("/");

    // Ni un 500 ni una página en blanco: la web sigue en pie y es honesta.
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.portada.enPreparacion,
    );
    // Y no se inventa nada para tapar el hueco.
    await expect(page.locator("body")).not.toContainText("(DES)");
  } finally {
    await conPermisoDeLectura(true);
  }
});

test("en cuanto la base vuelve, la siguiente visita ya trae los datos", async ({ page }) => {
  // Sin esperar a que caduque nada: es justo lo que no pasaba antes.
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("(DES)");
  await expect(
    page.getByRole("navigation", { name: copy.navegacion.etiquetaPrincipal }),
  ).toBeVisible();
});

test("la reserva de fecha también aguanta la caída", async ({ page }) => {
  try {
    await conPermisoDeLectura(false);

    const respuesta = await page.goto("/reserva-la-fecha");

    // Estado de reserva y no 404: la página existe, es la base la que calla.
    // Un 404 diría algo falso.
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.portada.enPreparacion,
    );
  } finally {
    await conPermisoDeLectura(true);
  }
});

test("el calendario devuelve 503, no 404, cuando la base calla", async ({ request }) => {
  try {
    await conPermisoDeLectura(false);

    const respuesta = await request.get("/reserva-la-fecha/evento.ics");

    // Un 404 le diría a un cliente de calendario que el evento ya no existe, y
    // hay clientes que lo borran del calendario del invitado.
    expect(respuesta.status()).toBe(503);
    expect(respuesta.headers()["retry-after"]).toBeDefined();
  } finally {
    await conPermisoDeLectura(true);
  }
});
