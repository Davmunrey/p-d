import { RUTA_RSVP } from "@/config/constants";

/**
 * BODA-93 (#64) · LO QUE NUNCA SALE DE AQUÍ
 *
 * Este fichero es el ticket. Todo lo demás de observabilidad —conectar Sentry,
 * conectar PostHog— son diez líneas de configuración; lo que de verdad hay que
 * escribir con cuidado es qué se le quita a cada cosa ANTES de mandarla, porque
 * un informe de error lleva dentro la URL en la que ocurrió, y en esta web esa
 * URL es a veces la invitación de alguien.
 *
 * QUÉ HAY EN JUEGO, en concreto:
 *
 *   · EL TOKEN DE INVITACIÓN. `/rsvp/<token>` es una credencial: quien lo tiene
 *     puede leer y cambiar la confirmación de esa familia. Mandarlo a un
 *     servicio de terceros —donde lo ve cualquiera con acceso al panel de
 *     errores, y donde se queda archivado meses— es publicar la llave.
 *   · EL CORREO Y EL TELÉFONO de los invitados, que son datos personales de
 *     gente que no ha aceptado ninguna política de nadie: nos los dieron para
 *     una boda.
 *
 * SE LIMPIA POR LISTA NEGRA Y ADEMÁS POR ESTRUCTURA. La lista negra (correos,
 * teléfonos) coge lo que aparece en mitad de un texto; la estructura (la ruta
 * del RSVP) coge el token, que no tiene forma reconocible — es texto aleatorio
 * y ninguna expresión regular lo distingue de un identificador cualquiera. Por
 * eso el token NO se busca: se sustituye el segmento entero que va detrás de
 * `/rsvp/`, venga como venga.
 *
 * VIVE SUELTO Y SIN `server-only` a propósito: lo necesitan los dos lados. El
 * navegador manda errores igual que el servidor, y el que más cerca está del
 * token es justamente el navegador.
 */

/** Lo que se pinta en lugar de lo que se ha quitado. */
export const TAPADO = "[quitado]";

/**
 * `/rsvp/loQueSea` → `/rsvp/[quitado]`.
 *
 * SE CORTA EL SEGMENTO ENTERO y no se busca «algo que parezca un token». Un
 * token es `translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_')`:
 * veinticuatro bytes en base64 sin relleno, o sea texto sin forma. Buscarlo con
 * una expresión regular obligaría a adivinar su longitud y su alfabeto, y a
 * acertar también con los tokens de desarrollo, que se llaman
 * «desarrollo-familia-uno-000000». Cortar por la ruta acierta con todos.
 */
function taparRutasDeInvitacion(texto: string): string {
  return texto.replace(
    new RegExp(`(${RUTA_RSVP}/)[^/?#\\s"'&]+`, "g"),
    `$1${encodeURIComponent(TAPADO)}`,
  );
}

/**
 * Un correo electrónico, en mitad de lo que sea.
 *
 * Deliberadamente ancha: aquí un falso positivo tapa una palabra de un mensaje
 * de error y un falso negativo publica el correo de un invitado. No es un
 * empate.
 */
const CORREO = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Un teléfono como se escriben aquí, que es como los valida la base:
 * `^\+?[0-9 ().-]{6,25}$`.
 *
 * SE EXIGEN AL MENOS SEIS CIFRAS DE VERDAD, y no seis caracteres del conjunto.
 * Sin eso, «2026-08-12 14:30» —una fecha en un mensaje de error— es un teléfono
 * perfectamente válido para la expresión, y los informes acabarían tapando las
 * horas, que es justo lo que hay que poder leer al depurar.
 */
const TELEFONO = /\+?[\d][\d ().-]{4,24}\d/g;

function tieneCifrasSuficientes(candidato: string): boolean {
  return (candidato.match(/\d/g) ?? []).length >= 6;
}

/**
 * Un texto, sin nada que identifique a nadie.
 *
 * El orden importa: primero las rutas —que pueden contener algo con pinta de
 * teléfono— y después correos y teléfonos.
 */
export function limpiarTexto(texto: string): string {
  return taparRutasDeInvitacion(texto)
    .replace(CORREO, TAPADO)
    .replace(TELEFONO, (candidato) => (tieneCifrasSuficientes(candidato) ? TAPADO : candidato));
}

/**
 * Cualquier cosa que vaya a salir hacia fuera, limpia y en profundidad.
 *
 * RECORRE EL OBJETO ENTERO porque un informe de Sentry no es un texto: es un
 * árbol con la URL en `request.url`, el mensaje en `exception.values[].value`,
 * las migas de pan en `breadcrumbs[].data` y las etiquetas en `tags`. Limpiar
 * sólo el mensaje sería limpiar el sitio donde el token casi nunca está.
 *
 * LAS CLAVES TAMBIÉN SE MIRAN: un objeto `{ "correo@ejemplo.com": 1 }` filtra
 * igual que un valor.
 *
 * Y LO QUE NO SE ENTIENDE, NO PASA. Si algo no es texto, número, booleano,
 * `null`, lista u objeto llano —una función, una clase, un `Symbol`—, se
 * sustituye por `[quitado]` en vez de dejarlo pasar tal cual: lo que no se sabe
 * describir tampoco se sabe limpiar.
 */
export function limpiarProfundo<T>(valor: T, profundidad = 0): unknown {
  // Un árbol demasiado hondo se corta: un ciclo entre objetos colgaría el
  // proceso justo cuando algo ya ha ido mal, que es el peor momento.
  if (profundidad > 12) return TAPADO;

  if (typeof valor === "string") return limpiarTexto(valor);
  if (typeof valor === "number" || typeof valor === "boolean" || valor === null) {
    return valor;
  }
  if (valor === undefined) return undefined;

  if (Array.isArray(valor)) {
    return valor.map((elemento) => limpiarProfundo(elemento, profundidad + 1));
  }

  if (typeof valor === "object") {
    const limpio: Record<string, unknown> = {};
    for (const [clave, dentro] of Object.entries(valor as Record<string, unknown>)) {
      limpio[limpiarTexto(clave)] = limpiarProfundo(dentro, profundidad + 1);
    }
    return limpio;
  }

  return TAPADO;
}

/**
 * ¿Ha pedido esta persona que no la sigan?
 *
 * SE RESPETAN LAS TRES SEÑALES, y no sólo la estándar: `doNotTrack` es la de
 * siempre, `msDoNotTrack` la de los Internet Explorer que aún andan por ahí, y
 * `globalPrivacyControl` la que mandan Firefox y las extensiones de privacidad
 * modernas — y la única con respaldo legal en varios sitios. Mirar sólo una es
 * quedarse con la que menos gente activa.
 *
 * ANTE LA DUDA, NO SE MIDE. Sin `window` —en el servidor, o en un entorno raro—
 * devuelve `true`: la analítica es lo que se puede perder sin que nadie note
 * nada, y la privacidad de un invitado no.
 */
export function noQuiereQueLeSigan(): boolean {
  if (typeof window === "undefined") return true;

  const navegador = window.navigator as Navigator & {
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const ventana = window as Window & { doNotTrack?: string };

  return (
    navegador.doNotTrack === "1" ||
    navegador.doNotTrack === "yes" ||
    navegador.msDoNotTrack === "1" ||
    ventana.doNotTrack === "1" ||
    navegador.globalPrivacyControl === true
  );
}
