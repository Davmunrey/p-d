/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN SOBRE UN GASTO.
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta.
 */
export type EstadoGastos =
  | "gasto-creado"
  | "gasto-editado"
  | "gasto-borrado"
  | "concepto"
  | "categoria"
  | "importe"
  | "sin-categorias"
  | "no-existe"
  | "tiene-pagos"
  | "sin-permiso"
  | "error";
