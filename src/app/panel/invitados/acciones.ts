"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  LONGITUD_MINIMA_NOMBRE,
  MAXIMO_ACOMPANANTES,
  RUTA_ACCESO,
  RUTA_INVITADOS,
} from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * BODA-50/51/52 · LAS INVITACIONES, DESDE EL PANEL
 *
 * Crear un grupo, meterle gente y emitir su enlace. Es lo que le faltaba al
 * RSVP para servir de algo: sin esto, la única forma de invitar a alguien era
 * escribir SQL a mano en el editor de Supabase.
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE, no este fichero. Las políticas
 * `grupos_invitacion_editor_escribir` e `invitados_editor_escribir` exigen
 * `puede_editar()`, y las dos funciones `security definer` lo comprueban otra
 * vez por su cuenta. Aquí sólo se traduce ese «no» a una frase en castellano.
 *
 * OJO CON EL SILENCIO DE RLS: una escritura prohibida no da error, devuelve
 * cero filas tocadas. Por eso cada operación mira el recuento y no sólo el
 * `error`.
 */

type Estado =
  | "creada"
  | "enlace-emitido"
  | "persona-anadida"
  | "persona-quitada"
  | "nombre"
  | "nombre-persona"
  | "acompanantes"
  | "no-existe"
  | "quitar-con-respuesta"
  | "sin-permiso"
  | "error";

const LADOS = ["novia", "novio", "ambos"] as const;

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/**
 * Vuelve a la pantalla con el resultado. Cuando hay grupo se vuelve a su
 * ficha: quien acaba de añadir a alguien quiere seguir ahí, no en la lista.
 */
function volver(estado: Estado, grupoId?: string): never {
  const base = grupoId ? `${RUTA_INVITADOS}/${grupoId}` : RUTA_INVITADOS;
  redirect(`${base}?estado=${estado}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * Crea la invitación y devuelve su enlace en el mismo paso.
 *
 * El token viaja en la URL de vuelta porque **sólo se puede enseñar una vez**:
 * la base guarda su huella, no el secreto. Guardarlo en otro sitio para
 * enseñarlo luego sería deshacer justo esa decisión.
 */
export async function crearInvitacion(datos: FormData): Promise<void> {
  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) volver("nombre");

  const ladoBruto = texto(datos, "lado");
  const lado = (LADOS as readonly string[]).includes(ladoBruto) ? ladoBruto : "ambos";

  const acompanantes = Number(texto(datos, "maximo_acompanantes") || "0");
  if (
    !Number.isInteger(acompanantes) ||
    acompanantes < 0 ||
    acompanantes > MAXIMO_ACOMPANANTES
  ) {
    volver("acompanantes");
  }

  const supabase = await cliente();
  const { data, error } = await supabase.rpc("crear_grupo_invitacion", {
    p_nombre: nombre,
    p_maximo_acompanantes: acompanantes,
    p_lado: lado,
  });

  if (error) {
    // RSV06 es «no eres editor». Cualquier otra cosa es una avería nuestra.
    if (error.message.includes("RSV06")) volver("sin-permiso");
    console.error("No se pudo crear la invitación:", error);
    volver("error");
  }

  const creado = (data as { grupo_id: string; token: string }[] | null)?.[0];
  if (!creado) volver("error");

  revalidatePath(RUTA_INVITADOS);
  redirect(
    `${RUTA_INVITADOS}/${creado.grupo_id}?estado=creada&token=${encodeURIComponent(creado.token)}`,
  );
}

/** Emite un enlace nuevo. El anterior deja de valer en el acto. */
export async function emitirEnlace(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  if (!grupoId) volver("no-existe");

  const supabase = await cliente();
  const { data, error } = await supabase.rpc("rotar_token_invitacion", {
    p_grupo_id: grupoId,
  });

  if (error) {
    if (error.message.includes("RSV06")) volver("sin-permiso", grupoId);
    if (error.message.includes("RSV01")) volver("no-existe");
    console.error("No se pudo emitir el enlace:", error);
    volver("error", grupoId);
  }

  revalidatePath(`${RUTA_INVITADOS}/${grupoId}`);
  redirect(
    `${RUTA_INVITADOS}/${grupoId}?estado=enlace-emitido&token=${encodeURIComponent(String(data))}`,
  );
}

export async function anadirPersona(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const nombre = texto(datos, "nombre");
  const apellidos = texto(datos, "apellidos") || null;
  const esNino = datos.get("es_nino") !== null;

  if (!grupoId) volver("no-existe");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) volver("nombre-persona", grupoId);

  const supabase = await cliente();
  const { error, count } = await supabase
    .from("invitados")
    .insert({ grupo_id: grupoId, nombre, apellidos, es_nino: esNino }, { count: "exact" });

  if (error) {
    console.error("No se pudo añadir a la persona:", error);
    volver("error", grupoId);
  }
  // RLS no da error cuando prohíbe una escritura: no toca ninguna fila.
  if (count === 0) volver("sin-permiso", grupoId);

  revalidatePath(`${RUTA_INVITADOS}/${grupoId}`);
  volver("persona-anadida", grupoId);
}

/**
 * Quita a alguien de la invitación.
 *
 * NO SE PUEDE QUITAR A QUIEN YA HA CONTESTADO. `confirmaciones` es un
 * histórico inmutable y borrar a la persona se llevaría por delante su
 * respuesta en cascada: el recuento de la cocina cambiaría solo, sin que
 * quedara rastro de por qué. Si alguien contestó y ya no viene, lo que
 * corresponde es que su respuesta diga «no», no hacerla desaparecer.
 */
export async function quitarPersona(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const personaId = texto(datos, "persona_id");
  if (!grupoId || !personaId) volver("no-existe");

  const supabase = await cliente();

  const { data: confirmacion } = await supabase
    .from("confirmaciones")
    .select("estado")
    .eq("invitado_id", personaId)
    .eq("es_vigente", true)
    .maybeSingle();

  if (confirmacion && confirmacion.estado !== "pendiente") {
    volver("quitar-con-respuesta", grupoId);
  }

  const { error, count } = await supabase
    .from("invitados")
    .delete({ count: "exact" })
    .eq("id", personaId)
    .eq("grupo_id", grupoId);

  if (error) {
    console.error("No se pudo quitar a la persona:", error);
    volver("error", grupoId);
  }
  if (count === 0) volver("sin-permiso", grupoId);

  revalidatePath(`${RUTA_INVITADOS}/${grupoId}`);
  volver("persona-quitada", grupoId);
}

/**
 * BODA-110 · REPARTIR LA INVITACIÓN POR WHATSAPP
 *
 * Marca que se ha mandado y lleva a WhatsApp con el mensaje puesto. Las dos
 * cosas en el mismo paso porque son el mismo acto: si fueran dos botones, el
 * segundo se olvidaría y la lista de «a quién le falta» dejaría de valer justo
 * cuando más falta hace.
 *
 * EL ENLACE VIENE DEL FORMULARIO Y NO SE BUSCA EN LA BASE, y no es un atajo: la
 * base guarda la HUELLA del token, no el token. El texto en claro sólo existe
 * en la pantalla que acaba de emitirlo, así que o se manda desde ahí o hay que
 * emitir uno nuevo. Es incómodo a propósito — es lo que hace que un enlace
 * filtrado no se pueda recuperar de la base ni por quien entra al panel.
 *
 * POR ESO NO SE PUEDE MANDAR EL ENLACE DE OTRO GRUPO: el que viaja es el que
 * pintó esta ficha, y al cambiar de grupo la URL pierde el `?token=` y el
 * formulario desaparece. No hay estado que arrastrar de una ficha a la
 * siguiente.
 */
export async function repartirPorWhatsApp(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const mensaje = texto(datos, "mensaje");
  const esRecordatorio = datos.get("recordatorio") !== null;

  if (!grupoId) volver("no-existe");
  if (mensaje === "") volver("error", grupoId);

  const supabase = await cliente();
  const { error } = await supabase.rpc("marcar_invitacion_repartida", {
    p_grupo_id: grupoId,
    p_recordatorio: esRecordatorio,
  });

  if (error) {
    if (error.message.includes("RSV06")) volver("sin-permiso", grupoId);
    if (error.message.includes("RSV01")) volver("no-existe");
    console.error("No se pudo anotar el reparto:", error);
    volver("error", grupoId);
  }

  revalidatePath(`${RUTA_INVITADOS}/${grupoId}`);

  /*
    A WhatsApp, con el mensaje ya escrito.

    `wa.me` sin número abre el selector de contacto, que es lo que hace falta:
    los teléfonos de los invitados no están en la base —nadie los ha metido— y
    quien reparte los tiene en su agenda. Pedirlos sólo para esto sería recoger
    doscientos datos personales para ahorrarse un toque en la pantalla.
  */
  redirect(`https://wa.me/?text=${encodeURIComponent(mensaje)}`);
}
