"use server";

import { redirect } from "next/navigation";

import { PASOS_RSVP, RUTA_RSVP, type PasoRsvp } from "@/config/constants";
import {
  obtenerInvitacion,
  registrarConfirmacion,
  type RespuestaInvitado,
} from "@/lib/bbdd/rsvp";
import { borrarBorrador, guardarBorrador, leerBorrador } from "@/lib/rsvp-borrador";

/**
 * EL AVANCE DEL RSVP
 *
 * Una sola acción para los tres pasos y para el envío. Hace siempre lo mismo:
 * guarda en el borrador lo que venga en el formulario, decide a dónde se va, y
 * redirige.
 *
 * TODO PASA POR AQUÍ, TAMBIÉN EL «ATRÁS». Un enlace de vuelta perdería lo
 * escrito en el paso actual; un botón de envío no. Por eso «atrás» es un
 * `submit` más y no un `<a>`: se guarda y luego se retrocede.
 *
 * LO QUE ESTA FUNCIÓN NO DECIDE: si el plazo está abierto, si el token vale, y
 * si cada persona es de este grupo. Eso lo resuelve la base —un trigger contra
 * `now()`, la huella del token y un JOIN dentro del propio INSERT— y aquí no se
 * duplica. Duplicarlo sólo añadiría un segundo sitio donde equivocarse.
 */

function esPaso(valor: string): valor is PasoRsvp {
  return (PASOS_RSVP as readonly string[]).includes(valor);
}

/** `viene-<id>` → `<id>`. Los nombres de campo llevan el id porque el */
/** formulario responde por varias personas a la vez. */
function idsDe(datos: FormData, prefijo: string): string[] {
  return [...datos.keys()]
    .filter((clave) => clave.startsWith(`${prefijo}-`))
    .map((clave) => clave.slice(prefijo.length + 1));
}

const texto = (datos: FormData, clave: string) =>
  typeof datos.get(clave) === "string" ? (datos.get(clave) as string).trim() : "";

export async function avanzar(datos: FormData): Promise<void> {
  const token = texto(datos, "token");
  const pasoActual = texto(datos, "paso");
  const direccion = texto(datos, "direccion");

  if (!token || !esPaso(pasoActual)) redirect(`${RUTA_RSVP}`);

  const invitacion = await obtenerInvitacion(token);
  if (!invitacion) redirect(`${RUTA_RSVP}/${encodeURIComponent(token)}`);

  const borrador = await leerBorrador(token);
  const personas = invitacion.personas.map((p) => p.id);

  // Sólo se acepta lo que venga de este grupo. Un `invitado_id` de fuera no
  // llegaría a escribirse igualmente —la base lo rechaza—, pero tampoco tiene
  // por qué ensuciar el borrador de nadie.
  const propias = (ids: string[]) => ids.filter((id) => personas.includes(id));

  if (pasoActual === "asistencia") {
    for (const id of propias(idsDe(datos, "viene"))) {
      const valor = texto(datos, `viene-${id}`);
      if (valor === "confirmado" || valor === "rechazado") borrador.asistencia[id] = valor;
    }
  }

  if (pasoActual === "detalles") {
    for (const id of propias(personas)) {
      const menu = texto(datos, `menu-${id}`);
      if (menu) borrador.menu[id] = menu;
      borrador.alergias[id] = texto(datos, `alergias-${id}`);
      // Una casilla que el navegador no manda es «no marcada», no «no lo sé».
      borrador.autobus[id] = datos.get(`autobus-${id}`) !== null;
    }
  }

  if (pasoActual === "mensaje") {
    borrador.cancion = texto(datos, "cancion");
    borrador.mensaje = texto(datos, "mensaje");
  }

  await guardarBorrador(borrador);

  const base = `${RUTA_RSVP}/${encodeURIComponent(token)}`;
  const alguienViene = personas.some((id) => borrador.asistencia[id] === "confirmado");

  if (direccion === "atras") {
    // Si nadie viene, el paso de detalles no existió: se vuelve al primero.
    const anterior =
      pasoActual === "mensaje" ? (alguienViene ? "detalles" : "asistencia") : "asistencia";
    redirect(`${base}?paso=${anterior}`);
  }

  if (pasoActual === "asistencia") {
    // Nadie puede quedarse sin contestar: en la base, «pendiente» y «no viene»
    // son cosas distintas, y aquí se sabría a quién falta pero no qué quiso.
    const sinContestar = invitacion.personas.find((p) => !borrador.asistencia[p.id]);
    if (sinContestar) {
      redirect(`${base}?paso=asistencia&falta=${encodeURIComponent(sinContestar.id)}`);
    }
    redirect(`${base}?paso=${alguienViene ? "detalles" : "mensaje"}`);
  }

  if (pasoActual === "detalles") redirect(`${base}?paso=mensaje`);

  // Último paso: se envía.
  const respuestas: RespuestaInvitado[] = invitacion.personas.map((persona, indice) => {
    const viene = borrador.asistencia[persona.id] === "confirmado";
    return {
      invitado_id: persona.id,
      estado: viene ? "confirmado" : "rechazado",
      necesita_autobus: viene ? Boolean(borrador.autobus[persona.id]) : null,
      necesita_alojamiento: viene ? false : null,
      // La canción y el mensaje son del grupo, no de cada persona: se guardan
      // en la primera para que el panel reciba un mensaje y no cuatro copias.
      cancion_solicitada: indice === 0 ? borrador.cancion || null : null,
      mensaje: indice === 0 ? borrador.mensaje || null : null,
      // Sólo de quien viene, y sólo si pasó por el paso de detalles. Las claves
      // ausentes le dicen a la base «no toques lo que ya había», que es lo que
      // hay que hacer con lo que alguien anotara desde el panel.
      ...(viene && borrador.menu[persona.id] ? { tipo_menu: borrador.menu[persona.id] } : {}),
      ...(viene && borrador.alergias[persona.id] !== undefined
        ? { alergias: borrador.alergias[persona.id] || null }
        : {}),
    };
  });

  const resultado = await registrarConfirmacion(token, respuestas);

  if (!resultado.ok) redirect(`${base}?paso=mensaje&fallo=${resultado.motivo}`);

  // La respuesta ya está en la base: el borrador sobra y su cookie también.
  await borrarBorrador();
  redirect(`${base}?enviado=1`);
}

/**
 * Vuelve a abrir el formulario para cambiar una respuesta ya enviada.
 *
 * No borra nada: `confirmaciones` es un histórico inmutable y la respuesta
 * nueva entra como una fila más que pasa a ser la vigente. Lo que se hace aquí
 * es sembrar el borrador con lo que ya contestaron, para que no tengan que
 * volver a escribirlo todo por cambiar una sola cosa.
 */
export async function reabrir(datos: FormData): Promise<void> {
  const token = texto(datos, "token");
  if (!token) redirect(RUTA_RSVP);

  const invitacion = await obtenerInvitacion(token);
  if (!invitacion) redirect(`${RUTA_RSVP}/${encodeURIComponent(token)}`);

  const borrador = await leerBorrador(token);
  for (const persona of invitacion.personas) {
    if (persona.estado === "confirmado" || persona.estado === "rechazado") {
      borrador.asistencia[persona.id] = persona.estado;
    }
    borrador.menu[persona.id] = persona.tipoMenu;
    borrador.alergias[persona.id] = persona.alergias ?? "";
    borrador.autobus[persona.id] = Boolean(persona.necesitaAutobus);
    if (persona.cancionSolicitada) borrador.cancion = persona.cancionSolicitada;
    if (persona.mensaje) borrador.mensaje = persona.mensaje;
  }

  await guardarBorrador(borrador);
  redirect(`${RUTA_RSVP}/${encodeURIComponent(token)}?paso=asistencia`);
}
