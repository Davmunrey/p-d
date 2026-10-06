import { IDIOMA } from "@/config/constants";
import type { GrupoInvitacion } from "@/lib/bbdd/invitados";
import { normalizar } from "@/lib/texto";

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

/** Encuentra por el nombre del grupo o por el de cualquiera de su gente. */
export function coincide(grupo: GrupoInvitacion, busqueda: string): boolean {
  if (!busqueda) return true;
  const aguja = normalizar(busqueda);
  return (
    normalizar(grupo.nombre).includes(aguja) ||
    grupo.nombresPersonas.some((nombre) => normalizar(nombre).includes(aguja))
  );
}

/** De parte de quién: el mismo enumerado que `lado_invitacion`, más «todos». */
export const LADOS_FILTRO = ["todos", "novia", "novio", "ambos"] as const;
export type LadoFiltro = (typeof LADOS_FILTRO)[number];

/** Si la invitación deja traer acompañante, que es lo que cambia la cuenta. */
export const ACOMPANANTES_FILTRO = ["todas", "con", "sin"] as const;
export type AcompanantesFiltro = (typeof ACOMPANANTES_FILTRO)[number];

/**
 * EN QUÉ ORDEN. La lista es de invitaciones, no una tabla con columnas, así que
 * «ordenar por cualquier columna» son las cuatro preguntas que se le hacen:
 * buscar a alguien (por nombre), a quién perseguir (más por contestar), qué
 * pesa en la cuenta (más personas) y a quién no se le ha mandado todavía.
 */
export const ORDENES_INVITADOS = ["nombre", "sin-contestar", "personas", "envio"] as const;
export type OrdenInvitados = (typeof ORDENES_INVITADOS)[number];

export interface FiltrosInvitados {
  busqueda: string;
  estado: EstadoFiltro;
  lado: LadoFiltro;
  acompanantes: AcompanantesFiltro;
  orden: OrdenInvitados;
}

const unoDe = <T extends string>(
  lista: readonly T[],
  valor: string | null,
  porDefecto: T,
): T =>
  valor !== null && (lista as readonly string[]).includes(valor) ? (valor as T) : porDefecto;

/**
 * LOS FILTROS, LEÍDOS DE LA URL EN UN SOLO SITIO. Los lee la pantalla y los lee
 * la descarga; con dos lectores, el día que uno aprendiera un valor nuevo el
 * fichero dejaría de traer lo que se ve. Lo que no se reconoce cae al valor de
 * siempre: una URL tocada a mano no rompe la página.
 */
export function leerFiltros(valor: (clave: string) => string | null): FiltrosInvitados {
  return {
    busqueda: valor("buscar") ?? "",
    estado: unoDe(ESTADOS_FILTRO, valor("estado_filtro"), "todos"),
    lado: unoDe(LADOS_FILTRO, valor("lado_filtro"), "todos"),
    acompanantes: unoDe(ACOMPANANTES_FILTRO, valor("acompanantes"), "todas"),
    orden: unoDe(ORDENES_INVITADOS, valor("orden"), "nombre"),
  };
}

export function filtrarGrupos<T extends GrupoInvitacion>(
  grupos: T[],
  {
    busqueda,
    estado,
    lado = "todos",
    acompanantes = "todas",
  }: Pick<FiltrosInvitados, "busqueda" | "estado"> &
    Partial<Pick<FiltrosInvitados, "lado" | "acompanantes">>,
): T[] {
  return grupos.filter((grupo) => {
    if (!coincide(grupo, busqueda)) return false;
    if (lado !== "todos" && grupo.lado !== lado) return false;
    if (acompanantes === "con" && grupo.maximoAcompanantes === 0) return false;
    if (acompanantes === "sin" && grupo.maximoAcompanantes > 0) return false;
    // «Contestado» es que no quede nadie por contestar. Un grupo vacío no
    // cuenta como contestado: no ha contestado nadie porque no hay nadie.
    if (estado === "sin-contestar") return grupo.pendientes > 0;
    if (estado === "contestado") return grupo.pendientes === 0 && grupo.personas > 0;
    return true;
  });
}

const porNombre = (a: GrupoInvitacion, b: GrupoInvitacion) =>
  a.nombre.localeCompare(b.nombre, IDIOMA);

/** Una copia ordenada; el desempate es siempre el nombre, para que no baile. */
export function ordenarGrupos<T extends GrupoInvitacion>(
  grupos: T[],
  orden: OrdenInvitados,
): T[] {
  const copia = [...grupos];
  switch (orden) {
    case "sin-contestar":
      return copia.sort((a, b) => b.pendientes - a.pendientes || porNombre(a, b));
    case "personas":
      return copia.sort((a, b) => b.personas - a.personas || porNombre(a, b));
    case "envio":
      // Primero a quien no se le ha mandado; luego, a quien hace más que se le mandó.
      return copia.sort((a, b) => {
        const enviadaA = a.invitacionEnviadaEn?.getTime() ?? -Infinity;
        const enviadaB = b.invitacionEnviadaEn?.getTime() ?? -Infinity;
        return enviadaA - enviadaB || porNombre(a, b);
      });
    default:
      return copia.sort(porNombre);
  }
}
