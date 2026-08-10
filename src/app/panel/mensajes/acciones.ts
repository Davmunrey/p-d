"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_MENSAJES } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * BODA-112/113 · Lo que se hace con lo que escriben los invitados
 *
 * Marcar un mensaje como leído y retirar una canción de la web. Las dos son
 * reversibles a propósito: ninguna borra nada.
 *
 * QUIÉN PUEDE LO DECIDE LA BASE. `mensajes_leidos_editor_escribir` y
 * `canciones_sugeridas_gestion` exigen `puede_editar()`. Y como RLS no da error
 * cuando prohíbe —devuelve cero filas tocadas— cada operación mira el recuento.
 */

type Estado = "marcado" | "cancion-ocultada" | "cancion-mostrada" | "sin-permiso" | "error";

/*
  NO SE REVALIDA LA RUTA A LA QUE SE VA A REDIRIGIR.

  Lo descubrió la investigación de BODA-71: `revalidatePath` del destino y
  `redirect` a ese mismo destino compiten, y cuando gana el refresco la
  redirección pierde su `?estado=` — la escritura se hace, la pantalla se
  repinta, y el aviso de «hecho» no sale nunca. Quien lo usa se queda sin saber
  si se guardó, que es justo lo que el aviso existe para contestar.

  Es redundante además: estas pantallas son `force-dynamic`, así que la
  redirección ya las vuelve a leer de la base enteras. Se revalida sólo lo que
  NO se va a visitar.
*/
function volver(estado: Estado): never {
  redirect(`${RUTA_MENSAJES}?estado=${estado}`);
}

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? "").trim();

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * Marca o desmarca un mensaje como leído.
 *
 * Un mensaje se lee o no se lee: quién lo marcó se guarda como dato, no como
 * parte de la identidad. Que lo lea Paloma no lo deja sin leer para David — son
 * dos personas organizando la misma boda, no dos bandejas separadas.
 */
export async function marcarLeido(datos: FormData): Promise<void> {
  const confirmacionId = texto(datos, "confirmacion_id");
  const leidoAhora = texto(datos, "leido") === "1";
  if (!confirmacionId) volver("error");

  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const supabase = await cliente();

  const { error, count } = leidoAhora
    ? await supabase
        .from("mensajes_leidos")
        .delete({ count: "exact" })
        .eq("confirmacion_id", confirmacionId)
    : await supabase.from("mensajes_leidos").upsert(
        {
          confirmacion_id: confirmacionId,
          leido_por: acceso.usuarioId,
        },
        { count: "exact" },
      );

  if (error) {
    console.error("No se pudo marcar el mensaje:", error);
    volver("error");
  }
  if (count === 0) volver("sin-permiso");

  volver("marcado");
}

/**
 * Retira una canción de la web, o la devuelve.
 *
 * NO BORRA NADA: apaga `aprobada`, y la política de lectura pública filtra por
 * ese booleano. Se le pide a doscientas personas que sugieran canciones, así
 * que alguien va a sugerir una broma — y hace falta poder quitarla sin perder
 * el rastro de quién la pidió, y poder deshacerlo si era buena y se entendió
 * mal.
 */
export async function moderarCancion(datos: FormData): Promise<void> {
  const cancionId = texto(datos, "cancion_id");
  const aprobar = texto(datos, "aprobar") === "1";
  if (!cancionId) volver("error");

  const supabase = await cliente();
  const { error, count } = await supabase
    .from("canciones_sugeridas")
    .update({ aprobada: aprobar }, { count: "exact" })
    .eq("id", cancionId);

  if (error) {
    console.error("No se pudo moderar la canción:", error);
    volver("error");
  }
  if (count === 0) volver("sin-permiso");

  // La landing la lee en cada visita, pero se revalida igual por si algún día
  // deja de ser dinámica: el olvido se paga con una canción retirada que sigue
  // viéndose.
  revalidatePath("/");
  volver(aprobar ? "cancion-mostrada" : "cancion-ocultada");
}
