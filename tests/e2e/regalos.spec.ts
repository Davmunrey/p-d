import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_CUENTA_REGALOS } from "../../src/config/constants";

/**
 * BODA-28 · El número de cuenta sólo se revela al pulsar
 *
 * EL CASO DE ERROR ES EL QUE JUSTIFICA EL TICKET, y es el que se comprueba
 * primero: que el IBAN **no esté en el HTML entregado**. Un número de cuenta
 * escrito en la página lo indexan los buscadores y lo recogen los rastreadores
 * sin que nadie la haya abierto. Con el número detrás de un botón, lo ve quien
 * mira la web y nada más.
 *
 * Se comprueba sobre el HTML crudo —`page.request.get("/")`— y no sobre lo que
 * se ve. Mirar la pantalla no valdría: un `display:none` esconde el número de
 * los ojos y lo deja intacto para cualquier rastreador.
 */

const cadena = process.env.DATABASE_URL;

/** Un IBAN de pruebas con la forma que exige la restricción de la tabla. */
const IBAN = "ES9121000418450200051332";
const TITULAR = "(DES) Paloma y David";

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/**
 * LO QUE HABÍA ANTES, PARA DEVOLVERLO.
 *
 * El seed trae un IBAN y la sección encendida, así que el menú de la landing
 * lleva «Regalos». Dejar esto a `null` al terminar tira esa entrada del menú y
 * rompe el test de navegación, que corre después — pasó. Es estado global: se
 * guarda al entrar y se restaura al salir, como con el plazo del RSVP.
 */
let anterior: { iban: string | null; titular: string | null } = { iban: null, titular: null };

test.describe.configure({ mode: "serial" });

test.describe("La sección de regalos", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL.");

  test.beforeAll(async () => {
    const [previo] = await conBase(
      (sql) => sql<{ iban_regalos: string | null; titular_cuenta: string | null }[]>`
        select iban_regalos, titular_cuenta from public.configuracion_privada
      `,
    );
    anterior = { iban: previo?.iban_regalos ?? null, titular: previo?.titular_cuenta ?? null };

    await conBase(async (sql) => {
      await sql`
        insert into public.configuracion_privada (iban_regalos, titular_cuenta)
        values (${IBAN}, ${TITULAR})
        on conflict (fila_unica) do update
          set iban_regalos = excluded.iban_regalos,
              titular_cuenta = excluded.titular_cuenta
      `;
      await sql`update public.secciones_landing set visible = true where seccion = 'regalos'`;
    });
  });

  test.afterAll(async () => {
    // Como estaba, no vacío: el seed trae un IBAN y hay tests que cuentan con él.
    await conBase(
      (sql) => sql`
        update public.configuracion_privada
           set iban_regalos = ${anterior.iban}, titular_cuenta = ${anterior.titular}
      `,
    );
  });

  /**
   * CASO DE ERROR · EL NÚMERO NO VIAJA EN EL HTML.
   */
  test("el IBAN no está en el HTML entregado antes de pulsar", async ({ page }) => {
    const respuesta = await page.request.get("/");
    const html = await respuesta.text();

    // La sección sí está: es lo que hace que la comprobación signifique algo.
    expect(html).toContain(copy.regalos.titulo);
    expect(html).toContain(copy.regalos.revelar);

    // Y el número no, ni entero ni troceado por el formato.
    expect(html, "el IBAN no puede viajar en el HTML de la landing").not.toContain(IBAN);
    expect(html).not.toContain(TITULAR);
  });

  test("al pulsar aparece el número, y se puede copiar", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");

    const seccion = page.locator("#regalos");
    await seccion.getByRole("button", { name: copy.regalos.revelar }).click();

    // Ahora sí: el número, su titular, y el botón de copiar.
    const campo = seccion.getByLabel(copy.regalos.etiquetaCuenta);
    await expect(campo).toHaveValue(IBAN);
    await expect(seccion.getByText(TITULAR)).toBeVisible();

    await seccion.getByRole("button", { name: copy.regalos.copiar }).click();
    await expect(seccion.getByRole("button", { name: copy.regalos.copiado })).toBeVisible();

    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado, "copiar tiene que dejar el IBAN en el portapapeles").toBe(IBAN);
  });

  /**
   * CASO DE ERROR · Sin cuenta configurada no hay sección ni ruta que valga.
   */
  test("sin IBAN, ni sección ni número", async ({ page }) => {
    await conBase((sql) => sql`update public.configuracion_privada set iban_regalos = null`);

    const html = await (await page.request.get("/")).text();
    expect(html).not.toContain(copy.regalos.revelar);

    // Y la ruta tampoco lo suelta: la base devuelve cero filas y esto es un 404.
    const cuenta = await page.request.get(RUTA_CUENTA_REGALOS);
    expect(cuenta.status()).toBe(404);

    // Se devuelve para los tests siguientes del fichero.
    await conBase((sql) => sql`update public.configuracion_privada set iban_regalos = ${IBAN}`);
  });
});
