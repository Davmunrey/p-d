import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_PANEL,
  RUTA_PENDIENTES,
} from "../../src/config/constants";

/**
 * BODA-111 · Recordatorio a quien no ha contestado
 *
 * El criterio duro del ticket es «nunca alcanza a quien ya ha respondido, en
 * ninguna circunstancia», y la circunstancia que importa no es la obvia. La
 * obvia —no listar a quien ya contestó— la resuelve una consulta. La otra es
 * que entre abrir la lista y pulsar el botón pasan minutos, y en esos minutos
 * alguien contesta desde su móvil: ahí la lista ya está pintada, el botón sigue
 * ahí, y sólo la base puede negarse.
 *
 * Eso es lo que prueba el segundo test, y es la razón de que la comprobación
 * viva en `marcar_recordatorio()` y no en la pantalla.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;
const cadena = process.env.DATABASE_URL;

const MARCA = "(DES) E2E Pendientes";

async function entrar(pagina: Page) {
  await pagina.goto(RUTA_ACCESO);
  await pagina.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
  await pagina.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
  await pagina.getByRole("button", { name: copy.acceso.entrar }).click();
  await expect(pagina).toHaveURL(new RegExp(RUTA_PANEL));
}

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Un grupo sin contestar, con la invitación ya mandada.
 *
 * La fecha de envío se pone a mano porque sin ella el grupo sale en la lista
 * como «todavía no se le ha mandado nada» y no ofrece el botón de recordar,
 * que es justo lo que estos tests quieren ejercer.
 */
async function crearPendiente(sufijo: string): Promise<{ id: string; nombre: string }> {
  const nombre = `${MARCA} ${sufijo}`;
  return conBase(async (sql) => {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, huella_token, invitacion_enviada_en)
      values (${nombre}, public.huella_token(${`tok-pend-${sufijo}`}), now() - interval '7 days')
      returning id
    `;
    await sql`
      insert into public.invitados (grupo_id, nombre, apellidos)
      values (${grupo.id}, ${`(DES) Persona ${sufijo}`}, '(DES)')
    `;
    return { id: grupo.id, nombre };
  });
}

/** Contesta por todo el grupo, como haría el RSVP. */
async function contestar(grupoId: string) {
  await conBase(
    (sql) => sql`
      insert into public.confirmaciones
        (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento)
      select i.id, 'confirmado', 'publico', false, false
        from public.invitados as i
       where i.grupo_id = ${grupoId}
    `,
  );
}

test.describe.configure({ mode: "serial" });

test.describe("Quién no ha contestado", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test("se llega desde la lista de invitaciones", async ({ page }) => {
    await page.goto(RUTA_INVITADOS);
    await page.getByRole("link", { name: copy.panel.pendientes.enlaceDesdeLista }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PENDIENTES));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      copy.panel.pendientes.titulo,
    );
  });

  /**
   * EL CAMINO FELIZ. La lista trae a quien no ha contestado y a nadie más.
   */
  test("la lista contiene a los que no han contestado, y no a los que sí", async ({ page }) => {
    const sello = Date.now();
    const pendiente = await crearPendiente(`espera-${sello}`);
    const contestado = await crearPendiente(`contesto-${sello}`);
    await contestar(contestado.id);

    await page.goto(RUTA_PENDIENTES);

    await expect(page.getByRole("link", { name: pendiente.nombre })).toBeVisible();
    // Y quien ya contestó no aparece: es el criterio del ticket en su forma
    // más sencilla, la que resuelve la consulta.
    await expect(page.getByRole("link", { name: contestado.nombre })).toHaveCount(0);
  });

  /**
   * CASO DE ERROR · CONTESTAR ENTRE QUE SE ABRE LA LISTA Y SE PULSA EL BOTÓN.
   *
   * La pantalla ya está pintada y el botón sigue ahí: si la única guardia fuera
   * la consulta, este grupo recibiría un «¿nos confirmáis?» justo después de
   * haber confirmado. Se comprueba además que NO se abre WhatsApp — de nada
   * serviría negarse por dentro si el texto acabara igualmente delante de quien
   * organiza, que lo mandaría a mano.
   */
  test("quien contesta mientras miras la lista no recibe el recordatorio", async ({ page }) => {
    const grupo = await crearPendiente(`carrera-${Date.now()}`);

    await page.goto(RUTA_PENDIENTES);
    const fila = page.locator("li").filter({ hasText: grupo.nombre });
    await expect(fila).toBeVisible();

    // Contesta AHORA, con la lista ya delante.
    await contestar(grupo.id);

    let abrioWhatsApp = false;
    page.on("request", (peticion) => {
      if (peticion.url().startsWith("https://wa.me/")) abrioWhatsApp = true;
    });

    await fila.getByRole("button", { name: copy.panel.pendientes.recordarBoton }).click();

    // La base se niega, y la pantalla lo cuenta con nombre y apellidos.
    await expect(page.getByText(copy.panel.pendientes.errorYaContesto)).toBeVisible();
    expect(abrioWhatsApp, "no se abre WhatsApp cuando la base dice que no").toBe(false);

    // Y ya no está en la lista, porque ya no es un pendiente.
    await expect(page.getByRole("link", { name: grupo.nombre })).toHaveCount(0);

    // La fecha de recordatorio no se ha tocado: no se le mandó nada.
    const [fila2] = await conBase(
      (sql) => sql<{ recordatorio_enviado_en: Date | null }[]>`
        select recordatorio_enviado_en from public.grupos_invitacion where id = ${grupo.id}
      `,
    );
    expect(fila2.recordatorio_enviado_en).toBeNull();
  });

  test("recordar anota la fecha y abre WhatsApp con el mensaje", async ({ page }) => {
    const grupo = await crearPendiente(`recuerda-${Date.now()}`);

    await page.goto(RUTA_PENDIENTES);
    const fila = page.locator("li").filter({ hasText: grupo.nombre });

    const [peticion] = await Promise.all([
      page.waitForRequest((p) => p.url().startsWith("https://wa.me/")),
      fila.getByRole("button", { name: copy.panel.pendientes.recordarBoton }).click(),
    ]);

    // El texto sale de los copys y NO lleva enlace: meterlo obligaría a emitir
    // un token nuevo, y eso invalidaría el que la familia ya tiene.
    const texto = decodeURIComponent(peticion.url());
    expect(texto).toContain(copy.panel.pendientes.plantillaRecordatorio.slice(0, 30));
    expect(texto).not.toContain("/rsvp/");

    const [anotado] = await conBase(
      (sql) => sql<{ recordatorio_enviado_en: Date | null }[]>`
        select recordatorio_enviado_en from public.grupos_invitacion where id = ${grupo.id}
      `,
    );
    expect(
      anotado.recordatorio_enviado_en,
      "tiene que quedar anotado cuándo se recordó",
    ).not.toBeNull();
  });

  /**
   * CASO DE ERROR · Pasado el plazo no se recuerda, se llama.
   */
  test("con el plazo cerrado no hay botón, y se explica por qué", async ({ page }) => {
    await crearPendiente(`plazo-${Date.now()}`);

    const [original] = await conBase(
      (sql) => sql<{ fecha_limite_rsvp: Date | null }[]>`
        select fecha_limite_rsvp from public.configuracion_boda
      `,
    );

    try {
      await conBase(
        (sql) => sql`
          update public.configuracion_boda set fecha_limite_rsvp = now() - interval '1 day'
        `,
      );

      await page.goto(RUTA_PENDIENTES);
      await expect(page.getByText(copy.panel.pendientes.plazoCerradoAviso)).toBeVisible();
      await expect(
        page.getByRole("button", { name: copy.panel.pendientes.recordarBoton }),
      ).toHaveCount(0);
    } finally {
      await conBase(
        (sql) => sql`
          update public.configuracion_boda
             set fecha_limite_rsvp = ${original.fecha_limite_rsvp}
        `,
      );
    }
  });
});
