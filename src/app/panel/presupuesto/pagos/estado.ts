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
  | "gasto"
  | "importe"
  | "fecha"
  | "no-cabe"
  | "pagador"
  | "no-existe"
  | "sin-permiso"
  | "error";
