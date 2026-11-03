import { TRAYECTOS_AUTOBUS, type TrayectoAutobus } from "@/config/constants";

/** Si un valor que viene de fuera —un formulario, una cookie— es un trayecto. */
export function esTrayecto(valor: unknown): valor is TrayectoAutobus {
  return (TRAYECTOS_AUTOBUS as readonly unknown[]).includes(valor);
}

/**
 * El trayecto que dijo una persona, o `undefined` si no contestó.
 *
 * LAS RESPUESTAS DE ANTES SÓLO TIENEN SÍ O NO. Antes de preguntar el trayecto
 * se guardaba «necesita autobús» a secas, y ese «sí» era ida y vuelta: así se
 * leen, para que al cambiar la respuesta el desplegable salga como estaba.
 */
export function trayectoGuardado(persona: {
  trayectoAutobus: TrayectoAutobus | null;
  necesitaAutobus: boolean | null;
}): TrayectoAutobus | undefined {
  if (persona.trayectoAutobus) return persona.trayectoAutobus;
  if (persona.necesitaAutobus === null) return undefined;
  return persona.necesitaAutobus ? "ida_y_vuelta" : "ninguno";
}

/**
 * Un trayecto leído de un borrador guardado. Los borradores de antes guardaban
 * `true`/`false`; se traducen igual que las respuestas de la base.
 */
export function trayectoDelBorrador(valor: unknown): TrayectoAutobus | undefined {
  if (esTrayecto(valor)) return valor;
  if (typeof valor === "boolean") return valor ? "ida_y_vuelta" : "ninguno";
  return undefined;
}
