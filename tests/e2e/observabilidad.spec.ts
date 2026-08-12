import { expect, test, type Request } from "@playwright/test";
import postgres from "postgres";

import { RUTA_RSVP } from "../../src/config/constants";

/**
 * BODA-93 (#64) · QUE EL TOKEN NO SALGA DE AQUÍ
 *
 * Es el caso de error del ticket, escrito tal cual: «una URL de confirmación
 * con token nunca aparece entera en lo que se envía; se comprueba sobre el
 * payload».
 *
 * SE COMPRUEBA SOBRE EL TRÁFICO DE VERDAD Y NO SOBRE EL FILTRO. El filtro ya
 * tiene sus dieciséis tests unitarios —`tests/unidad/observabilidad.test.ts`— y
 * ahí se le pasan informes a mano. Aquí se abre una invitación real en un
 * navegador real y se mira TODO lo que sale por el cable hacia fuera. Es lo
 * único que caza el fallo de mañana: alguien añade una librería de mapas, o un
 * píxel, o un chat de soporte, y esa librería manda la URL entera sin pasar por
 * ningún filtro nuestro.
 *
 * POR QUÉ VALE AUNQUE NO HAYA NI SENTRY NI POSTHOG CONFIGURADOS. En CI no hay
 * claves, así que hoy no sale nada hacia terceros y el test pasa por vacío. No
 * sobra por eso: lo que vigila es que no aparezca un destino nuevo, y ese es
 * justo el cambio que nadie va a recordar comprobar. Un test que hoy no tiene
 * nada que mirar y mañana sí es lo contrario de un test que sobra.
 *
 * LO QUE NO SE PUEDE PROBAR AQUÍ, y conviene que quede escrito: «un error
 * provocado a propósito llega al panel de Sentry» necesita un proyecto de
 * Sentry de verdad, su DSN y un token de su API para volver a leerlo. Eso no
 * cabe en CI sin meter una credencial de un servicio externo en el repositorio.
 * Se comprueba a mano sobre el preview, y está apuntado en `docs/ENTORNO.md`.
 */

const cadena = process.env.DATABASE_URL;

/**
 * UN TOKEN POR TEST, Y NO UNO COMPARTIDO.
 *
 * `grupos_invitacion.huella_token` es único, y Playwright corre los tests de un
 * fichero EN PARALELO cuando hay más de un trabajador: dos tests sembrando la
 * misma invitación chocan con «duplicate key», y el fallo habla de un índice en
 * vez de de lo que se estaba probando. Se cayó así en el primer intento local.
 *
 * Con un sufijo por test no hay carrera posible y de paso cada uno se lleva su
 * propia limpieza.
 */
const NOMBRE_GRUPO = "(DES) Grupo observabilidad";

const tokenDe = (sufijo: string) => `desarrollo-e2e-obs-${sufijo}-000000`;
const nombreDe = (sufijo: string) => `${NOMBRE_GRUPO} ${sufijo}`;

async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** Una invitación de verdad, con su token. Devuelve el token. */
async function crearGrupo(sufijo: string): Promise<string> {
  const token = tokenDe(sufijo);

  await conBase(async (sql) => {
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, lado, invitado_a, maximo_acompanantes, huella_token)
      values (
        ${nombreDe(sufijo)}, 'ambos',
        array['ceremonia','banquete','fiesta']::public.evento_boda[], 0,
        public.huella_token(${token})
      )
      returning id
    `;
    await sql`
      insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
      values (${grupo.id}, ${"(DES) Nerea"}, '(DES)', false)
    `;
  });

  return token;
}

test.afterAll(async () => {
  if (!cadena) return;
  await conBase(
    (sql) => sql`delete from public.grupos_invitacion where nombre like ${`${NOMBRE_GRUPO}%`}`,
  );
});

/**
 * Todo lo que una petición lleva encima y podría contener el token: la URL, la
 * cabecera de procedencia y el cuerpo.
 *
 * EL `referer` ES EL SOSPECHOSO QUE SE OLVIDA. Un `fetch` a un tercero desde la
 * página del RSVP manda la URL de la página en esa cabecera por defecto, sin
 * que nadie escriba una línea. `next.config.ts` ya lo ata con
 * `Referrer-Policy: strict-origin-when-cross-origin` — y esto lo comprueba.
 */
function todoLoQueLleva(peticion: Request): string {
  const cabeceras = peticion.headers();
  return [
    peticion.url(),
    cabeceras.referer ?? "",
    cabeceras.origin ?? "",
    peticion.postData() ?? "",
  ].join("\n");
}

test.describe("Lo que sale hacia fuera", () => {
  test.skip(!cadena, "Necesita la base de datos para crear una invitación de verdad.");

  test("el token de una invitación no viaja a ningún tercero", async ({ page, baseURL }) => {
    const TOKEN = await crearGrupo("fugas");

    const nuestro = new URL(baseURL ?? "http://localhost:3000").host;
    const fugas: string[] = [];

    /*
      SE ESCUCHAN LAS PETICIONES, NO LAS RESPUESTAS: lo que importa es lo que
      MANDA el navegador. Una respuesta que contenga el token es normal —es
      nuestra propia página—; una petición que lo mande fuera, no.
    */
    const vigilar = (peticion: Request) => {
      if (new URL(peticion.url()).host === nuestro) return;
      if (todoLoQueLleva(peticion).includes(TOKEN)) {
        fugas.push(`${peticion.method()} ${peticion.url()}`);
      }
    };

    page.on("request", vigilar);

    await page.goto(`${RUTA_RSVP}/${TOKEN}`);
    await page.waitForLoadState("networkidle");

    // Se navega un poco: las trazas y los eventos de analítica suelen salir al
    // interactuar, no al cargar.
    await page.keyboard.press("Tab");
    await page.waitForTimeout(1000);

    page.off("request", vigilar);

    expect(
      fugas,
      "estas peticiones se llevaban el token de una invitación fuera de nuestro dominio",
    ).toEqual([]);
  });

  /**
   * Y LA CONTRAPARTIDA, para que el test de arriba no pase por estar mirando al
   * sitio equivocado: el token TIENE que aparecer en el tráfico con nuestro
   * propio servidor, porque es como se identifica la invitación.
   *
   * Sin esto, un cambio que rompiera la vigilancia —escuchar el evento que no
   * es, o filtrar por un host mal escrito— dejaría el test anterior en verde
   * para siempre y sin mirar nada.
   */
  test("y sí viaja a nuestro propio servidor, que es donde tiene que ir", async ({
    page,
    baseURL,
  }) => {
    const TOKEN = await crearGrupo("propio");

    const nuestro = new URL(baseURL ?? "http://localhost:3000").host;
    let visto = false;

    const vigilar = (peticion: Request) => {
      if (new URL(peticion.url()).host !== nuestro) return;
      if (todoLoQueLleva(peticion).includes(TOKEN)) visto = true;
    };

    page.on("request", vigilar);
    await page.goto(`${RUTA_RSVP}/${TOKEN}`);
    await page.waitForLoadState("networkidle");
    page.off("request", vigilar);

    expect(
      visto,
      "si el token no aparece ni siquiera aquí, el vigilante no está mirando el tráfico",
    ).toBe(true);
  });
});
