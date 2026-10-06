/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN, EN UNA FRASE
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta. Es la misma separación que en proveedores y en la importación de
 * invitados, y por el mismo motivo: un `export type` allí compila, pasa el
 * lint, y revienta al abrir la pantalla.
 *
 * Los éxitos van en participio y los errores llevan el nombre del campo o del
 * motivo. `sentado-sin-confirmar` no es ninguna de las dos cosas: se ha
 * guardado, y aun así hay algo que decir — se pinta en ámbar.
 */

export type EstadoMesas =
  | "creada"
  | "editada"
  | "borrada"
  | "colocada"
  | "movida"
  | "sentado"
  | "sentado-sin-confirmar"
  | "sentado-no-viene"
  | "grupo-sentado"
  | "grupo-sentado-sin-confirmar"
  | "editada-pasada"
  | "presidencia-repetida"
  | "levantado"
  | "nombre"
  | "nombre-repetido"
  | "capacidad"
  | "forma"
  | "posicion"
  | "mesa"
  | "invitado"
  | "grupo"
  | "sin-sitio"
  | "confirmar-borrado"
  | "no-existe"
  | "en-uso"
  | "sin-permiso"
  | "error";

/**
 * A DÓNDE VUELVE LA PANTALLA TRAS UNA ACCIÓN, y dónde se pinta su aviso.
 *
 * La pantalla de mesas mide veinte mil píxeles en un móvil, y cada acción
 * volvía arriba del todo: para empujar una mesa diez pasos había que bajar
 * diez veces hasta sus flechas, y la confirmación de borrar salía arriba con
 * el botón abajo. Cada formulario manda el ancla de su sitio —la bolsa de «sin
 * mesa», el bloque de una mesa, el plano— y la acción vuelve ahí.
 */
export const ANCLA_SIN_MESA = "sin-mesa";
export const ANCLA_SIN_RESPUESTA = "sin-respuesta";
export const ANCLA_PLANO = "plano";
/** El alta, al final de la pantalla: sus errores se pintan junto al formulario. */
export const ANCLA_NUEVA = "nueva-mesa";
/** Los bloques de mesa. Ninguna acción vuelve aquí: es para el índice de la pantalla. */
export const ANCLA_REPARTO = "reparto";

export function anclaDeMesa(id: string): string {
  return `mesa-${id}`;
}

/** Si un ancla que llega de un formulario es de las de esta pantalla. */
export function esAnclaDeMesas(valor: string): boolean {
  return (
    valor === ANCLA_SIN_MESA ||
    valor === ANCLA_SIN_RESPUESTA ||
    valor === ANCLA_PLANO ||
    valor === ANCLA_NUEVA ||
    /^mesa-[0-9a-f-]{36}$/.test(valor)
  );
}
