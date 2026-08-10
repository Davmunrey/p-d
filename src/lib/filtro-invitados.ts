import type { GrupoInvitacion } from "@/lib/bbdd/invitados";

/**
 * Genérico sobre el grupo: la pantalla filtra grupos con su recuento y la
 * exportación filtra grupos CON su gente dentro. El filtro sólo mira el
 * recuento y los nombres, que están en los dos, así que no tiene por qué
 * elegir uno y devolver el otro empobrecido.
 */

/**
 * EL FILTRO DE LA TABLA DE INVITADOS
 *
 * Vive aquí y no dentro de la pantalla porque lo usan DOS sitios: la lista que
 * se ve y el fichero que se descarga. El ticket lo pide con todas las letras
 * —«exporta lo que hay filtrado en pantalla, no siempre la tabla entera»— y la
 * única forma de que eso siga siendo verdad dentro de seis meses es que no
 * existan dos filtros que puedan separarse.
 *
 * No toca la base: filtra en memoria. Con ciento veinte invitaciones, ir a la
 * base por cada letra tecleada sería un viaje de ida y vuelta para nada.
 */

export const ESTADOS_FILTRO = ["todos", "sin-contestar", "contestado"] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

export function esEstadoFiltro(valor: string): valor is EstadoFiltro {
  return (ESTADOS_FILTRO as readonly string[]).includes(valor);
}

/**
 * Sin acentos y en minúsculas.
 *
 * Quien busca a «Ainhoa Zubeldía» desde el móvil escribe «zubeldia», y una
 * búsqueda que no encuentre a nadie por eso es una búsqueda que no se usa.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Encuentra por el nombre del grupo o por el de cualquiera de su gente. */
export function coincide(grupo: GrupoInvitacion, busqueda: string): boolean {
  if (!busqueda) return true;
  const aguja = normalizar(busqueda);
  return (
    normalizar(grupo.nombre).includes(aguja) ||
    grupo.nombresPersonas.some((nombre) => normalizar(nombre).includes(aguja))
  );
}

export function filtrarGrupos<T extends GrupoInvitacion>(
  grupos: T[],
  { busqueda, estado }: { busqueda: string; estado: EstadoFiltro },
): T[] {
  return grupos.filter((grupo) => {
    if (!coincide(grupo, busqueda)) return false;
    // «Contestado» es que no quede nadie por contestar. Un grupo vacío no
    // cuenta como contestado: no ha contestado nadie porque no hay nadie.
    if (estado === "sin-contestar") return grupo.pendientes > 0;
    if (estado === "contestado") return grupo.pendientes === 0 && grupo.personas > 0;
    return true;
  });
}
