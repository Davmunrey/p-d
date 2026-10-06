/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN SOBRE UN PAGO.
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta.
 */
export type EstadoPagos =
  | "pago-creado"
  | "pago-editado"
  | "pago-borrado"
  | "marcado-pagado"
  | "marcado-pendiente"
  | "confirmar-borrado"
  | "gasto"
  | "importe"
  | "fecha"
  | "fecha-pago"
  | "no-cabe"
  | "pagador"
  | "no-existe"
  | "sin-permiso"
  | "error";

/** El sitio de cada pago en la pantalla: a él vuelve lo que se hace sobre él. */
export function anclaDePago(id: string): string {
  return `pago-${id}`;
}

/** El alta de un pago, al final de la pantalla: sus errores se pintan junto a ella. */
export const ANCLA_ALTA_PAGO = "nuevo-pago";

/** Lo que dice en la URL que un aviso viene del alta y no de un pago concreto. */
export const DESDE_EL_ALTA = { desde: "alta" } as const;
