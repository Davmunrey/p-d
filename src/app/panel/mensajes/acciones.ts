"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_MENSAJES } from "@/config/constants";
import { filasDelMismoMensaje } from "@/lib/bbdd/mensajes";
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

type Estado =
  | "marcado"
  | "destacado"
  | "sin-destacar"
  | "cancion-ocultada"
  | "cancion-mostrada"
  | "no-existe"
  | "mensaje-cambiado"
  | "mensaje-no-existe"
  | "sin-permiso"
  | "error";

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
const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? "").trim();

function volver(estado: Estado, datos?: FormData): never {
  /*
    LA BÚSQUEDA Y EL FILTRO VUELVEN CON EL ACUSE. Sin ellos, repasar los
    destacados la semana antes de la boda obligaba a filtrar otra vez después
    de cada clic: la bandeja volvía entera y con el buscador vacío.
  */
  const parametros = new URLSearchParams({ estado });
  const buscar = datos ? texto(datos, "buscar") : "";
  if (buscar) parametros.set("buscar", buscar);
  if (datos && texto(datos, "destacados") === "1") parametros.set("destacados", "1");
  redirect(`${RUTA_MENSAJES}?${parametros}`);
}

/**
 * Las filas sobre las que se marca un mensaje, o vuelve diciendo por qué no.
 *
 * Si el invitado lo ha reescrito mientras la bandeja estaba abierta, la tarjeta
 * que se pulsó ya no es la que se enseña: decir «hecho» sobre ella era mentir,
 * porque al repintar el mensaje de ahora salía sin la marca.
 */
async function filasOVolver(confirmacionId: string, datos: FormData): Promise<string[]> {
  const filas = await filasDelMismoMensaje(confirmacionId);
  if (!filas) volver("error", datos);
  if (filas.estado !== "vigente") {
    volver(filas.estado === "cambiado" ? "mensaje-cambiado" : "mensaje-no-existe", datos);
  }
  return filas.ids;
}

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
  if (!confirmacionId) volver("error", datos);

  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  /*
    EL LECTOR SE CORTA AQUÍ Y NO POR EL RECUENTO. Abajo, «cero filas» servía
    para decir «sin permiso», y para el `upsert` es verdad: RLS lo para. Pero
    el `delete` también deja cero filas cuando la marca YA NO ESTABA —los dos
    novios con la bandeja abierta, uno desmarca, el otro pulsa lo mismo un
    minuto después— y eso no es falta de permiso: es que el estado que quería
    ya se cumple. Preguntando el rol antes, el cero del `delete` puede
    significar lo único que le queda por significar.
  */
  if (acceso.rol === "lector") volver("sin-permiso", datos);

  // Desmarcar quita la marca de todas las filas con este mismo mensaje: la
  // marca se hereda por el texto, y dejar una vieja lo dejaría leído.
  const filas = await filasOVolver(confirmacionId, datos);
  const supabase = await cliente();

  const { error, count } = leidoAhora
    ? await supabase
        .from("mensajes_leidos")
        .delete({ count: "exact" })
        .in("confirmacion_id", filas)
    : await supabase.from("mensajes_leidos").upsert(
        {
          confirmacion_id: confirmacionId,
          leido_por: acceso.usuarioId,
        },
        { count: "exact" },
      );

  if (error) {
    // La confirmación se fue con su invitación mientras la bandeja seguía
    // abierta: no hay nada que marcar, y reintentar no lo va a arreglar.
    if (error.code === "23503") volver("mensaje-no-existe", datos);
    console.error("No se pudo marcar el mensaje:", error);
    volver("error", datos);
  }
  // Marcar como leído con cero filas sigue siendo «no te dejó»; desmarcar con
  // cero filas es que ya estaba desmarcado, que es exactamente lo que se pedía.
  if (count === 0 && !leidoAhora) volver("sin-permiso", datos);

  volver("marcado", datos);
}

/**
 * Destaca un mensaje que avisa de algo práctico, o le quita el destacado.
 *
 * Es la misma forma que marcar como leído —una tabla de marcas aparte, porque
 * `confirmaciones` es inmutable— y por eso el mismo orden: el rol primero, para
 * que el cero de un `delete` sólo pueda significar «ya no estaba destacado»,
 * que es justo lo que se pedía.
 */
export async function destacarMensaje(datos: FormData): Promise<void> {
  const confirmacionId = texto(datos, "confirmacion_id");
  const destacadoAhora = texto(datos, "destacado") === "1";
  if (!confirmacionId) volver("error", datos);

  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso", datos);

  const filas = await filasOVolver(confirmacionId, datos);
  const supabase = await cliente();
  const { error, count } = destacadoAhora
    ? await supabase
        .from("mensajes_destacados")
        .delete({ count: "exact" })
        .in("confirmacion_id", filas)
    : await supabase
        .from("mensajes_destacados")
        .upsert(
          { confirmacion_id: confirmacionId, destacado_por: acceso.usuarioId },
          { count: "exact" },
        );

  if (error) {
    // El mensaje se fue con su invitación mientras la bandeja seguía abierta.
    if (error.code === "23503") volver("mensaje-no-existe", datos);
    console.error("No se pudo destacar el mensaje:", error);
    volver("error", datos);
  }
  if (count === 0 && !destacadoAhora) volver("sin-permiso", datos);

  volver(destacadoAhora ? "sin-destacar" : "destacado", datos);
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
  if (!cancionId) volver("error", datos);

  /*
    EL ROL SE MIRA ANTES, por lo mismo que al marcar un mensaje: el cero de
    abajo tenía que significar una sola cosa. Una canción desaparece de verdad
    —el invitado la corrige al cambiar su respuesta y la vieja se retira—, y
    pulsar sobre ella desde la bandeja abierta decía «sólo un editor puede»
    a quien lo es.
  */
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso", datos);

  const supabase = await cliente();
  const { error, count } = await supabase
    .from("canciones_sugeridas")
    .update({ aprobada: aprobar }, { count: "exact" })
    .eq("id", cancionId);

  if (error) {
    console.error("No se pudo moderar la canción:", error);
    volver("error", datos);
  }
  if (count === 0) volver("no-existe", datos);

  // La landing la lee en cada visita, pero se revalida igual por si algún día
  // deja de ser dinámica: el olvido se paga con una canción retirada que sigue
  // viéndose.
  revalidatePath("/");
  volver(aprobar ? "cancion-mostrada" : "cancion-ocultada", datos);
}
