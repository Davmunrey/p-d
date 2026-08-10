import { expect, test } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { conSeccionApagada, fijarSeccionVisible } from "./utiles/secciones";

/**
 * BODA-37/38 · Regalos y dress code
 *
 * Las dos últimas secciones de la entrega. Se prueban juntas porque comparten
 * lo que de verdad hay que demostrar: que salen de la base y no del código.
 *
 * LO IMPORTANTE ES EL CASO DE ERROR, y aquí no es un formulario mal
 * rellenado: es un IBAN publicado sin querer. La sección de regalos nace
 * apagada en producción, y apagarla tiene que quitar la cuenta de la web —del
 * HTML, no de la vista— y también su enlace del menú. Eso es lo que comprueba
 * el último test, y es la razón de que este fichero toque la base de datos.
 */

const cadena = process.env.DATABASE_URL;

test.describe.configure({ mode: "serial" });

test.skip(!cadena, "Hace falta DATABASE_URL: estas secciones salen de la base.");

/** El IBAN que el seed deja puesto, leído de la base y no escrito aquí. */
async function ibanDelEntorno(): Promise<string> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [fila] = await sql<{ iban_regalos: string }[]>`
      select iban_regalos from public.configuracion_privada
    `;
    return fila.iban_regalos;
  } finally {
    await sql.end();
  }
}

test.afterAll(async () => {
  // Se deja como estaba: el resto de la suite da por hecho el entorno del seed.
  if (cadena) await fijarSeccionVisible("regalos", true);
});

test("los regalos enseñan la cuenta que hay en la base, no una escrita a mano", async ({
  page,
}) => {
  const iban = await ibanDelEntorno();

  await page.goto("/");

  const regalos = page.locator("#regalos");
  await expect(regalos.getByRole("heading", { level: 2 })).toHaveText(copy.regalos.titulo);

  // Primero «vuestra presencia», y después la cuenta. Al revés, una invitación
  // se lee como una petición.
  await expect(regalos).toContainText(copy.regalos.etiqueta);
  await expect(regalos).toContainText(copy.regalos.descripcion);

  // La cuenta va en un campo de sólo lectura: así se selecciona entera de una
  // pasada, con JavaScript o sin él.
  const campo = regalos.getByLabel(copy.regalos.etiquetaCuenta);
  await expect(campo).toHaveValue(iban);

  await expect(regalos).toContainText(copy.regalos.buzon);
});

test("el dress code sale de la tabla, con un bloque por consejo", async ({ page }) => {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  const consejos = await sql<{ titulo: string; texto: string }[]>`
    select titulo, texto from public.consejos_vestimenta where publicado order by orden
  `;
  await sql.end();

  // Si la tabla está vacía la sección no se pinta, y este test no tendría nada
  // que decir. Es un fallo de preparación, no del producto.
  expect(consejos.length, "el seed tiene que traer consejos de vestimenta").toBeGreaterThan(0);

  await page.goto("/");

  const dresscode = page.locator("#dresscode");
  await expect(dresscode.getByRole("heading", { level: 2 })).toHaveText(copy.dresscode.titulo);
  await expect(dresscode).toContainText(copy.dresscode.descripcion);

  for (const consejo of consejos) {
    await expect(dresscode.getByRole("heading", { name: consejo.titulo })).toBeVisible();
    await expect(dresscode).toContainText(consejo.texto);
  }
});

/**
 * CASO DE ERROR. Apagar la sección tiene que quitar el IBAN del HTML.
 *
 * No basta con que no se vea: si el número sigue en la respuesta, está
 * publicado. Por eso se mira el HTML entregado y no la pantalla — y por eso la
 * base sólo lo deja salir por `datos_para_regalos()`, que comprueba la misma
 * condición que este test.
 */
test("con la sección apagada, el IBAN no está ni en el HTML ni en el menú", async ({
  page,
  request,
}) => {
  const iban = await ibanDelEntorno();

  // Encendida, está.
  const encendida = await request.get("/");
  expect(await encendida.text()).toContain(iban);

  await conSeccionApagada("regalos", async () => {
    const apagada = await request.get("/");
    const html = await apagada.text();

    expect(html, "el IBAN sigue publicado con la sección apagada").not.toContain(iban);
    expect(html).not.toContain(copy.regalos.titulo);

    // Y el menú tampoco ofrece un enlace a una sección que ya no está.
    await page.goto("/");
    await expect(page.locator("#regalos")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: copy.navegacion.secciones.regalos }),
    ).toHaveCount(0);
  });
});
