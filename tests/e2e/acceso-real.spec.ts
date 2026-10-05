import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "./utiles/origen-propio";
import postgres from "postgres";

import copy from "../../content/copy.es.json";
import {
  PARAMETRO_VOLVER,
  RUTA_ACCESO,
  RUTA_CONFIRMAR_ACCESO,
  RUTA_NUEVA_CONTRASENA,
  RUTA_PANEL,
  RUTA_RECUPERAR,
} from "../../src/config/constants";

/**
 * BODA-40 · El recorrido completo, contra un Supabase de verdad
 *
 * Lo que `acceso.spec.ts` no puede probar: identificarse de verdad y entrar.
 * Hace falta GoTrue funcionando, así que este fichero solo corre en el trabajo
 * de CI que levanta el Supabase local.
 *
 * Se salta en cualquier otro sitio en lugar de fallar: un test que no puede
 * ejecutarse no es un test roto.
 *
 * ENTRAR, ESTAR Y SALIR VAN EN UN SOLO TEST, y no es por pereza. Cada test de
 * Playwright estrena navegador: contexto nuevo, cookies vacías. Repartir el
 * recorrido en tres dejaba al segundo sin la sesión que abrió el primero, y el
 * fallo —«el panel me echa»— parecía de la aplicación cuando era del test.
 * Una sesión es una sola historia y se cuenta seguida.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CORREO_SIN_ACCESO = process.env.CORREO_SIN_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

test.describe("Acceso de verdad", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CORREO_SIN_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  async function identificarse(
    page: import("@playwright/test").Page,
    correo: string,
    contrasena = CONTRASENA!,
  ) {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(correo);
    await page.getByLabel(copy.acceso.contrasena).fill(contrasena);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
  }

  test("entrar, seguir dentro y salir de verdad", async ({ page }) => {
    await identificarse(page, CORREO_CON_ACCESO!);

    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toBeVisible();

    // La sesión aguanta una recarga: vive en la cookie, no en la memoria de la
    // pestaña.
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));

    // Y con sesión, la puerta deja de tener sentido: lleva dentro en lugar de
    // volver a pedir lo que ya se ha dado.
    await page.goto(RUTA_ACCESO);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));

    await page.getByRole("button", { name: copy.acceso.cerrarSesion }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));

    // Salir tiene que ser salir: volver al panel escribiendo la URL tampoco
    // entra. Si la sesión sólo se borrara en el navegador, esto pasaría.
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toHaveCount(0);
  });

  test("entrar tras ser redirigido lleva a donde se pedía", async ({ page }) => {
    // BODA-41. La ruta interna todavía no tiene página, y para esto da igual:
    // lo que se prueba es que el destino sobrevive al viaje —puerta, sesión,
    // vuelta— y no que haya algo pintado al llegar. El día que exista, este
    // test seguirá valiendo sin tocarlo.
    const pedida = `${RUTA_PANEL}/invitados`;

    await page.goto(pedida);
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));

    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();

    await expect(page).toHaveURL(new RegExp(`${pedida}$`));
  });

  // --- Los casos que de verdad importan --------------------------------

  test("la contraseña incorrecta no entra", async ({ page }) => {
    await identificarse(page, CORREO_CON_ACCESO!, "esta-no-es-la-contrasena");

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      copy.acceso.errorCredenciales,
    );
  });

  test("identificarse bien pero sin perfil activo tampoco entra", async ({ page }) => {
    // Este usuario existe y acierta la contraseña: Supabase lo autentica sin
    // problema. Lo que no tiene es perfil activo, y eso lo decide `perfiles`.
    // Es la diferencia entre «autenticado» y «con acceso».
    await identificarse(page, CORREO_SIN_ACCESO!);

    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(
      copy.acceso.titulo,
    );
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toHaveCount(0);

    // Y además se le cierra la sesión: si se le dejara una abierta, andaría
    // rebotando en la puerta sin entender por qué.
    await page.goto(RUTA_PANEL);
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
  });

  test("y se le dice que es la cuenta, no la contraseña", async ({ page }) => {
    // BODA-127. Durante un tiempo este caso respondía «el correo o la
    // contraseña no son correctos», y eso fue exactamente lo que dejó a los
    // novios fuera de su propio panel: cuenta recién creada, todavía sin dar de
    // alta, contraseña perfecta y un mensaje que mandaba a mirar al sitio
    // equivocado. Parecía que el botón no hacía nada.
    await identificarse(page, CORREO_SIN_ACCESO!);

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      copy.acceso.errorSinAcceso,
    );
  });

  test("una contraseña mal no delata si el correo existe", async ({ page }) => {
    // LA PROPIEDAD QUE DE VERDAD PROTEGE LA LISTA, y la que hay que sostener al
    // darle mensaje propio al caso de arriba: quien NO acierta la contraseña
    // lee lo mismo exista el correo o no. Así la puerta no se puede usar para
    // averiguar quién tiene acceso, que es para lo que serviría si el correo
    // inventado respondiera distinto.
    await identificarse(page, CORREO_CON_ACCESO!, "esta-no-es-la-contrasena");
    const existente = await page.getByRole("main").getByRole("alert").textContent();

    await identificarse(page, "este-correo-no-existe-en-ninguna-parte@ejemplo.test");
    const inventado = await page.getByRole("main").getByRole("alert").textContent();

    expect(existente).toBe(inventado);
    expect(existente).toBe(copy.acceso.errorCredenciales);
  });

  /*
    RECUPERAR LA CONTRASEÑA, DE VERDAD. Con `@supabase/ssr` el flujo es PKCE:
    pedir la recuperación deja en ESTE navegador un verificador, y el enlace del
    correo vuelve con un código que sólo se canjea junto a él. La ruta de vuelta
    sólo sabía de `token_hash`, así que con la plantilla de serie de Supabase
    ningún enlace funcionaba.

    El correo no se puede leer aquí —el buzón de pruebas de Supabase no se
    levanta en el CI—, así que se hace lo que haría el enlace: GoTrue, al
    verificarlo, apunta en `auth.flow_state` un código atado al reto del
    verificador y redirige con él. Se apunta ese mismo código para el
    verificador que la web dejó en las cookies, y se abre la vuelta. Lo que se
    prueba es nuestra parte entera: la cookie que deja la petición, el canje
    contra GoTrue y el destino.
  */
  test("pedir la recuperación y abrir el enlace en el mismo navegador lleva a elegir contraseña", async ({
    page,
    context,
  }) => {
    const cadena = process.env.DATABASE_URL;
    test.skip(!cadena, "Hace falta la base del Supabase local para apuntar el código.");

    await page.goto(RUTA_RECUPERAR);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByRole("button", { name: copy.acceso.recuperarEnviar }).click();
    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      copy.acceso.recuperarEnviado,
    );

    // El verificador del flujo, en su cookie: `…-flow-<id>-code-verifier`.
    const ranura = (await context.cookies()).find((galleta) =>
      /-flow-[0-9a-f]{32}-code-verifier$/.test(galleta.name),
    );
    expect(ranura, "pedir la recuperación tiene que dejar el verificador PKCE").toBeTruthy();
    const flujo = ranura!.name.match(/-flow-([0-9a-f]{32})-code-verifier$/)![1]!;

    const crudo = decodeURIComponent(ranura!.value);
    const texto = crudo.startsWith("base64-")
      ? Buffer.from(crudo.slice("base64-".length), "base64url").toString("utf8")
      : crudo;
    const guardado = texto.startsWith('"') ? (JSON.parse(texto) as string) : texto;
    const [verificador, marca] = guardado.split("/");
    expect(marca, "el verificador va marcado como recuperación").toBe("recovery");

    const reto = createHash("sha256").update(verificador!).digest("base64url");
    const codigo = randomUUID();
    const sql = postgres(cadena!, { max: 1, prepare: false, onnotice: () => {} });
    try {
      /*
        LA FILA, COMO LA ESCRIBE GoTrue. Las dos columnas del token del
        proveedor admiten NULL en la tabla, pero GoTrue las lee como texto
        plano: con un NULL no puede ni cargar la fila, el canje falla y la
        vuelta acaba en «enlace no válido» —que es lo que pasó la primera vez
        que esto corrió—. GoTrue siempre las guarda vacías, y al verificar el
        enlace anota cuándo emitió el código: se hace igual.
      */
      await sql`
        insert into auth.flow_state (
          id, user_id, auth_code, code_challenge_method, code_challenge,
          provider_type, authentication_method,
          provider_access_token, provider_refresh_token,
          auth_code_issued_at, created_at, updated_at
        )
        values (
          ${randomUUID()},
          (select id from auth.users where email = ${CORREO_CON_ACCESO!}),
          ${codigo}, 's256', ${reto}, 'recovery', 'recovery',
          '', '',
          now(), now(), now()
        )
      `;
    } finally {
      await sql.end();
    }

    await page.goto(`${RUTA_CONFIRMAR_ACCESO}?code=${codigo}&sb_flow_id=${flujo}`);

    await expect(page).toHaveURL(new RegExp(RUTA_NUEVA_CONTRASENA));
    // Con sesión, la pantalla deja elegir la contraseña; sin ella, no.
    await expect(page.getByLabel(copy.acceso.nuevaContrasena)).toBeVisible();
  });

  /*
    LA SESIÓN SE CIERRA A MITAD DE UN FORMULARIO. Cerrar sesión en el móvil la
    cierra también en el portátil (`signOut()` es global). El siguiente
    «Guardar» del panel acababa en la pantalla de error del panel, en inglés,
    porque la acción recibía el HTML de la puerta. Tiene que acabar en la
    puerta, recordando a dónde volver.
  */
  test("con la sesión cerrada en otro sitio, guardar en el panel lleva a la puerta, no a un error", async ({
    page,
    context,
  }) => {
    await identificarse(page, CORREO_CON_ACCESO!);
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));

    const pantalla = `${RUTA_PANEL}/cuenta`;
    await page.goto(pantalla);
    const campo = page.getByLabel(copy.panel.cuenta.nombre);
    await expect(campo).toBeVisible();

    // Lo mismo que ve este navegador cuando la sesión se cerró en otro: sus
    // cookies ya no valen.
    await context.clearCookies();

    await campo.fill("Nombre que no llega a guardarse");
    await page.getByRole("button", { name: copy.panel.cuenta.guardar }).click();

    await expect(page).toHaveURL(
      new RegExp(`${RUTA_ACCESO}\\?${PARAMETRO_VOLVER}=${encodeURIComponent(pantalla)}`),
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.acceso.titulo);
  });
});
