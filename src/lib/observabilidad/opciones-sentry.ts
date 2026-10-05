import { MUESTREO_TRAZAS } from "@/config/constants";

import { antesDeMandar } from "./sentry";

/**
 * LO QUE COMPARTEN LOS DOS ARRANQUES DE SENTRY, el del servidor y el del
 * navegador, escrito una sola vez.
 *
 * Estaban escritos dos veces, y los dos se olvidaron de lo mismo: las TRAZAS.
 * `beforeSend` sólo ve los errores; las transacciones salen por
 * `beforeSendTransaction` y cada tramo por `beforeSendSpan`. Sin ellos, con el
 * muestreo de trazas encendido, una de cada diez visitas al RSVP mandaba a
 * Sentry la URL con el token de la invitación —en `request.url`, en el nombre
 * de la transacción y en los datos de cada tramo—, que es exactamente lo que
 * `antesDeMandar` existe para impedir. Con las opciones en un solo sitio, un
 * filtro nuevo llega a los dos arranques o a ninguno, y el unitario lo vigila.
 *
 * `sendDefaultPii: false` es la mitad de la promesa: apaga lo que Sentry añade
 * por su cuenta (la IP, la cabecera de sesión). La otra mitad son los filtros,
 * porque el ajuste no toca lo que va dentro del mensaje de error, que es donde
 * aparece el token de una invitación.
 */
export const OPCIONES_SENTRY = {
  tracesSampleRate: MUESTREO_TRAZAS,
  sendDefaultPii: false,
  beforeSend: antesDeMandar,
  beforeSendTransaction: antesDeMandar,
  beforeSendSpan: antesDeMandar,
  /*
    Las migas de pan también salen por aquí. Llevan dentro las URL por las que
    se ha pasado, así que sin limpiarlas el token viajaría igual, sólo que en
    otra parte del mismo informe.
  */
  beforeBreadcrumb: antesDeMandar,
} as const;
