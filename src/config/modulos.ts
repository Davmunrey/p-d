import {
  RUTA_AJUSTES,
  RUTA_CUENTA,
  RUTA_DIA,
  RUTA_DOCUMENTOS,
  RUTA_INVITADOS,
  RUTA_MEDIOS,
  RUTA_MENSAJES,
  RUTA_MESAS,
  RUTA_PANEL,
  RUTA_PRESUPUESTO,
  RUTA_PROVEEDORES,
  RUTA_TAREAS,
} from "./constants";

/**
 * LOS MÓDULOS DEL PANEL
 *
 * La lista de lo que hay dentro, y —lo importante— qué está terminado.
 *
 * POR QUÉ EXISTE `entregado`
 *
 * Un menú que enseña ocho módulos cuando funcionan dos no es una promesa: es
 * una trampa. Se pincha en «Mesas», sale un hueco, y a partir de ahí ya no se
 * sabe si lo que falla es la aplicación o la conexión. Peor aún el día de la
 * boda, con una mano ocupada y sin ganas de averiguarlo.
 *
 * Así que el menú enseña sólo lo que existe. Cada ticket que entrega su módulo
 * cambia su `false` por un `true` en la misma PR, y ese cambio de una palabra
 * es lo que lo hace visible. `tests/unidad/modulos.test.ts` comprueba que todo
 * lo marcado como entregado tiene de verdad su página: marcarlo antes de
 * tiempo pone el CI en rojo, que es exactamente cuando conviene enterarse.
 *
 * El orden es el del menú, y no es alfabético: es el de la cabeza de quien
 * organiza una boda. Primero cuántos somos, luego dónde se sientan y qué
 * comen, después quién lo trae y cuánto cuesta.
 */

export interface Modulo {
  /** Identifica el módulo y da su rótulo: `panel.modulos.<clave>`. */
  readonly clave: string;
  readonly ruta: string;
  /** `false` mientras no haya pantalla detrás. No aparece en el menú. */
  readonly entregado: boolean;
}

export const MODULOS = [
  { clave: "resumen", ruta: RUTA_PANEL, entregado: true },
  { clave: "invitados", ruta: RUTA_INVITADOS, entregado: true },
  { clave: "mensajes", ruta: RUTA_MENSAJES, entregado: true },
  { clave: "medios", ruta: RUTA_MEDIOS, entregado: true },
  { clave: "mesas", ruta: RUTA_MESAS, entregado: true },
  { clave: "menus", ruta: `${RUTA_PANEL}/menus`, entregado: false },
  { clave: "actividades", ruta: `${RUTA_PANEL}/actividades`, entregado: false },
  { clave: "proveedores", ruta: RUTA_PROVEEDORES, entregado: true },
  { clave: "presupuesto", ruta: RUTA_PRESUPUESTO, entregado: true },
  { clave: "tareas", ruta: RUTA_TAREAS, entregado: true },
  { clave: "documentos", ruta: RUTA_DOCUMENTOS, entregado: false },
  { clave: "dia", ruta: RUTA_DIA, entregado: false },
  { clave: "ajustes", ruta: RUTA_AJUSTES, entregado: true },
  { clave: "cuenta", ruta: RUTA_CUENTA, entregado: true },
] as const satisfies readonly Modulo[];

export type ClaveModulo = (typeof MODULOS)[number]["clave"];

/** Lo que se pinta en el menú. Lo demás todavía no existe. */
export const MODULOS_ENTREGADOS = MODULOS.filter((modulo) => modulo.entregado);

/**
 * Cuál de los módulos corresponde a una ruta.
 *
 * Un módulo se marca también en sus pantallas de dentro: estando en la ficha
 * de un invitado, el menú tiene que seguir señalando «Invitados».
 *
 * EL RESUMEN ES LA EXCEPCIÓN, porque su ruta es la raíz y todo cuelga de ella.
 * Si contara como prefijo, cualquier pantalla del panel saldría marcada como
 * «Resumen» y el menú dejaría de decir dónde está uno, que es su único
 * trabajo. Así que la raíz se marca sólo cuando se está exactamente en ella.
 */
export function moduloActivo(ruta: string): ClaveModulo | null {
  const encontrado = MODULOS_ENTREGADOS.find(
    (modulo) =>
      ruta === modulo.ruta ||
      (modulo.ruta !== RUTA_PANEL && ruta.startsWith(`${modulo.ruta}/`)),
  );

  return encontrado?.clave ?? null;
}
