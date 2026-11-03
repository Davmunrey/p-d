"use server";

import { redirect } from "next/navigation";

import {
  LARGOS_DE_CAMPO,
  LONGITUD_MINIMA_NOMBRE,
  MARCA_RSVP_ENVIADO,
  MENUS_RSVP,
  PASOS_RSVP,
  type PasoRsvp,
} from "@/config/constants";
import { anclaDe } from "@/config/secciones";
import {
  anadirAcompanante,
  esCupoAgotado,
  obtenerInvitacion,
  quitarAcompanante,
  registrarConfirmacion,
  type Invitacion,
  type RespuestaInvitado,
} from "@/lib/bbdd/rsvp";
import { invitacionRecordada } from "@/lib/invitacion-recordada";
import {
  ANCLA_ACOMPANANTE,
  ANCLA_FORMULARIO,
  anclaPersona,
  faltanEnLaUrl,
} from "@/lib/rsvp-ancla";
import {
  borrarBorrador,
  guardarBorrador,
  leerBorrador,
  type Borrador,
} from "@/lib/rsvp-borrador";
import { esTrayecto, trayectoGuardado } from "@/lib/rsvp-autobus";
import { CAMPO_PREGUNTA_PREBODA } from "@/lib/rsvp-preboda";
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

/**
 * A la landing, a la sección de la estrella. Es adonde se vuelve sin nada
 * abierto —sin enlace— y al enviar: la estrella encendida es ese momento.
 */
function volver(consulta = "", ancla: string = anclaDe("rsvp")): never {
  redirect(`/${consulta ? `?${consulta}` : ""}#${ancla}`);
}

/** Al paso que toca: la tarjeta del formulario arriba, no la estrella. */
function volverAlPaso(consulta: string): never {
  volver(consulta, ANCLA_FORMULARIO);
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
      // Un trayecto que no es de la lista no llega al borrador.
      const trayecto = texto(datos, `autobus-${id}`);
      if (esTrayecto(trayecto)) borrador.autobus[id] = trayecto;
      // Sólo si la casilla estaba: sin preboda en la web no se pregunta, y
      // una casilla que no se enseñó no puede leerse como «no».
      if (preguntaPreboda(datos)) borrador.preboda[id] = datos.get(`preboda-${id}`) !== null;
    }
  }
}

/**
 * Si el paso de detalles llevaba la casilla de la preboda. La lleva cuando la
 * web enseña la preboda; el formulario lo dice con un campo oculto, para que
 * «no marcada» y «no preguntada» no se confundan.
 */
function preguntaPreboda(datos: FormData): boolean {
  return datos.get(CAMPO_PREGUNTA_PREBODA) !== null;
}

/** Vuelve al paso de asistencia señalando a quién le falta respuesta. */
function volverAContestar(faltan: { id: string }[]): never {
  const ids = faltan.map((persona) => persona.id);
  redirect(`/?paso=asistencia&falta=${faltanEnLaUrl(ids)}#${anclaPersona(ids[0]!)}`);
}

/**
 * Vuelve al paso de asistencia con lo que ha pasado con el acompañante, donde
 * se lee: en la persona, si la hay; en su campo, si el nombre no valía; si no,
 * arriba del formulario, donde va el aviso.
 */
function volverConAcompanante(resultado: string, persona?: string): never {
  const ancla = persona
    ? anclaPersona(persona)
    : resultado === "nombre" || resultado === "largo"
      ? ANCLA_ACOMPANANTE
      : ANCLA_FORMULARIO;
  redirect(`/?paso=asistencia&acompanante=${resultado}#${ancla}`);
}

/**
 * «¿VENÍS CON ALGUIEN?» Apunta en el grupo a quien trae, y lo deja marcado como
 * que viene: lo ha apuntado para eso. Su menú y sus alergias los dice en el
 * paso de detalles, como los demás.
 *
 * Lo que impide apuntarlo se dice ANTES de tocar la base —sin sitio, nombre
 * corto o largo—; la base lo vuelve a mirar igual (el tope, con el grupo
 * bloqueado, por si otro móvil de la familia apuntaba a alguien a la vez).
 */
async function apuntarAcompanante(
  token: string,
  borrador: Borrador,
  invitacion: Invitacion,
  datos: FormData,
): Promise<never> {
  const nombre = texto(datos, "acompanante-nombre");
  const apellidos = texto(datos, "acompanante-apellidos") || null;

  if (invitacion.plazasLibres <= 0) volverConAcompanante("tope");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) volverConAcompanante("nombre");
  if (
    nombre.length > LARGOS_DE_CAMPO["invitados.nombre"] ||
    (apellidos?.length ?? 0) > LARGOS_DE_CAMPO["invitados.apellidos"]
  ) {
    volverConAcompanante("largo");
  }

  const resultado = await anadirAcompanante(token, {
    nombre,
    apellidos,
    esNino: datos.get("acompanante-nino") !== null,
  });
  if (!resultado.ok) {
    if (resultado.motivo === "tope") volverConAcompanante("tope");
    volverAlPaso(`paso=asistencia&fallo=${resultado.motivo}`);
  }

  borrador.asistencia[resultado.id] = "confirmado";
  await guardarBorrador(borrador);
  volverConAcompanante("anadido", resultado.id);
}

/** Deshace un acompañante apuntado por error, si aún no ha contestado. */
async function quitarDeLaLista(
  token: string,
  borrador: Borrador,
  invitacion: Invitacion,
  id: string,
): Promise<never> {
  // Sólo se pide por quien la pantalla enseña como acompañante de este grupo.
  const persona = invitacion.personas.find((p) => p.id === id && p.esAcompanante);
  if (!persona) volverAlPaso(`paso=asistencia`);

  const resultado = await quitarAcompanante(token, id);
  if (!resultado.ok) volverAlPaso(`paso=asistencia&fallo=${resultado.motivo}`);
  if (!resultado.quitado) volverConAcompanante("contestado", id);

  delete borrador.asistencia[id];
  delete borrador.menu[id];
  delete borrador.alergias[id];
  delete borrador.autobus[id];
  delete borrador.preboda[id];
  await guardarBorrador(borrador);
  volverConAcompanante("quitado");
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
    volverAlPaso(`paso=${pasoActual}&fallo=${lectura.fallo}`);
  }

  const { invitacion } = lectura;
  if (!invitacion) volverAlPaso(`fallo=enlace`);

  const borrador = sembrarDesdeLaBase(await leerBorrador(token), invitacion.personas);
  const personas = invitacion.personas.map((p) => p.id);
  const propias = (ids: string[]) => ids.filter((id) => personas.includes(id));
  incorporar(borrador, datos, pasoActual, propias);
  await guardarBorrador(borrador);

  /*
    EL ACOMPAÑANTE, ANTES QUE AVANZAR. Si hay un nombre escrito en «¿Venís con
    alguien?», se apunta aunque se haya pulsado «Siguiente» o Intro: quien lo
    ha escrito quiere traerlo, y avanzar sin él lo perdería en silencio.
  */
  if (pasoActual === "asistencia") {
    const quitar = texto(datos, "quitar");
    if (quitar) await quitarDeLaLista(token, borrador, invitacion, quitar);
    if (direccion === "acompanante" || texto(datos, "acompanante-nombre")) {
      await apuntarAcompanante(token, borrador, invitacion, datos);
    }
  }

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
    volverAlPaso(`paso=detalles&largo=alergias`);
  }

  const alguienViene = personas.some((id) => borrador.asistencia[id] === "confirmado");

  if (direccion === "atras") volverAlPaso(`paso=asistencia`);

  if (pasoActual === "asistencia") {
    const sinContestar = invitacion.personas.filter((p) => !borrador.asistencia[p.id]);
    if (sinContestar.length > 0) volverAContestar(sinContestar);
    // Si viene alguien, sus detalles; si no viene nadie, ya está todo dicho.
    if (alguienViene) volverAlPaso(`paso=detalles`);
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

  /*
    LA PREBODA VA SI SE HA PREGUNTADO EN ESTE ENVÍO. El último paso es el de
    detalles, que es donde está la casilla; si no la llevaba —no hay preboda
    en la web—, la clave no viaja y la base guarda «no se le preguntó».
  */
  const conPreboda = pasoActual === "detalles" && preguntaPreboda(datos);

  const respuestas: RespuestaInvitado[] = invitacion.personas.map((persona) => {
    const viene = borrador.asistencia[persona.id] === "confirmado";
    return {
      invitado_id: persona.id,
      estado: viene ? "confirmado" : "rechazado",
      necesita_autobus: viene
        ? (borrador.autobus[persona.id] ?? "ninguno") !== "ninguno"
        : null,
      ...(viene ? { trayecto_autobus: borrador.autobus[persona.id] ?? "ninguno" } : {}),
      ...(viene && conPreboda ? { asiste_preboda: Boolean(borrador.preboda[persona.id]) } : {}),
      ...(viene && borrador.menu[persona.id] ? { tipo_menu: borrador.menu[persona.id] } : {}),
      ...(viene && borrador.alergias[persona.id] !== undefined
        ? { alergias: borrador.alergias[persona.id] || null }
        : {}),
    };
  });

  const resultado = await registrarConfirmacion(token, respuestas);
  if (!resultado.ok) volverAlPaso(`paso=${pasoActual}&fallo=${resultado.motivo}`);

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
  if ("fallo" in lectura) volverAlPaso(`fallo=${lectura.fallo}`);
  const { invitacion } = lectura;
  if (!invitacion) volverAlPaso(`fallo=enlace`);

  const borrador = await leerBorrador(token);
  borrador.sembrado = true;
  for (const persona of invitacion.personas) {
    if (persona.estado === "confirmado" || persona.estado === "rechazado") {
      borrador.asistencia[persona.id] = persona.estado;
    }
    borrador.menu[persona.id] = persona.tipoMenu;
    borrador.alergias[persona.id] = persona.alergias ?? "";
    const trayecto = trayectoGuardado(persona);
    if (trayecto) borrador.autobus[persona.id] = trayecto;
    if (persona.asistePreboda !== null) borrador.preboda[persona.id] = persona.asistePreboda;
  }
  await guardarBorrador(borrador);
  volverAlPaso(`paso=asistencia`);
}
