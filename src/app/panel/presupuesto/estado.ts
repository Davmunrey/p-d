/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN DEL PRESUPUESTO.
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta.
 */
export type EstadoPresupuesto =
  | "categoria-creada"
  | "categoria-editada"
  | "categoria-borrada"
  | "gastos-movidos"
  | "nombre"
  | "importe"
  | "orden"
  | "decidir-gastos"
  | "destino"
  | "no-existe"
  | "sin-permiso"
  | "error";
