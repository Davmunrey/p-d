import * as Sentry from "@sentry/nextjs";

import { MUESTREO_TRAZAS, SENTRY_DSN } from "@/config/constants";
import { noQuiereQueLeSigan } from "@/lib/observabilidad/limpiar";
import { antesDeMandar } from "@/lib/observabilidad/sentry";

/**
 * BODA-93 (#64) · LOS ERRORES DEL NAVEGADOR
 *
 * El que más falta hace de los dos. Si a un invitado le revienta la
 * confirmación un domingo por la noche no va a escribir a nadie: va a cerrar la
 * pestaña. Del servidor nos enteramos igual; de esto, sólo si lo cuenta el
 * propio navegador.
 *
 * SE RESPETA «NO ME SIGAS» TAMBIÉN AQUÍ, y esa es una decisión y no una regla
 * heredada. Se podría argumentar que un informe de error no es seguimiento —es
 * cierto— pero el informe lleva dentro por dónde iba esa persona, y quien
 * enciende esa señal está pidiendo exactamente que eso no salga de su
 * ordenador. Nos quedamos sin saber que hubo un error; esa es la parte que nos
 * toca perder.
 *
 * NADA DE GRABAR LA SESIÓN: `replayIntegration` viene de serie en el SDK y
 * graba lo que se teclea. En un formulario que pide nombre, correo, teléfono y
 * alergias, eso es una copia de los datos de cada invitado en un servicio de
 * terceros. Aquí no se enciende, y por eso está escrito.
 */
if (SENTRY_DSN && !noQuiereQueLeSigan()) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: MUESTREO_TRAZAS,
    sendDefaultPii: false,
    beforeSend: antesDeMandar,
    beforeBreadcrumb: (miga) => antesDeMandar(miga as never),
  });
}

/*
  NO SE EXPORTA `onRouterTransitionStart`, que es lo que engancharía las trazas
  a las transiciones del enrutador. Esta versión del SDK no lo publica —se
  comprobó, no se supuso— y exportar `undefined` con ese nombre deja a Next
  llamando a algo que no existe. Cuando el SDK lo traiga, entra aquí.
*/
