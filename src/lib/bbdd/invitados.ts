import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * LOS INVITADOS, DESDE EL PANEL
 *
 * A diferencia de la landing, esto NO va por SQL directo: va por el cliente de
 * Supabase con la sesión de quien ha entrado. La razón es la misma que hace que
 * el panel exista — aquí RLS tiene que ver *quién* pregunta. Con SQL directo
 * habría que suplantar el rol a mano y las políticas dejarían de proteger nada.
 *
 * Un lector lee y un editor escribe, y eso lo decide la base. Aquí no se
 * comprueba el rol para autorizar: se comprueba para no ofrecer un botón que va
 * a fallar.
 */

export interface GrupoInvitacion {
  id: string;
  nombre: string;
  lado: "novia" | "novio" | "ambos";
  maximoAcompanantes: number;
  tokenEmitidoEn: Date | null;
  personas: number;
  confirmados: number;
  rechazados: number;
  pendientes: number;
  /** Nombres, para que la búsqueda encuentre por persona y no sólo por grupo. */
  nombresPersonas: string[];
}

export interface PersonaDelGrupo {
  id: string;
  nombre: string;
  apellidos: string | null;
  esNino: boolean;
  esAcompanante: boolean;
  tipoMenu: string;
  alergias: string | null;
  estado: string;
}

/**
 * Las filas tal y como llegan de PostgREST: en `snake_case` y con las
 * relaciones anidadas. Se escriben a mano porque el cliente de Supabase, sin
 * los tipos generados del proyecto, devuelve `any` para las consultas con
 * relaciones — y un `any` aquí sería no tener tipos justo donde más falta hacen.
 */
interface FilaConfirmacion {
  estado: string;
  es_vigente: boolean;
}

interface FilaPersona {
  id: string;
  nombre: string;
  apellidos: string | null;
  es_nino: boolean;
  es_acompanante: boolean;
  tipo_menu: string;
  alergias: string | null;
  confirmaciones: FilaConfirmacion[];
}

interface FilaGrupo {
  id: string;
  nombre: string;
  lado: string;
  maximo_acompanantes: number;
  token_emitido_en: string | null;
  /** En la lista se piden menos columnas de cada persona que en la ficha. */
  invitados: Partial<FilaPersona>[];
}

/** El estado que vale es el de la confirmación vigente; sin ella, pendiente. */
function estadoVigente(confirmaciones: FilaConfirmacion[] | undefined): string {
  return confirmaciones?.find((confirmacion) => confirmacion.es_vigente)?.estado ?? "pendiente";
}

/**
 * Todos los grupos con su recuento de respuestas.
 *
 * Se pide en UNA consulta con los invitados y su confirmación vigente
 * anidados. La alternativa —una consulta por grupo para contar— es el clásico
 * N+1: con ciento veinte invitaciones son ciento veintiuna idas y vueltas a la
 * base para pintar una tabla.
 */
export async function obtenerGrupos(): Promise<GrupoInvitacion[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("grupos_invitacion")
    .select(
      `id, nombre, lado, maximo_acompanantes, token_emitido_en,
       invitados ( nombre, apellidos, confirmaciones ( estado, es_vigente ) )`,
    )
    .order("nombre");

  if (error) throw new Error(`No se pudieron leer las invitaciones: ${error.message}`);

  return (data as unknown as FilaGrupo[]).map((fila) => {
    const personas = fila.invitados ?? [];
    const estados = personas.map((persona) => estadoVigente(persona.confirmaciones));

    return {
      id: fila.id,
      nombre: fila.nombre,
      lado: fila.lado as GrupoInvitacion["lado"],
      maximoAcompanantes: fila.maximo_acompanantes,
      tokenEmitidoEn: fila.token_emitido_en ? new Date(fila.token_emitido_en) : null,
      personas: personas.length,
      confirmados: estados.filter((estado) => estado === "confirmado").length,
      rechazados: estados.filter((estado) => estado === "rechazado").length,
      // Tentativo cuenta como pendiente en la tabla: para quien organiza, lo
      // que importa es si ya sabe el número o todavía no.
      pendientes: estados.filter((estado) => estado !== "confirmado" && estado !== "rechazado")
        .length,
      nombresPersonas: personas.map((persona) =>
        [persona.nombre, persona.apellidos].filter(Boolean).join(" "),
      ),
    };
  });
}

export interface DetalleGrupo extends GrupoInvitacion {
  gente: PersonaDelGrupo[];
}

/** Un grupo con su gente. `null` si no existe o si RLS no lo deja ver. */
export async function obtenerGrupo(id: string): Promise<DetalleGrupo | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("grupos_invitacion")
    .select(
      `id, nombre, lado, maximo_acompanantes, token_emitido_en,
       invitados ( id, nombre, apellidos, es_nino, es_acompanante, tipo_menu, alergias,
                   confirmaciones ( estado, es_vigente ) )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer la invitación: ${error.message}`);
  if (!data) return null;

  const fila = data as unknown as Omit<FilaGrupo, "invitados"> & { invitados: FilaPersona[] };

  const gente: PersonaDelGrupo[] = (fila.invitados ?? [])
    .map((persona) => ({
      id: persona.id,
      nombre: persona.nombre,
      apellidos: persona.apellidos,
      esNino: persona.es_nino,
      esAcompanante: persona.es_acompanante,
      tipoMenu: persona.tipo_menu,
      alergias: persona.alergias,
      estado: estadoVigente(persona.confirmaciones),
    }))
    // Mismo orden que ve el invitado en su enlace: los titulares primero.
    .sort(
      (a, b) =>
        Number(a.esAcompanante) - Number(b.esAcompanante) || a.nombre.localeCompare(b.nombre),
    );

  return {
    id: fila.id,
    nombre: fila.nombre,
    lado: fila.lado as GrupoInvitacion["lado"],
    maximoAcompanantes: fila.maximo_acompanantes,
    tokenEmitidoEn: fila.token_emitido_en ? new Date(fila.token_emitido_en) : null,
    personas: gente.length,
    confirmados: gente.filter((persona) => persona.estado === "confirmado").length,
    rechazados: gente.filter((persona) => persona.estado === "rechazado").length,
    pendientes: gente.filter(
      (persona) => persona.estado !== "confirmado" && persona.estado !== "rechazado",
    ).length,
    nombresPersonas: gente.map((persona) =>
      [persona.nombre, persona.apellidos].filter(Boolean).join(" "),
    ),
    gente,
  };
}
