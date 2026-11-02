"use server";

import { redirect } from "next/navigation";

import {
  LARGOS_DE_CAMPO,
  MARCA_RSVP_ENVIADO,
  MENUS_RSVP,
  PASOS_RSVP,
  type PasoRsvp,
} from "@/config/constants";
import { anclaDe } from "@/config/secciones";
import {
  esCupoAgotado,
  obtenerInvitacion,
  registrarConfirmacion,
  type Invitacion,
  type RespuestaInvitado,
} from "@/lib/bbdd/rsvp";
import { invitacionRecordada } from "@/lib/invitacion-recordada";
import { anclaPersona, faltanEnLaUrl } from "@/lib/rsvp-ancla";
import {
  borrarBorrador,
  guardarBorrador,
  leerBorrador,
  type Borrador,
} from "@/lib/rsvp-borrador";
import { sembrarDesdeLaBase } from "@/lib/rsvp-siembra";

/**
 * LAS ACCIONES DE LA CONFIRMACIÓN
 *
 * El formulario vive al final de la landing, dentro de un desplegable, y cada
 * paso es un `POST` a una de estas acciones, que guarda lo escrito en el
 * borrador y vuelve a la landing con el paso en la URL y el ancla de la
 * sección: el desplegable sale abierto donde toca y lo demás de la página
 * sigue ahí. Sin JavaScript funciona igual; con él, Next lo hace sin recargar.
 *
 * EL TOKEN NO VIAJA EN EL FORMULARIO. Lo lee el servidor de la cookie que dejó
 * el enlace de la invitación al abrirse. Sin cookie no hay formulario que
 * enviar, y la acción vuelve a la sección, que explica cómo se confirma.
 */

/** Adónde vuelve cada paso: la landing, con el desplegable a la vista. */
function volver(consulta = ""): never {
  redirect(`/${consulta ? `?${consulta}` : ""}#${anclaDe("rsvp")}`);
}

function esPaso(valor: string): valor is PasoRsvp {
  return (PASOS_RSVP as readonly string[]).includes(valor);
}

/** Los ids de persona de los campos con un prefijo: `viene-<id>` → `<id>`. */
function idsDe(datos: FormData, prefijo: string): string[] {
  return [...datos.keys()]
    .filter((clave) => clave.startsWith(`${prefijo}-`))
    .map((clave) => clave.slice(prefijo.length + 1));
}

const texto = (datos: FormData, clave: string) =>
  typeof datos.get(clave) === "string" ? (datos.get(clave) as string).trim() : "";

async function leerInvitacion(
  token: string,
): Promise<{ invitacion: Invitacion | null } | { fallo: "intentos" | "averia" }> {
  try {
    return { invitacion: await obtenerInvitacion(token) };
  } catch (error) {
    if (esCupoAgotado(error)) return { fallo: "intentos" };
    console.error("No se pudo leer la invitación desde la confirmación:", error);
    return { fallo: "averia" };
  }
}

/**
 * Pasa al borrador lo que ha llegado en este paso, sólo de personas del grupo
 * (`propias`): un id inventado en el formulario no llega a ninguna parte.
 */
function incorporar(
  borrador: Borrador,
  datos: FormData,
  paso: PasoRsvp,
  propias: (ids: string[]) => string[],
): void {
  if (paso === "asistencia") {
    for (const id of propias(idsDe(datos, "viene"))) {
      const valor = texto(datos, `viene-${id}`);
      if (valor === "confirmado" || valor === "rechazado") borrador.asistencia[id] = valor;
    }
  }
  if (paso === "detalles") {
    /*
      SÓLO DE QUIEN ESTÁ EN EL FORMULARIO. El paso de detalles pinta a quien
      viene; recorrer a todo el grupo escribía `alergias = ""` para quien no
      estaba, y ese "" tapaba la alergia anotada en la base. El campo de
      alergias va siempre, aunque esté vacío, así que sus ids son exactamente
      las personas del formulario.
    */
    for (const id of propias(idsDe(datos, "alergias"))) {
      const menu = texto(datos, `menu-${id}`);
      if ((MENUS_RSVP as readonly string[]).includes(menu)) borrador.menu[id] = menu;
      borrador.alergias[id] = texto(datos, `alergias-${id}`);
      borrador.autobus[id] = datos.get(`autobus-${id}`) !== null;
    }
  }
}

/** Vuelve al paso de asistencia señalando a quién le falta respuesta. */
function volverAContestar(faltan: { id: string }[]): never {
  const ids = faltan.map((persona) => persona.id);
  redirect(`/?paso=asistencia&falta=${faltanEnLaUrl(ids)}#${anclaPersona(ids[0]!)}`);
}

/** Un paso del formulario: «Siguiente», «Atrás» o el envío final. */
export async function avanzar(datos: FormData): Promise<void> {
  const token = await invitacionRecordada();
  const pasoActual = texto(datos, "paso");
  const direccion = texto(datos, "direccion");

  if (!token || !esPaso(pasoActual)) volver();

  const lectura = await leerInvitacion(token);
  if ("fallo" in lectura) {
    /*
      Lo escrito en este paso se guarda igualmente antes de volver: el envío
      final sólo escribe por las personas que la base devuelva para el token,
      así que un id de más en el borrador no llega a ninguna parte. Y en cuanto
      se recupere, lo escrito sigue ahí.
    */
    const pendiente = await leerBorrador(token);
    incorporar(pendiente, datos, pasoActual, (ids) => ids);
    await guardarBorrador(pendiente);
    volver(`paso=${pasoActual}&fallo=${lectura.fallo}`);
  }

  const { invitacion } = lectura;
  if (!invitacion) volver(`fallo=enlace`);

  const borrador = sembrarDesdeLaBase(await leerBorrador(token), invitacion.personas);
  const personas = invitacion.personas.map((p) => p.id);
  const propias = (ids: string[]) => ids.filter((id) => personas.includes(id));
  incorporar(borrador, datos, pasoActual, propias);
  await guardarBorrador(borrador);

  /*
    LO LARGO SE MIDE AQUÍ, ANTES DE TOCAR LA BASE. Las alergias tienen su tope
    en un CHECK; sin esta comprobación, pasarse no daba un aviso sino una
    «avería», y no había forma de confirmar. Se vuelve al mismo paso con el
    aviso y SIN ESCRIBIR NADA: el borrador ya está guardado, el texto no se
    pierde.
  */
  if (
    pasoActual === "detalles" &&
    personas.some(
      (id) => (borrador.alergias[id]?.length ?? 0) > LARGOS_DE_CAMPO["invitados.alergias"],
    )
  ) {
    volver(`paso=detalles&largo=alergias`);
  }

  const alguienViene = personas.some((id) => borrador.asistencia[id] === "confirmado");

  if (direccion === "atras") volver(`paso=asistencia`);

  if (pasoActual === "asistencia") {
    const sinContestar = invitacion.personas.filter((p) => !borrador.asistencia[p.id]);
    if (sinContestar.length > 0) volverAContestar(sinContestar);
    // Si viene alguien, sus detalles; si no viene nadie, ya está todo dicho.
    if (alguienViene) volver(`paso=detalles`);
  }

  /*
    ANTES DE ESCRIBIR, SE VUELVE A MIRAR QUIÉN HA CONTESTADO. Entre un paso y
    otro el borrador puede haberse vaciado —la cookie caduca, Safari la
    descarta, se abre en otro móvil con `?paso=detalles` puesto—, y sin esta
    guarda ese envío escribía `rechazado` para TODA la familia, en silencio.
    Contestar otra vez cuesta un minuto; deshacer una baja que nadie pidió no
    se puede, porque `confirmaciones` es un histórico.
  */
  const faltaPorContestar = invitacion.personas.filter((p) => !borrador.asistencia[p.id]);
  if (faltaPorContestar.length > 0) volverAContestar(faltaPorContestar);

  const respuestas: RespuestaInvitado[] = invitacion.personas.map((persona) => {
    const viene = borrador.asistencia[persona.id] === "confirmado";
    return {
      invitado_id: persona.id,
      estado: viene ? "confirmado" : "rechazado",
      necesita_autobus: viene ? Boolean(borrador.autobus[persona.id]) : null,
      ...(viene && borrador.menu[persona.id] ? { tipo_menu: borrador.menu[persona.id] } : {}),
      ...(viene && borrador.alergias[persona.id] !== undefined
        ? { alergias: borrador.alergias[persona.id] || null }
        : {}),
    };
  });

  const resultado = await registrarConfirmacion(token, respuestas);
  if (!resultado.ok) volver(`paso=${pasoActual}&fallo=${resultado.motivo}`);

  await borrarBorrador();
  volver(`${MARCA_RSVP_ENVIADO.parametro}=${MARCA_RSVP_ENVIADO.valor}`);
}

/**
 * «Cambiar la respuesta»: siembra el borrador con lo guardado y abre el
 * formulario en el primer paso, con todo marcado como estaba.
 */
export async function reabrir(): Promise<void> {
  const token = await invitacionRecordada();
  if (!token) volver();

  const lectura = await leerInvitacion(token);
  if ("fallo" in lectura) volver(`fallo=${lectura.fallo}`);
  const { invitacion } = lectura;
  if (!invitacion) volver(`fallo=enlace`);

  const borrador = await leerBorrador(token);
  borrador.sembrado = true;
  for (const persona of invitacion.personas) {
    if (persona.estado === "confirmado" || persona.estado === "rechazado") {
      borrador.asistencia[persona.id] = persona.estado;
    }
    borrador.menu[persona.id] = persona.tipoMenu;
    borrador.alergias[persona.id] = persona.alergias ?? "";
    borrador.autobus[persona.id] = Boolean(persona.necesitaAutobus);
  }
  await guardarBorrador(borrador);
  volver(`paso=asistencia`);
}
