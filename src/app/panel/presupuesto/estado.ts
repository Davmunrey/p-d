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
  | "confirmar-borrado"
  | "nombre"
  | "nombre-repetido"
  | "importe"
  | "orden"
  | "decidir-gastos"
  | "destino"
  | "no-existe"
  | "sin-permiso"
  | "error";

/** El sitio de cada categoría en la lista de ajuste: a él vuelve lo que se hace sobre ella. */
export function anclaDeCategoria(id: string): string {
  return `categoria-${id}`;
}

/** El alta de una categoría, al final de la pantalla: sus errores se pintan junto a ella. */
export const ANCLA_ALTA_CATEGORIA = "nueva-categoria";

/** Lo que dice en la URL que un aviso viene del alta y no de una categoría concreta. */
export const DESDE_EL_ALTA = { desde: "alta" } as const;
