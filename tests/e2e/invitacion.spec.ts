import { expect, test } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_INVITACION, RUTA_RSVP_ANTIGUA } from "../../src/config/constants";

/**
 * EL ENLACE DE LA INVITACIÓN: SALUDA, Y ABRE LA CONFIRMACIÓN DEL GRUPO
 *
 * Cada grupo tiene su enlace. Lo que hace en la web:
 *
 *  - lleva a la portada, que saluda al grupo por su nombre y le enseña el
 *    campo de la playlist;
 *  - deja al final de la página, en vuestra estrella, el formulario de ESE
 *    grupo (el recorrido entero está en `confirmacion.spec.ts`);
 *  - sin enlace, la estrella sólo explica cómo se confirma: no hay formulario
 *    que rellenar a ciegas, y la cabecera no lleva a confirmar;
 *  - un enlace que no existe lleva a la portada de todos, sin decir de quién
 *    podría ser.
 */

const cadena = process.env.DATABASE_URL;
const MARCA = "(DES) Grupo enlace";

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** Un grupo con alguien dentro y un token conocido. */
async function crearGrupo(sufijo: string): Promise<{ token: string; nombre: string }> {
  const token = `desarrollo-enlace-${sufijo}-000000`;
  const nombre = `${MARCA} ${sufijo}`;
  await conBase(async (sql) => {
    await sql`delete from public.grupos_invitacion where nombre = ${nombre}`;
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, lado, maximo_acompanantes, huella_token)
      values (
        ${nombre}, 'ambos', 0,
        public.huella_token(${token})
      )
      returning id
    `;
    await sql`
      insert into public.invitados (grupo_id, nombre, apellidos)
      values (${grupo.id}, '(DES) Enlace', '(DES)')
    `;
  });
  return { token, nombre };
}

const saludoDe = (grupo: string) => copy.portada.saludo.replace("{grupo}", grupo);

test.describe("La sección de confirmar", () => {
  test("sin enlace, la estrella explica cómo se confirma, y no hay formulario", async ({
    page,
  }) => {
    await page.goto("/");
    const seccion = page.locator("#rsvp");
    test.skip((await seccion.count()) === 0, "La sección está apagada en la base");

    await expect(seccion.getByRole("heading", { level: 2 })).toHaveText(copy.rsvp.titulo);
    await seccion.locator("summary").click();
    await expect(seccion).toContainText(copy.rsvp.comoSeConfirma);
    await expect(seccion.locator("button, form, input")).toHaveCount(0);
    // Ya no se confirma por WhatsApp: que no quede ni la mención.
    await expect(seccion).not.toContainText(/whatsapp/i);
  });

  /** CASO DE ERROR · confirmar está al final, y nada de arriba se lo salta. */
  test("ni la cabecera ni la portada llevan a confirmar", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: copy.navegacion.secciones.rsvp, exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('a[href="#rsvp"]')).toHaveCount(0);
  });
});

test.describe("El enlace de la invitación", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para fabricar la invitación.");

  test.afterAll(async () => {
    if (!cadena) return;
    await conBase(
      (sql) => sql`delete from public.grupos_invitacion where nombre like ${`${MARCA}%`}`,
    );
  });

  test("lleva a la portada, saluda al grupo y abre la playlist", async ({ page, context }) => {
    const { token, nombre } = await crearGrupo("bueno");
    await page.goto(`${RUTA_INVITACION}/${token}`);

    // El token desaparece de la barra: se comparte la web, no la invitación.
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("#portada")).toContainText(saludoDe(nombre));
    await expect(
      page.locator("#playlist").getByLabel(copy.playlist.campoCancion),
    ).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === "boda:invitacion");
    expect(cookie?.httpOnly).toBe(true);
    // Y no viaja en el HTML: sólo en la cookie, que el navegador no deja leer.
    expect(await page.content()).not.toContain(token);
  });

  test("los enlaces que se repartieron con la forma vieja siguen valiendo", async ({
    page,
  }) => {
    const { token, nombre } = await crearGrupo("antiguo");
    await page.goto(`${RUTA_RSVP_ANTIGUA}/${token}`);

    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("#portada")).toContainText(saludoDe(nombre));
  });

  /** CASO DE ERROR · un enlace que no existe no saluda a nadie ni se recuerda. */
  test("un enlace que no existe lleva a la portada de todos", async ({ page, context }) => {
    await page.goto(`${RUTA_INVITACION}/enlace-que-no-existe-000000`);

    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("#portada")).not.toContainText(saludoDe(""));
    await expect(page.locator("#playlist")).toContainText(copy.playlist.sinInvitacion);
    expect((await context.cookies()).some((c) => c.name === "boda:invitacion")).toBe(false);
  });
});
