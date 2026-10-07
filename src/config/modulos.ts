import {
  RUTA_AGENDA_DIA,
  RUTA_AJUSTES,
  RUTA_BUSCAR_DIA,
  RUTA_COMPARADOR,
  RUTA_CONTENIDO,
  RUTA_CUENTA,
  RUTA_DIA,
  RUTA_DOCUMENTOS,
  RUTA_EXPORTAR_DIA,
  RUTA_GASTOS,
  RUTA_GRAFICAS,
  RUTA_GUION_DIA,
  RUTA_IMPORTAR,
  RUTA_INVITADOS,
  RUTA_MEDIOS,
  RUTA_MENSAJES,
  RUTA_MESAS,
  RUTA_PAGOS,
  RUTA_PANEL,
  RUTA_PENDIENTES,
  RUTA_PRESUPUESTO,
  RUTA_PROVEEDORES,
  RUTA_RECUENTO,
  RUTA_TAREAS,
} from "./constants";
import { CLAVES_LISTA } from "./contenido-landing";

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
 *
 *
 * Y VA EN GRUPOS. Trece módulos en una columna de rótulos iguales no se leen:
 * se recorren de arriba abajo cada vez, buscando. Agrupados por la pregunta
 * que contestan —quién viene, qué hay que preparar, qué ve la web, qué pasa el
 * día— el ojo va al grupo y después al módulo. El resumen va suelto arriba
 * porque es la puerta, y ajustes y la cuenta van al pie porque se tocan poco.
 */

/** Los grupos del menú, en su orden. Su rótulo es `panel.grupos.<clave>`. */
export const GRUPOS_DE_MODULOS = ["quienViene", "preparativos", "web", "dia"] as const;

export type ClaveGrupo = (typeof GRUPOS_DE_MODULOS)[number];

/** Dónde se pinta un módulo: suelto arriba, en un grupo o en el pie. */
export type LugarEnElMenu = "inicio" | ClaveGrupo | "pie";

export interface Modulo {
  /** Identifica el módulo y da su rótulo: `panel.modulos.<clave>`. */
  readonly clave: string;
  readonly ruta: string;
  /** `false` mientras no haya pantalla detrás. No aparece en el menú. */
  readonly entregado: boolean;
  readonly lugar: LugarEnElMenu;
}

export const MODULOS = [
  { clave: "resumen", ruta: RUTA_PANEL, entregado: true, lugar: "inicio" },
  { clave: "invitados", ruta: RUTA_INVITADOS, entregado: true, lugar: "quienViene" },
  { clave: "mesas", ruta: RUTA_MESAS, entregado: true, lugar: "quienViene" },
  { clave: "mensajes", ruta: RUTA_MENSAJES, entregado: true, lugar: "quienViene" },
  { clave: "proveedores", ruta: RUTA_PROVEEDORES, entregado: true, lugar: "preparativos" },
  { clave: "presupuesto", ruta: RUTA_PRESUPUESTO, entregado: true, lugar: "preparativos" },
  { clave: "tareas", ruta: RUTA_TAREAS, entregado: true, lugar: "preparativos" },
  { clave: "documentos", ruta: RUTA_DOCUMENTOS, entregado: true, lugar: "preparativos" },
  { clave: "menus", ruta: `${RUTA_PANEL}/menus`, entregado: false, lugar: "preparativos" },
  // Las dos mitades de la web pública, juntas y en este orden: primero lo que
  // dice, después lo que se ve.
  { clave: "contenido", ruta: RUTA_CONTENIDO, entregado: true, lugar: "web" },
  { clave: "medios", ruta: RUTA_MEDIOS, entregado: true, lugar: "web" },
  { clave: "dia", ruta: RUTA_DIA, entregado: true, lugar: "dia" },
  { clave: "actividades", ruta: `${RUTA_PANEL}/actividades`, entregado: false, lugar: "dia" },
  { clave: "ajustes", ruta: RUTA_AJUSTES, entregado: true, lugar: "pie" },
  { clave: "cuenta", ruta: RUTA_CUENTA, entregado: true, lugar: "pie" },
] as const satisfies readonly Modulo[];

export type ClaveModulo = (typeof MODULOS)[number]["clave"];

/** Lo que se pinta en el menú. Lo demás todavía no existe. */
export const MODULOS_ENTREGADOS = MODULOS.filter((modulo) => modulo.entregado);

/** Los módulos entregados de un sitio del menú, en su orden. */
export function modulosDe(lugar: LugarEnElMenu) {
  return MODULOS_ENTREGADOS.filter((modulo) => modulo.lugar === lugar);
}

/**
 * LO QUE VA FIJO EN LA BARRA DEL MÓVIL. Cinco huecos caben a 390 px con su
 * icono y su rótulo enteros; trece no cabían ni desplazándose, que es como
 * estaba: había que arrastrar la tira para buscar cada destino. Estos cuatro
 * son lo que se mira con el móvil en la mano —cómo va todo, quién ha
 * confirmado, qué falta y el propio día— y el quinto hueco es «Más», con el
 * menú entero agrupado.
 */
export const MODULOS_EN_LA_BARRA = [
  "resumen",
  "invitados",
  "tareas",
  "dia",
] as const satisfies readonly ClaveModulo[];

/* -------------------------------------------------------------------------- */
/*  Las pestañas de dentro de cada módulo                                     */
/* -------------------------------------------------------------------------- */

/**
 * LAS SUBPANTALLAS, CON PESTAÑAS Y NO CON ENLACES SUELTOS.
 *
 * Gastos, pagos y gráficas estaban detrás de tres enlaces pequeños bajo la
 * descripción del presupuesto, y para volver había un «Volver al presupuesto»
 * distinto en cada una; en el día de la boda, una fila de baldosas y un
 * «Volver» en cada pantalla. Nada decía en cuál de ellas estaba uno ni cuántas
 * había. Con pestañas, las hermanas se ven todas, siempre en el mismo sitio, y
 * la que está abierta se marca.
 *
 * `rotulo` es la clave de copy; las listas de contenido usan su propio título.
 */
export interface Pestana {
  readonly clave: string;
  readonly ruta: string;
  readonly rotulo: string;
}

export const PESTANAS = {
  invitados: [
    { clave: "invitaciones", ruta: RUTA_INVITADOS, rotulo: "panel.pestanas.invitaciones" },
    { clave: "sinContestar", ruta: RUTA_PENDIENTES, rotulo: "panel.pestanas.sinContestar" },
    { clave: "importar", ruta: RUTA_IMPORTAR, rotulo: "panel.pestanas.importar" },
  ],
  proveedores: [
    { clave: "lista", ruta: RUTA_PROVEEDORES, rotulo: "panel.pestanas.proveedores" },
    { clave: "comparar", ruta: RUTA_COMPARADOR, rotulo: "panel.pestanas.comparar" },
  ],
  presupuesto: [
    { clave: "categorias", ruta: RUTA_PRESUPUESTO, rotulo: "panel.pestanas.categorias" },
    { clave: "gastos", ruta: RUTA_GASTOS, rotulo: "panel.pestanas.gastos" },
    { clave: "pagos", ruta: RUTA_PAGOS, rotulo: "panel.pestanas.pagos" },
    { clave: "graficas", ruta: RUTA_GRAFICAS, rotulo: "panel.pestanas.graficas" },
  ],
  contenido: [
    { clave: "secciones", ruta: RUTA_CONTENIDO, rotulo: "panel.pestanas.secciones" },
    ...CLAVES_LISTA.map((lista) => ({
      clave: lista,
      ruta: `${RUTA_CONTENIDO}/${lista}`,
      rotulo: `panel.contenido.listas.${lista}.titulo`,
    })),
  ],
  dia: [
    { clave: "ahora", ruta: RUTA_DIA, rotulo: "panel.pestanas.ahora" },
    { clave: "guion", ruta: RUTA_GUION_DIA, rotulo: "panel.pestanas.guion" },
    { clave: "agenda", ruta: RUTA_AGENDA_DIA, rotulo: "panel.pestanas.agenda" },
    { clave: "buscar", ruta: RUTA_BUSCAR_DIA, rotulo: "panel.pestanas.buscar" },
    { clave: "recuento", ruta: RUTA_RECUENTO, rotulo: "panel.pestanas.recuento" },
    { clave: "exportar", ruta: RUTA_EXPORTAR_DIA, rotulo: "panel.pestanas.exportar" },
  ],
} as const satisfies Partial<Record<ClaveModulo, readonly Pestana[]>>;

export type ModuloConPestanas = keyof typeof PESTANAS;

/**
 * Qué pestaña corresponde a una ruta: la de ruta más larga que la contenga.
 *
 * La primera pestaña de cada módulo es su raíz, y todas las demás cuelgan de
 * ella: «la que encaje» marcaría siempre la primera. Con la más larga, la
 * ficha de un invitado sigue en «Invitaciones» y «Sin contestar» se marca a sí
 * misma.
 */
export function pestanaActiva(ruta: string, pestanas: readonly Pestana[]): string | null {
  const encajan = pestanas.filter(
    (pestana) => ruta === pestana.ruta || ruta.startsWith(`${pestana.ruta}/`),
  );
  const masLarga = encajan.reduce<Pestana | null>(
    (mejor, pestana) => (!mejor || pestana.ruta.length > mejor.ruta.length ? pestana : mejor),
    null,
  );
  return masLarga?.clave ?? null;
}

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
