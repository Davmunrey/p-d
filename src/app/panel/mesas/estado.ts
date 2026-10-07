import { RUTA_MESAS, RUTA_MESAS_PLANO, RUTA_MESAS_REPARTO } from "@/config/constants";

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
 * Las mesas medían veinte mil píxeles en un móvil, y cada acción volvía arriba
 * del todo: para empujar una mesa diez pasos había que bajar diez veces hasta
 * sus flechas, y la confirmación de borrar salía arriba con el botón abajo.
 * Cada formulario manda el ancla de su sitio —la bolsa de «sin mesa», el
 * bloque de una mesa, el plano— y la acción vuelve ahí: a la vista que lo
 * tiene (`rutaDeAncla`) y, dentro de ella, a ese sitio.
 */
export const ANCLA_SIN_MESA = "sin-mesa";
export const ANCLA_SIN_RESPUESTA = "sin-respuesta";
export const ANCLA_PLANO = "plano";
/** El alta, al final de la pantalla: sus errores se pintan junto al formulario. */
export const ANCLA_NUEVA = "nueva-mesa";
/** La cabecera de «Mesa a mesa»: vuelve aquí lo que ya no tiene bloque, como una mesa borrada. */
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

/**
 * LA VISTA QUE TIENE CADA ANCLA. Las mesas son tres pestañas —«Por sentar», el
 * plano y «Mesa a mesa»— y una acción vuelve a la que tiene el formulario que
 * se envió: sentar desde la bolsa, a la bolsa; empujar una mesa, al plano;
 * guardar sus datos, a su bloque. Sin ancla, a la raíz.
 */
export function rutaDeAncla(ancla: string | undefined): string {
  if (ancla === ANCLA_PLANO) return RUTA_MESAS_PLANO;
  if (ancla === ANCLA_REPARTO || ancla === ANCLA_NUEVA || ancla?.startsWith("mesa-")) {
    return RUTA_MESAS_REPARTO;
  }
  return RUTA_MESAS;
}
