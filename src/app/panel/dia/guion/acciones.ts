"use server";

import { redirect } from "next/navigation";

import { LARGOS_DE_CAMPO, ORDEN_MAXIMO, RUTA_ACCESO, RUTA_GUION_DIA } from "@/config/constants";
import { esIdentificador } from "@/lib/identificador";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoGuion } from "./estado";

/**
 * BODA-100 (#67) · ESCRIBIR EL GUION DE LA JORNADA
 *
 * La lista de control del día se entregó sabiendo marcar y sin saber escribir:
 * la pantalla decía «se escribe punto a punto» y no había dónde. Con la base
 * recién migrada el guion sólo se podía llenar desde el editor SQL.
 *
 * QUIÉN PUEDE LO DECIDE LA BASE (`guion_dia_escribir` exige `puede_editar()`).
 * El rol se mira antes de escribir sólo para que el «cero filas» de RLS
 * signifique una sola cosa: que el punto ya no está.
 *
 * LOS TOPES SON LOS `check` DE `guion_dia`, citados en `LARGOS_DE_CAMPO`. Se
 * comprueban aquí para poder decir cuál, en vez de «no se ha podido guardar».
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

function opcional(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

function volver(estado: EstadoGuion, extra?: Record<string, string>): never {
  const parametros = new URLSearchParams({ estado, ...extra });
  redirect(`${RUTA_GUION_DIA}?${parametros.toString()}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso");
  return clienteServidor();
}

function motivo(error: { code?: string; message?: string }): EstadoGuion {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";
  // Un tope que se escapó de la comprobación de abajo: se dice como tal.
  if (error.code === "23514") return "largo";
  console.error("Fallo escribiendo en el guion del día:", error);
  return "error";
}

interface ValoresPunto {
  hora: string;
  titulo: string;
  responsable: string | null;
  notas: string | null;
  /** `null` es «al final»: lo resuelve `alFinal()` al escribir. */
  orden: number | null;
}

/**
 * Los campos de un punto, ya validados.
 *
 * LA HORA ES TEXTO, como en el programa de la landing: «13:15» se escribe, pero
 * también «al acabar el cóctel», que es como se organiza de verdad una boda.
 *
 * EL ORDEN VACÍO ES «AL FINAL». La pantalla lo propone relleno con el siguiente
 * número; quien lo borra está diciendo que le da igual dónde, no que es cero.
 * Se devuelve `null` y lo resuelve `alFinal()` contra la base: un 99 fijo caía
 * entre el 90 y el 100 de un guion numerado de diez en diez, a media tarde.
 */
function camposPunto(
  datos: FormData,
): { ok: false; estado: EstadoGuion } | { ok: true; valores: ValoresPunto } {
  const hora = texto(datos, "hora");
  if (!hora) return { ok: false, estado: "hora" };

  const titulo = texto(datos, "titulo");
  if (!titulo) return { ok: false, estado: "titulo" };

  const responsable = opcional(datos, "responsable");
  const notas = opcional(datos, "notas");

  if (
    hora.length > LARGOS_DE_CAMPO["guion_dia.hora"] ||
    titulo.length > LARGOS_DE_CAMPO["guion_dia.titulo"] ||
    (responsable?.length ?? 0) > LARGOS_DE_CAMPO["guion_dia.responsable"] ||
    (notas?.length ?? 0) > LARGOS_DE_CAMPO["guion_dia.notas"]
  ) {
    return { ok: false, estado: "largo" };
  }

  const ordenEscrito = texto(datos, "orden");
  const orden = ordenEscrito ? Number(ordenEscrito) : null;
  if (orden !== null && (!Number.isInteger(orden) || orden < 0 || orden > ORDEN_MAXIMO)) {
    return { ok: false, estado: "orden" };
  }

  return { ok: true, valores: { hora, titulo, responsable, notas, orden } };
}

/** El orden de «al final»: uno más que el último del guion, sin pasar del tope. */
async function alFinal(supabase: Awaited<ReturnType<typeof cliente>>): Promise<number> {
  const { data } = await supabase
    .from("guion_dia")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle<{ orden: number }>();
  return Math.min((data?.orden ?? -1) + 1, ORDEN_MAXIMO);
}

export async function crearPunto(datos: FormData): Promise<void> {
  const campos = camposPunto(datos);
  if (!campos.ok) volver(campos.estado);

  const supabase = await cliente();
  const orden = campos.valores.orden ?? (await alFinal(supabase));
  const { data, error } = await supabase
    .from("guion_dia")
    .insert({ ...campos.valores, orden })
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("creado");
}

export async function editarPunto(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!esIdentificador(id)) volver("no-existe");

  const campos = camposPunto(datos);
  // Se vuelve con el punto abierto, para que el aviso caiga junto a su formulario.
  if (!campos.ok) volver(campos.estado, { punto: id });

  /*
    `hecho_en` NO SE TOCA. Corregir la hora de un punto que ya se hizo no lo
    deshace: la marca dice cuándo pasó, y eso no cambia por arreglar un typo.
  */
  const supabase = await cliente();
  const orden = campos.valores.orden ?? (await alFinal(supabase));
  const { data, error } = await supabase
    .from("guion_dia")
    .update({ ...campos.valores, orden })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), { punto: id });
  if (!data?.length) volver("no-existe");

  volver("editado");
}

/**
 * Quitar un punto no pregunta antes, como un servicio de proveedor: es una
 * línea que se vuelve a escribir en lo que se tarda en confirmar que se quiere
 * borrar.
 */
export async function borrarPunto(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!esIdentificador(id)) volver("no-existe");

  const supabase = await cliente();
  const { data, error } = await supabase.from("guion_dia").delete().eq("id", id).select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("no-existe");

  volver("borrado");
}
