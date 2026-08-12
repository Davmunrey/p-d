import * as Sentry from "@sentry/nextjs";

import { MUESTREO_TRAZAS, SENTRY_DSN } from "@/config/constants";
import { antesDeMandar } from "@/lib/observabilidad/sentry";

/**
 * BODA-93 (#64) · LOS ERRORES DEL SERVIDOR
 *
 * Next llama a `register()` una vez al arrancar cada runtime. Es el único sitio
 * desde el que se puede enganchar Sentry antes de que corra nada, que es lo que
 * hace falta para enterarse del error que ocurre en la primera petición.
 *
 * SIN DSN NO SE ARRANCA NADA, y no es una precaución de más: en local y en CI
 * no hay clave, así que no sale ni una petición hacia fuera y los tests no
 * dependen de que un servicio de terceros esté de pie. Lo contrario —una clave
 * de mentira «para que no falle»— manda datos reales a un sitio que nadie mira.
 *
 * `sendDefaultPii: false` es la mitad de la promesa del ticket. La otra mitad
 * la hace `beforeSend`, porque el ajuste sólo apaga lo que Sentry añade por su
 * cuenta (la IP, la cabecera de sesión) y no toca lo que va dentro del mensaje
 * de error, que es donde aparece el token de una invitación.
 */
export async function register() {
  if (!SENTRY_DSN) return;

  /*
    DOS RUNTIMES Y LA MISMA CONFIGURACIÓN. Vercel corre las páginas en Node y el
    middleware en el borde, y son dos procesos distintos con dos SDK distintos.
    Enganchar sólo uno deja la mitad de la aplicación sin vigilar — y el
    middleware es justo por donde pasan todas las peticiones del panel.
  */
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: MUESTREO_TRAZAS,
      sendDefaultPii: false,
      beforeSend: antesDeMandar,
      /*
        Las migas de pan también salen por aquí. Llevan dentro las URL por las
        que se ha pasado, así que sin limpiarlas el token viajaría igual, sólo
        que en otra parte del mismo informe.
      */
      beforeBreadcrumb: (miga) => antesDeMandar(miga as never),
    });
  }
}

/**
 * Los errores de renderizado que Next captura por su cuenta.
 *
 * Sin esto, un fallo dentro de un componente de servidor acaba en la pantalla
 * de «algo no ha ido bien» y en ningún sitio más: Next lo atrapa antes de que
 * llegue a ninguna captura nuestra.
 */
export const onRequestError = Sentry.captureRequestError;
