import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import { RUTA_ACCESO, RUTA_PANEL, RUTA_RSVP } from "../../src/config/constants";
import { MODULOS_ENTREGADOS } from "../../src/config/modulos";
import { seguirLaPista } from "./utiles/rastro";

/**
 * BODA-91 · AUDITORÍA DE ACCESIBILIDAD, BLOQUEANTE
 *
 * A una boda va gente mayor y gente con problemas de vista. La landing es para
 * ellos tanto como para los demás, y el panel se usará la víspera con prisa y
 * con el móvil: nada de esto es opcional.
 *
 * Tres frentes:
 *   1. axe sobre la landing y las páginas públicas.
 *   2. El flujo de confirmación COMPLETO usando solo el teclado, que es la
 *      prueba que no puede fallar: si un invitado no puede confirmar, el
 *      resto de la auditoría da igual.
 *   3. axe sobre TODOS los módulos entregados del panel — la lista sale de
 *      `MODULOS_ENTREGADOS`, así que un módulo nuevo entra en la auditoría
 *      solo, sin que nadie tenga que acordarse.
 *
 * El listón: CERO violaciones críticas o serias. Las menores se enseñan en el
 * registro pero no bloquean — el día que estén a cero, se sube el listón.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) Grupo a11y";

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** Los mismos pasos que el spec del RSVP: un grupo de usar y tirar con token conocido. */
async function crearGrupo(sufijo: string, personas: string[]): Promise<string> {
  const token = `desarrollo-a11y-${sufijo}-000000`;
  await conBase(async (sql) => {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
      values (
        ${`${MARCA} ${sufijo}`}, 'ambos',
        array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
        public.huella_token(${token})
      )
      returning id
    `;
    for (const nombre of personas) {
      await sql`
        insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
        values (${grupo.id}, ${nombre}, '(DES)', false)
      `;
    }
  });
  return token;
}

test.afterAll(async () => {
  if (!cadena) return;
  await conBase(
    (sql) => sql`delete from public.grupos_invitacion where nombre like ${`${MARCA}%`}`,
  );
});

/**
 * Pasa axe y falla con un informe legible si hay algo crítico o serio.
 *
 * El informe enumera regla, impacto y los primeros nodos afectados: el fallo
 * de CI tiene que decir QUÉ arreglar sin abrir la traza.
 */
async function auditar(pagina: Page, donde: string) {
  const resultado = await new AxeBuilder({ page: pagina }).analyze();

  const graves = resultado.violations.filter(
    (violacion) => violacion.impact === "critical" || violacion.impact === "serious",
  );

  const informe = graves
    .map(
      (violacion) =>
        `[${violacion.impact}] ${violacion.id}: ${violacion.help}\n` +
        violacion.nodes
          .slice(0, 5)
          .map((nodo) => `    ${nodo.target.join(" ")}`)
          .join("\n"),
    )
    .join("\n\n");

  expect(graves, `Violaciones graves de accesibilidad en ${donde}:\n\n${informe}`).toEqual([]);
}

/**
 * Lleva el foco hasta el primer elemento que case con el selector (y, si se
 * da, con el texto), a golpe de tabulador. Si no llega, el fallo lo dice: eso
 * ES un fallo de accesibilidad — el elemento no se alcanza con teclado.
 */
async function tabularHasta(pagina: Page, selector: string, texto?: string, tope = 60) {
  for (let intento = 0; intento < tope; intento++) {
    const coincide = await pagina.evaluate(
      ([sel, txt]) => {
        const activo = document.activeElement;
        if (!activo || !activo.matches(sel!)) return false;
        if (txt && !(activo.textContent ?? "").includes(txt)) return false;
        return true;
      },
      [selector, texto ?? ""] as const,
    );
    if (coincide) return;
    await pagina.keyboard.press("Tab");
  }
  throw new Error(
    `El foco nunca llegó a ${selector}${texto ? ` («${texto}»)` : ""}: ` +
      "ese control no se alcanza con el teclado.",
  );
}

test.describe("Accesibilidad de la parte pública", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL: la landing se audita con su contenido real.");
  test.beforeEach(({ page }) => seguirLaPista(page));

  test("la landing pasa axe sin violaciones graves", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await auditar(page, "la landing");
  });

  test("la página de reserva la fecha pasa axe", async ({ page }) => {
    await page.goto("/reserva-la-fecha");
    await page.waitForLoadState("networkidle");
    await auditar(page, "/reserva-la-fecha");
  });

  test("la invitación pasa axe en cada paso", async ({ page }) => {
    const token = await crearGrupo("axe", ["(DES) Blas", "(DES) Sole"]);
    await page.goto(`${RUTA_RSVP}/${token}`);
    await auditar(page, "el paso de asistencia del RSVP");
  });
});

test.describe("El flujo de confirmación, solo con teclado", () => {
  test.skip(!cadena, "Hace falta DATABASE_URL para fabricar la invitación.");
  test.beforeEach(({ page }) => seguirLaPista(page));

  test("se confirma de principio a fin sin tocar el ratón", async ({ page }) => {
    test.slow();
    const token = await crearGrupo("teclado", ["(DES) Rita", "(DES) Manu"]);

    await page.goto(`${RUTA_RSVP}/${token}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(MARCA);

    // Paso 1 · asistencia. Los radios se agrupan por persona: espacio marca
    // «sí» en el primero del grupo y el tabulador salta al grupo siguiente.
    await tabularHasta(page, 'input[type="radio"]');
    await page.keyboard.press("Space");
    await tabularHasta(page, 'input[type="radio"]:not(:checked)');
    await page.keyboard.press("Space");
    await tabularHasta(page, "button", copy.rsvp.siguiente);
    await page.keyboard.press("Enter");

    // Paso 2 · detalles. Los menús por defecto valen: lo que se prueba es que
    // el teclado atraviesa el paso, no cada combinación.
    await expect(page.getByText(copy.rsvp.pasoDetallesTitulo)).toBeVisible();
    await tabularHasta(page, "button", copy.rsvp.siguiente);
    await page.keyboard.press("Enter");

    // Paso 3 · enviar.
    await tabularHasta(page, "button", copy.rsvp.enviar);
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.rsvp.graciasSi);

    // Y la base lo confirma: dos personas, confirmadas de verdad.
    const confirmadas = await conBase(
      (sql) => sql<{ cuantos: string }[]>`
        select count(*) as cuantos
          from public.confirmaciones as c
          join public.invitados as i on i.id = c.invitado_id
          join public.grupos_invitacion as g on g.id = i.grupo_id
         where g.nombre = ${`${MARCA} teclado`}
           and c.es_vigente and c.estado = 'confirmado'
      `,
    );
    expect(Number(confirmadas[0].cuantos)).toBe(2);
  });
});

test.describe("Accesibilidad del panel", () => {
  test.slow();
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA || !cadena,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );
  test.beforeEach(({ page }) => seguirLaPista(page));

  async function entrar(pagina: Page) {
    await pagina.goto(RUTA_ACCESO);
    await pagina.getByLabel(copy.acceso.correo, { exact: true }).fill(CORREO_CON_ACCESO!);
    await pagina.getByLabel(copy.acceso.contrasena, { exact: true }).fill(CONTRASENA!);
    await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
  }

  test("todos los módulos entregados pasan axe", async ({ page }) => {
    await entrar(page);

    for (const modulo of MODULOS_ENTREGADOS) {
      await page.goto(modulo.ruta);
      await page.waitForLoadState("networkidle");
      await auditar(page, `el módulo «${modulo.clave}» (${modulo.ruta})`);
    }
  });
});
