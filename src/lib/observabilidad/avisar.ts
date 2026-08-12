import * as Sentry from "@sentry/nextjs";

import { AVISO_CONFIRMACION_FALLIDA } from "@/config/constants";

import { limpiarTexto } from "./limpiar";

/**
 * BODA-93 (#64) · EL AVISO DE QUE LAS CONFIRMACIONES ESTÁN FALLANDO
 *
 * El criterio del ticket es «aviso si el porcentaje de confirmaciones fallidas
 * se dispara», y eso son dos mitades que conviene no confundir:
 *
 *   · LA SEÑAL la emite esta función, y es lo que se puede escribir en código.
 *   · LA REGLA («si pasa de N en una hora, avísame») se configura en Sentry,
 *     que es quien sabe contar sucesos en el tiempo y mandar el correo. No se
 *     puede meter en el repositorio, y fingir que sí —con un contador propio y
 *     un cron— sería reescribir mal lo que ya hace la herramienta.
 *
 * Lo que sí está en el repositorio es el NOMBRE contra el que se escribe esa
 * regla: `AVISO_CONFIRMACION_FALLIDA`, una constante, precisamente para que
 * cambiarlo aquí sin cambiarlo allí sea un cambio visible y no un aviso que se
 * apaga en silencio. Cómo se configura está en `docs/ENTORNO.md`.
 *
 * SÓLO SE AVISA DE LO QUE ES CULPA NUESTRA. Un plazo cerrado o un enlace
 * caducado son respuestas correctas del sistema, no fallos; contarlos aquí
 * dispararía el aviso el día que más gente entra tarde, que es justo el día en
 * que no hay nada que arreglar.
 */
export function avisarDeConfirmacionFallida(motivo: string, error?: unknown): void {
  /*
    SIN SENTRY ARRANCADO ESTO NO HACE NADA, y `captureMessage` ya lo sabe: sin
    `init` es una función vacía. Se comprueba igual para dejarlo dicho, porque
    de lo contrario alguien podría pensar que en local se está mandando algo.
  */
  if (!Sentry.isInitialized()) return;

  Sentry.captureMessage(AVISO_CONFIRMACION_FALLIDA, {
    level: "error",
    tags: { motivo },
    /*
      EL ERROR VA COMO TEXTO Y LIMPIO, no como objeto. Un error de PostgREST
      lleva dentro `details` y `hint`, y ahí aparecen los valores de la fila que
      falló — que en esta tabla son los datos de un invitado.
    */
    extra: { detalle: limpiarTexto(String(error ?? "")) },
  });
}
