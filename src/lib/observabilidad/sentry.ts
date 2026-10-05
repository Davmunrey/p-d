import { limpiarProfundo } from "./limpiar";

/**
 * BODA-93 (#64) · LA ÚLTIMA PUERTA ANTES DE SALIR
 *
 * Sentry manda los informes por su cuenta y desde tres sitios distintos —el
 * servidor, el navegador y el runtime del borde—, así que el filtro no puede
 * estar en el sitio donde se captura el error: tiene que estar en el sitio por
 * donde salen todos. Eso es `beforeSend`, y esto es lo que se le engancha.
 *
 * ES UNA FUNCIÓN SUELTA Y EXPORTADA A PROPÓSITO. Escrita en línea dentro de
 * `Sentry.init` estaría repetida tres veces —una por entorno— y no habría forma
 * de probarla: el test tendría que arrancar Sentry de verdad y provocar un
 * error para ver qué sale. Aquí se le pasa un informe y se mira el resultado,
 * que es lo que pide el ticket («se comprueba sobre el payload»).
 */

/**
 * Un informe, limpio y sin nadie identificado dentro.
 *
 * DOS COSAS, Y LA SEGUNDA NO LA HACE `limpiarProfundo`:
 *
 * 1 · Se limpia el árbol entero —URL, mensaje, migas de pan, etiquetas—, que es
 *     donde puede aparecer el token de una invitación o el correo de alguien.
 *
 * 2 · SE TIRA `user` Y SE TIRAN LAS COOKIES, enteros y sin mirarlos. Sentry
 *     rellena `user` por su cuenta con la IP de quien navega, y las cookies
 *     llevan la sesión del panel. Ninguna de las dos cosas hace falta para
 *     arreglar un error, y las dos son exactamente lo que no queremos en un
 *     servicio de terceros. Limpiarlas sería quedarse a medias: lo que no se
 *     necesita no se manda.
 */
export function antesDeMandar<T>(informe: T): T {
  /*
    EL TIPO ES GENÉRICO Y NO EL DE SENTRY, y no es pereza: la misma función la
    usan `beforeSend` —que recibe un `ErrorEvent`— y `beforeBreadcrumb` —que
    recibe un `Breadcrumb`—, y son dos tipos sin nada en común salvo ser objetos.
    Atarla a uno obligaría a escribirla dos veces, que es como acaban dos
    filtros distintos y uno de ellos sin actualizar.
  */
  if (!informe || typeof informe !== "object") return informe;

  const sinIdentidad = { ...(informe as Record<string, unknown>) };
  delete sinIdentidad.user;

  const peticion = sinIdentidad.request;
  if (peticion && typeof peticion === "object") {
    const limpia = { ...(peticion as Record<string, unknown>) };
    delete limpia.cookies;
    /*
      Las cabeceras se van enteras. `authorization` y `cookie` son las obvias,
      pero también viajan ahí `referer` —que en el RSVP es la URL con el token—
      y las cabeceras que mete el proxy con la IP de origen.
    */
    delete limpia.headers;
    sinIdentidad.request = limpia;
  }

  return conSusIdentificadores(informe, limpiarProfundo(sinIdentidad)) as T;
}

/**
 * LOS IDENTIFICADORES DE SENTRY NO SON DATOS DE NADIE, y el filtro no los
 * puede tocar: el `event_id` va en la cabecera del sobre y el servidor de
 * Sentry rechaza uno que no sea un UUID, y los de la traza son los que atan un
 * error a su petición. Son hexadecimal puro, así que se devuelven tal cual
 * estaban —y sólo si de verdad lo son: nada que no tenga forma de identificador
 * se cuela por aquí—.
 */
const IDENTIFICADOR = /^[0-9a-f]{16,32}$/;
const CAMPOS_IDENTIFICADOR = ["event_id", "trace_id", "span_id", "parent_span_id"] as const;

function conSusIdentificadores(original: unknown, limpio: unknown): unknown {
  if (!original || typeof original !== "object" || !limpio || typeof limpio !== "object") {
    return limpio;
  }
  if (Array.isArray(original) && Array.isArray(limpio)) {
    return limpio.map((elemento, indice) => conSusIdentificadores(original[indice], elemento));
  }

  const antes = original as Record<string, unknown>;
  const despues = limpio as Record<string, unknown>;
  for (const campo of CAMPOS_IDENTIFICADOR) {
    const valor = antes[campo];
    if (typeof valor === "string" && IDENTIFICADOR.test(valor)) despues[campo] = valor;
  }
  // Donde viven: `contexts.trace` en un error y en una transacción, y cada
  // tramo de `spans` en una transacción.
  for (const rama of ["contexts", "trace", "spans"]) {
    if (rama in antes && rama in despues) {
      despues[rama] = conSusIdentificadores(antes[rama], despues[rama]);
    }
  }
  return despues;
}

/**
 * Lo mismo para lo que PostHog manda de cada evento.
 *
 * `$current_url` y `$pathname` llevan la ruta tal cual, y en el RSVP esa ruta
 * ES la credencial. Sin esto, la analítica de producto sería una lista de
 * tokens de invitación ordenada por hora.
 */
export function antesDeMedir(propiedades: Record<string, unknown>): Record<string, unknown> {
  return limpiarProfundo(propiedades) as Record<string, unknown>;
}
