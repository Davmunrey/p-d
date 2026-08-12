import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-83 y BODA-84 · LAS MESAS DEL BANQUETE, DESDE EL PANEL
 *
 * Dos preguntas distintas con los mismos datos: **dónde está cada mesa** (el
 * plano de la sala) y **quién se sienta en ella** (el reparto). Se leen juntas
 * porque separarlas obligaría a mirar dos pantallas para contestar la única
 * pregunta que se hace de verdad: «¿esto cabe?».
 *
 * VA POR EL CLIENTE DE SUPABASE CON LA SESIÓN DE QUIEN MIRA, como el resto del
 * panel y al revés que la landing. Aquí RLS tiene que ver *quién* pregunta: un
 * lector lee y un editor escribe, y eso lo decide la base.
 *
 * LAS COORDENADAS LLEGAN COMO CADENA. `posicion_x` es `numeric(8,2)` y PostgREST
 * serializa `numeric` como texto para no perder precisión por el camino. Sin
 * convertirlas, `posicionX + PASO` concatenaría dos cadenas y una mesa que
 * estaba en el 5000 acabaría en el «5000250».
 *
 * LAS ALERGIAS NO SE FILTRAN AQUÍ: salen de `v_alergias_por_mesa`. La
 * definición de «alergia que importa» —confirmación vigente, estado confirmado,
 * texto no vacío— vive en la base, y es el dato del proyecto donde equivocarse
 * tiene consecuencias médicas.
 */

/**
 * Las formas de mesa, en el orden del enumerado `forma_mesa` de la base.
 *
 * Añadir una forma es una migración, no una línea aquí: un desplegable que
 * ofrezca un valor que el enumerado no conoce es un formulario que falla al
 * guardar y no antes.
 */
export const FORMAS_MESA = [
  "redonda",
  "ovalada",
  "rectangular",
  "cuadrada",
  "imperial",
] as const;

export type FormaMesa = (typeof FORMAS_MESA)[number];

/** La forma en la que nace una mesa, igual que el `default` de la tabla. */
export const FORMA_INICIAL_MESA: FormaMesa = "redonda";

/**
 * LA PRESIDENCIA ES UNA FORMA, NO UNA MARCA APARTE.
 *
 * Es la mesa imperial: una sola en la sala, alargada, con los novios. Se
 * distingue por su forma y no por una columna `es_presidencia` porque una
 * columna así admite dos presidencias y ninguna, y las dos cosas son un error
 * que nadie ve hasta el día de la boda.
 */
export const FORMA_PRESIDENCIA: FormaMesa = "imperial";

export function esFormaMesa(valor: string): valor is FormaMesa {
  return (FORMAS_MESA as readonly string[]).includes(valor);
}

/** El estado de la confirmación de quien sí viene. */
export const ESTADO_CONFIRMADO = "confirmado";

/** El de quien ha dicho que no. A ése no se le sienta en ninguna mesa. */
export const ESTADO_RECHAZADO = "rechazado";

export interface Mesa {
  id: string;
  nombre: string;
  capacidad: number;
  forma: FormaMesa;
  /** `null` en las dos o en ninguna: la base lo impone con un `check`. */
  posicionX: number | null;
  posicionY: number | null;
  notas: string | null;
}

export interface Comensal {
  id: string;
  nombre: string;
  apellidos: string | null;
  nombreCompleto: string;
  esNino: boolean;
  tipoMenu: string;
  alergias: string | null;
  /** El de la confirmación vigente; sin ella, pendiente. */
  estado: string;
  mesaId: string | null;
  grupoId: string;
  grupoNombre: string;
}

export interface AlergiaEnMesa {
  mesaId: string | null;
  mesa: string | null;
  nombre: string;
  apellidos: string | null;
  tipoMenu: string;
  esNino: boolean;
  alergias: string;
}

/** Un grupo de invitación con su gente: llegan juntos y se sientan juntos. */
export interface GrupoSinSentar {
  id: string;
  nombre: string;
  personas: Comensal[];
}

/* -------------------------------------------------------------------------- */
/*  Lecturas                                                                  */
/* -------------------------------------------------------------------------- */

interface FilaMesa {
  id: string;
  nombre: string;
  capacidad: number;
  forma: string;
  posicion_x: string | number | null;
  posicion_y: string | number | null;
  notas: string | null;
}

/**
 * Una coordenada tal y como llega → un número.
 *
 * `numeric` viaja como cadena. Se devuelve `null` para lo que no sea un número
 * en vez de un cero: un cero es una esquina del lienzo, y una mesa que aparece
 * en la esquina superior izquierda parece colocada cuando no lo está.
 */
function aCoordenada(valor: string | number | null): number | null {
  if (valor === null) return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export async function obtenerMesas(): Promise<Mesa[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("mesas")
    .select("id, nombre, capacidad, forma, posicion_x, posicion_y, notas")
    .order("nombre");

  if (error) {
    console.error("No se pudieron leer las mesas:", error);
    return [];
  }

  return ((data ?? []) as unknown as FilaMesa[]).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    capacidad: fila.capacidad,
    forma: fila.forma as FormaMesa,
    posicionX: aCoordenada(fila.posicion_x),
    posicionY: aCoordenada(fila.posicion_y),
    notas: fila.notas,
  }));
}

interface FilaConfirmacion {
  estado: string;
  es_vigente: boolean;
}

interface FilaComensal {
  id: string;
  nombre: string;
  apellidos: string | null;
  nombre_completo: string;
  es_nino: boolean;
  tipo_menu: string;
  alergias: string | null;
  mesa_id: string | null;
  grupo_id: string;
  /**
   * PostgREST devuelve un objeto para una relación «hacia uno» y un array para
   * las «hacia muchos». Se admiten las dos formas porque el criterio depende de
   * que PostgREST reconozca la clave ajena, y el día que no la reconozca —una
   * vista por medio, un alias— la pantalla se quedaría sin el nombre del grupo
   * en silencio, que es lo único que hace legible la bolsa de «sin mesa».
   */
  grupos_invitacion: { nombre: string } | { nombre: string }[] | null;
  confirmaciones: FilaConfirmacion[];
}

/** El estado que vale es el de la confirmación vigente; sin ella, pendiente. */
function estadoVigente(confirmaciones: FilaConfirmacion[] | undefined): string {
  return confirmaciones?.find((confirmacion) => confirmacion.es_vigente)?.estado ?? "pendiente";
}

function nombreDelGrupo(fila: FilaComensal): string {
  const grupo = fila.grupos_invitacion;
  if (Array.isArray(grupo)) return grupo[0]?.nombre ?? "";
  return grupo?.nombre ?? "";
}

/**
 * Todo el mundo, con su mesa, su grupo y su respuesta.
 *
 * Se pide en UNA consulta con el grupo y la confirmación vigente anidados. La
 * alternativa —una consulta por persona para saber si viene— es el clásico N+1:
 * con ciento veinte invitados son ciento veintiuna idas y vueltas para pintar
 * un plano.
 */
export async function obtenerComensales(): Promise<Comensal[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("invitados")
    .select(
      `id, nombre, apellidos, nombre_completo, es_nino, tipo_menu, alergias,
       mesa_id, grupo_id,
       grupos_invitacion ( nombre ),
       confirmaciones ( estado, es_vigente )`,
    )
    .order("nombre_completo");

  if (error) {
    console.error("No se pudieron leer los invitados de las mesas:", error);
    return [];
  }

  return ((data ?? []) as unknown as FilaComensal[]).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    nombreCompleto: fila.nombre_completo || fila.nombre,
    esNino: fila.es_nino,
    tipoMenu: fila.tipo_menu,
    alergias: fila.alergias,
    estado: estadoVigente(fila.confirmaciones),
    mesaId: fila.mesa_id,
    grupoId: fila.grupo_id,
    grupoNombre: nombreDelGrupo(fila),
  }));
}

interface FilaAlergia {
  mesa: string | null;
  mesa_id: string | null;
  nombre: string;
  apellidos: string | null;
  tipo_menu: string;
  es_nino: boolean;
  alergias: string;
}

/** Quién tiene alergia anotada y dónde se sienta. Sale de la vista, no de aquí. */
export async function obtenerAlergiasPorMesa(): Promise<AlergiaEnMesa[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_alergias_por_mesa")
    .select("mesa, mesa_id, nombre, apellidos, tipo_menu, es_nino, alergias")
    .order("mesa", { nullsFirst: true })
    .order("nombre");

  if (error) {
    console.error("No se pudieron leer las alergias por mesa:", error);
    return [];
  }

  return ((data ?? []) as unknown as FilaAlergia[]).map((fila) => ({
    mesaId: fila.mesa_id,
    mesa: fila.mesa,
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    tipoMenu: fila.tipo_menu,
    esNino: fila.es_nino,
    alergias: fila.alergias,
  }));
}

/**
 * Cuánta gente hay sentada en una mesa, contada EN LA BASE.
 *
 * Se cuenta aquí y no sobre la lista que tenga la pantalla porque de esto
 * depende negarse a pasar de la capacidad, y la lista de la pantalla es de hace
 * unos segundos. Entre que se pintó y se pulsó el botón, la otra mitad de la
 * pareja pudo sentar a tres personas desde su móvil.
 *
 * `excluyendoGrupo` deja fuera a los del grupo que se está sentando: sin eso,
 * mover a un grupo que YA está en esa mesa se contaría dos veces y la mesa
 * parecería llena por gente que sigue siendo la misma.
 *
 * Devuelve `null` si la base no contesta, y NO un cero. Un cero inventado
 * abriría la mesa de par en par justo cuando no se puede comprobar nada, que es
 * el peor momento posible para dar una plaza por buena.
 */
export async function contarSentados(
  mesaId: string,
  excluyendoGrupo?: string,
): Promise<number | null> {
  const supabase = await clienteServidor();

  let consulta = supabase
    .from("invitados")
    .select("id", { count: "exact", head: true })
    .eq("mesa_id", mesaId);

  if (excluyendoGrupo) consulta = consulta.neq("grupo_id", excluyendoGrupo);

  const { count, error } = await consulta;

  if (error) {
    console.error("No se pudo contar quién está sentado:", error);
    return null;
  }

  return count ?? 0;
}

/** Una mesa suelta, para las acciones. `null` si no existe o si RLS no la deja ver. */
export async function obtenerMesa(id: string): Promise<Mesa | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("mesas")
    .select("id, nombre, capacidad, forma, posicion_x, posicion_y, notas")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer la mesa:", error);
    return null;
  }
  if (!data) return null;

  const fila = data as unknown as FilaMesa;
  return {
    id: fila.id,
    nombre: fila.nombre,
    capacidad: fila.capacidad,
    forma: fila.forma as FormaMesa,
    posicionX: aCoordenada(fila.posicion_x),
    posicionY: aCoordenada(fila.posicion_y),
    notas: fila.notas,
  };
}

/** Dónde está sentada una persona y si viene. `null` si no existe. */
export async function obtenerSitioDeInvitado(
  id: string,
): Promise<{ mesaId: string | null; estado: string } | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("invitados")
    .select("mesa_id, confirmaciones ( estado, es_vigente )")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer a quién se está sentando:", error);
    return null;
  }
  if (!data) return null;

  const fila = data as unknown as {
    mesa_id: string | null;
    confirmaciones: FilaConfirmacion[];
  };

  return { mesaId: fila.mesa_id, estado: estadoVigente(fila.confirmaciones) };
}

/**
 * A quién de un grupo se puede sentar.
 *
 * QUIEN HA DICHO QUE NO VIENE QUEDA FUERA, y no es una decisión de pantalla: es
 * lo que significa «sentar al grupo». Un rechazado ocupando silla descuadra el
 * recuento del catering y deja un hueco vacío en la foto de la mesa. Los que
 * todavía no han contestado sí entran —se avisa de que están sin confirmar—,
 * porque el reparto se hace antes de que conteste todo el mundo o no se hace.
 */
export async function obtenerSentablesDelGrupo(
  grupoId: string,
): Promise<{ id: string; estado: string }[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("invitados")
    .select("id, confirmaciones ( estado, es_vigente )")
    .eq("grupo_id", grupoId);

  if (error) {
    console.error("No se pudo leer la gente del grupo:", error);
    return [];
  }

  return ((data ?? []) as unknown as { id: string; confirmaciones: FilaConfirmacion[] }[])
    .map((fila) => ({ id: fila.id, estado: estadoVigente(fila.confirmaciones) }))
    .filter((persona) => persona.estado !== ESTADO_RECHAZADO);
}

/* -------------------------------------------------------------------------- */
/*  Agrupaciones                                                              */
/* -------------------------------------------------------------------------- */

/** Quién se sienta en cada mesa. La clave es el `id` de la mesa. */
export function agruparPorMesa(comensales: Comensal[]): Map<string, Comensal[]> {
  const mapa = new Map<string, Comensal[]>();
  for (const persona of comensales) {
    if (!persona.mesaId) continue;
    const gente = mapa.get(persona.mesaId);
    if (gente) gente.push(persona);
    else mapa.set(persona.mesaId, [persona]);
  }
  return mapa;
}

/** Las alergias de cada mesa. Las de quien todavía no está sentado, en `null`. */
export function agruparAlergias(
  alergias: AlergiaEnMesa[],
): Map<string | null, AlergiaEnMesa[]> {
  const mapa = new Map<string | null, AlergiaEnMesa[]>();
  for (const fila of alergias) {
    const gente = mapa.get(fila.mesaId);
    if (gente) gente.push(fila);
    else mapa.set(fila.mesaId, [fila]);
  }
  return mapa;
}

/**
 * La bolsa de «sin mesa», partida por grupo de invitación.
 *
 * POR GRUPO Y NO POR ORDEN ALFABÉTICO, que es toda la decisión: los invitados
 * llegan en familias y se sientan en familias. Una lista alfabética obliga a
 * reconstruir mentalmente quién va con quién en cada asignación, y ahí es donde
 * se separa a un matrimonio sin darse cuenta.
 *
 * El orden lo pone el grupo más numeroso primero: los que peor encajan son los
 * que hay que colocar mientras quedan mesas enteras libres.
 */
export function agruparPorGrupo(comensales: Comensal[]): GrupoSinSentar[] {
  const mapa = new Map<string, GrupoSinSentar>();

  for (const persona of comensales) {
    const grupo = mapa.get(persona.grupoId);
    if (grupo) grupo.personas.push(persona);
    else
      mapa.set(persona.grupoId, {
        id: persona.grupoId,
        nombre: persona.grupoNombre,
        personas: [persona],
      });
  }

  return [...mapa.values()].sort(
    (a, b) => b.personas.length - a.personas.length || a.nombre.localeCompare(b.nombre),
  );
}
