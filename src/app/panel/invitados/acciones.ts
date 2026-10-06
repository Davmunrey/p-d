"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  LARGOS_DE_CAMPO,
  LONGITUD_MINIMA_NOMBRE,
  MAXIMO_ACOMPANANTES,
  MENUS_RSVP,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_PENDIENTES,
  URL_WHATSAPP,
} from "@/config/constants";
import { esCorreoValido } from "@/lib/correo-valido";
import { accesoActual, ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
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
  | "persona-editada"
  | "persona-quitada"
  | "nombre"
  | "nombre-largo"
  | "nombre-persona"
  | "persona-larga"
  | "correo"
  | "acompanantes"
  | "no-existe"
  | "quitar-con-respuesta"
  | "persona-no-existe"
  | "confirmar-emision"
  | "invitacion-editada"
  | "invitacion-borrada"
  | "acompanantes-ocupados"
  | "borrar-con-respuestas"
  | "respuesta-apuntada"
  | "respuesta-sin-estado"
  | "menu-infantil"
  | "alergias-largas"
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
function volver(estado: Estado, grupoId?: string, token?: string): never {
  const base = grupoId ? `${RUTA_INVITADOS}/${grupoId}` : RUTA_INVITADOS;
  /*
    EL ENLACE EN CLARO SIGUE EN LA FICHA MIENTRAS SE TRABAJA EN ELLA. Al crear
    la invitación el grupo está vacío y su enlace todavía no sirve; añadir a la
    primera persona recargaba la ficha sin `?token=` y el enlace desaparecía,
    así que había que emitir otro sí o sí. El token ya iba en esta misma URL:
    traerlo de vuelta no lo expone en ningún sitio nuevo.
  */
  const conToken = token ? `&token=${encodeURIComponent(token)}` : "";
  redirect(`${base}?estado=${estado}${conToken}`);
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
  // El tope de la base, dicho antes: si no, el CHECK lo rechaza y la pantalla
  // pide reintentar algo que no va a funcionar nunca.
  const invitacion = datosInvitacion(datos);
  if (!invitacion.ok) volver(invitacion.estado);
  const { nombre, lado, acompanantes } = invitacion.valores;

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

/**
 * Nombre, lado y tope de acompañantes de una invitación, comprobados como los
 * comprueba la base. Lo comparten el alta y la corrección.
 */
function datosInvitacion(
  datos: FormData,
):
  | { ok: false; estado: Estado }
  | { ok: true; valores: { nombre: string; lado: string; acompanantes: number } } {
  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) return { ok: false, estado: "nombre" };
  if (nombre.length > LARGOS_DE_CAMPO["grupos_invitacion.nombre"]) {
    return { ok: false, estado: "nombre-largo" };
  }
  const ladoBruto = texto(datos, "lado");
  const lado = (LADOS as readonly string[]).includes(ladoBruto) ? ladoBruto : "ambos";
  const acompanantes = Number(texto(datos, "maximo_acompanantes") || "0");
  if (
    !Number.isInteger(acompanantes) ||
    acompanantes < 0 ||
    acompanantes > MAXIMO_ACOMPANANTES
  ) {
    return { ok: false, estado: "acompanantes" };
  }
  return { ok: true, valores: { nombre, lado, acompanantes } };
}

/**
 * BODA-51 · CORREGIR UNA INVITACIÓN.
 *
 * El nombre es lo que lee la familia al abrir su enlace, y una errata se
 * quedaba para siempre; las importadas nacían sin acompañantes y no había
 * forma de darle un «+1» a nadie. Lo que no se toca es el enlace: corregir el
 * nombre no lo anula.
 */
export async function editarInvitacion(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const token = texto(datos, "token");
  if (!grupoId) volver("no-existe");

  const invitacion = datosInvitacion(datos);
  if (!invitacion.ok) volver(invitacion.estado, grupoId, token);
  const { nombre, lado, acompanantes } = invitacion.valores;

  const supabase = await cliente();

  /*
    EL TOPE NO BAJA POR DEBAJO DE LOS QUE YA HAY. La base sólo lo mira al
    añadir a alguien; bajándolo aquí, el grupo se quedaría con más
    acompañantes de los que admite y el siguiente cambio de la familia
    fallaría sin que nadie supiera por qué.
  */
  const { count: apuntados, error: errorRecuento } = await supabase
    .from("invitados")
    .select("id", { count: "exact", head: true })
    .eq("grupo_id", grupoId)
    .eq("es_acompanante", true);
  if (errorRecuento) volver("error", grupoId, token);
  if ((apuntados ?? 0) > acompanantes) volver("acompanantes-ocupados", grupoId, token);

  const { data, error } = await supabase
    .from("grupos_invitacion")
    .update({ nombre, lado, maximo_acompanantes: acompanantes })
    .eq("id", grupoId)
    .select("id");

  if (error) {
    if (error.message.includes("RSV06")) volver("sin-permiso", grupoId, token);
    console.error("No se pudo corregir la invitación:", error);
    volver("error", grupoId, token);
  }
  if (!data?.length) {
    if (await ceroFilasEsFaltaDePermiso()) volver("sin-permiso", grupoId, token);
    volver("no-existe");
  }

  revalidatePath(RUTA_INVITADOS);
  volver("invitacion-editada", grupoId, token);
}

/**
 * BORRAR UNA INVITACIÓN, sólo si nadie de ella ha contestado.
 *
 * Borrarla se lleva a su gente en cascada, y con la gente sus respuestas: el
 * recuento de la cocina cambiaría solo y sin rastro. Una invitación creada dos
 * veces o de prueba sí se borra; una con respuestas, no — si ya no vienen, lo
 * que toca es que su respuesta diga «no».
 */
export async function borrarInvitacion(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  if (!grupoId) volver("no-existe");
  // La casilla es `required`; un formulario mandado a mano no lo es.
  if (datos.get("confirmo_borrar") === null) volver("error", grupoId);

  const supabase = await cliente();

  const { data: respuestas, error: errorLectura } = await supabase
    .from("confirmaciones")
    .select("id, invitados!inner ( grupo_id )")
    .eq("invitados.grupo_id", grupoId)
    .eq("es_vigente", true)
    .neq("estado", "pendiente")
    .limit(1);
  // Si no se puede saber, no se borra: lo borrado no vuelve.
  if (errorLectura) {
    console.error("No se pudo comprobar si la invitación tenía respuestas:", errorLectura);
    volver("error", grupoId);
  }
  if (respuestas?.length) volver("borrar-con-respuestas", grupoId);

  const { data, error } = await supabase
    .from("grupos_invitacion")
    .delete()
    .eq("id", grupoId)
    .select("id");

  if (error) {
    console.error("No se pudo borrar la invitación:", error);
    volver("error", grupoId);
  }
  if (!data?.length) {
    if (await ceroFilasEsFaltaDePermiso()) volver("sin-permiso", grupoId);
    volver("no-existe");
  }

  revalidatePath(RUTA_INVITADOS);
  volver("invitacion-borrada");
}

/** Emite un enlace nuevo. El anterior deja de valer en el acto. */
export async function emitirEnlace(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  if (!grupoId) volver("no-existe");

  const supabase = await cliente();

  /*
    SI LA FAMILIA YA TIENE SU ENLACE, EMITIR OTRO SE LO ANULA. La ficha lo
    pide con una casilla, y aquí se comprueba igual: sin JavaScript la casilla
    es `required`, pero un formulario mandado a mano no lo es.
  */
  const { data: grupo } = await supabase
    .from("grupos_invitacion")
    .select("invitacion_enviada_en")
    .eq("id", grupoId)
    .maybeSingle();
  if (grupo?.invitacion_enviada_en && datos.get("confirmo_anular") === null) {
    volver("confirmar-emision", grupoId);
  }

  const { data, error } = await supabase.rpc("rotar_token_invitacion", {
    p_grupo_id: grupoId,
  });

  if (error) {
    if (error.message.includes("RSV06")) volver("sin-permiso", grupoId);
    if (error.message.includes("RSV01")) volver("no-existe");
    console.error("No se pudo emitir el enlace:", error);
    volver("error", grupoId);
  }

  redirect(
    `${RUTA_INVITADOS}/${grupoId}?estado=enlace-emitido&token=${encodeURIComponent(String(data))}`,
  );
}

/**
 * Nombre, apellidos y correo de una persona, comprobados como los comprueba la
 * base. Lo comparten el alta y la edición.
 */
function datosPersona(
  datos: FormData,
):
  | { ok: false; estado: Estado }
  | { ok: true; valores: { nombre: string; apellidos: string | null; correo: string | null } } {
  const nombre = texto(datos, "nombre");
  const apellidos = texto(datos, "apellidos") || null;
  const correo = texto(datos, "correo_electronico") || null;

  if (nombre.length < LONGITUD_MINIMA_NOMBRE) return { ok: false, estado: "nombre-persona" };
  if (
    nombre.length > LARGOS_DE_CAMPO["invitados.nombre"] ||
    (apellidos?.length ?? 0) > LARGOS_DE_CAMPO["invitados.apellidos"]
  ) {
    return { ok: false, estado: "persona-larga" };
  }
  if (correo && !esCorreoValido(correo)) return { ok: false, estado: "correo" };

  return { ok: true, valores: { nombre, apellidos, correo } };
}

export async function anadirPersona(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const token = texto(datos, "token");
  const esNino = datos.get("es_nino") !== null;

  if (!grupoId) volver("no-existe");
  const persona = datosPersona(datos);
  if (!persona.ok) volver(persona.estado, grupoId, token);
  const { nombre, apellidos, correo } = persona.valores;

  const supabase = await cliente();
  const { error, count } = await supabase.from("invitados").insert(
    {
      grupo_id: grupoId,
      nombre,
      apellidos,
      // El correo es a donde sale el acuse cuando contesta (BODA-57). Sin un
      // sitio donde apuntarlo, el acuse no podía salir nunca.
      correo_electronico: correo,
      es_nino: esNino,
    },
    { count: "exact" },
  );

  if (error) {
    console.error("No se pudo añadir a la persona:", error);
    volver("error", grupoId, token);
  }
  // RLS no da error cuando prohíbe una escritura: no toca ninguna fila.
  if (count === 0) volver("sin-permiso", grupoId, token);

  volver("persona-anadida", grupoId, token);
}

/**
 * Corrige el nombre, los apellidos o el correo de alguien ya dado de alta.
 *
 * NO TOCA LO QUE CONTESTÓ: el menú, las alergias y si viene son suyos, y
 * viven en su respuesta. Tampoco «es menor», que arrastra el menú infantil y
 * tiene su propia regla en la base. Esto es corregir una errata o apuntar el
 * correo que faltaba, que es lo que el panel no dejaba hacer.
 */
export async function editarPersona(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const personaId = texto(datos, "persona_id");
  const token = texto(datos, "token");
  if (!grupoId || !personaId) volver("no-existe");

  const persona = datosPersona(datos);
  if (!persona.ok) volver(persona.estado, grupoId, token);
  const { nombre, apellidos, correo } = persona.valores;

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("invitados")
    .update({ nombre, apellidos, correo_electronico: correo })
    .eq("id", personaId)
    .eq("grupo_id", grupoId)
    .select("id");

  if (error) {
    console.error("No se pudo editar a la persona:", error);
    volver("error", grupoId, token);
  }
  // Cero filas a un editor es que la persona ya no está: la quitaron desde
  // otra pestaña. «Sólo un editor puede…» se lo decía a quien lo es.
  if (!data?.length) {
    volver(
      (await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "persona-no-existe",
      grupoId,
      token,
    );
  }

  volver("persona-editada", grupoId, token);
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
  const token = texto(datos, "token");
  if (!grupoId || !personaId) volver("no-existe");

  const supabase = await cliente();

  /*
    SI NO SE PUEDE LEER LA RESPUESTA, NO SE BORRA. El error se ignoraba y la
    lectura fallida deja `confirmacion` a `null`, que aquí significa «no ha
    contestado nadie» — o sea, exactamente el permiso para borrar. Un fallo de
    lectura se convertía así en el borrado en cascada que este guardia existe
    para impedir, y encima en silencio. Ante la duda no se quita a nadie: quien
    lo intenta lo vuelve a intentar, y lo borrado no vuelve.
  */
  const { data: confirmacion, error: errorLectura } = await supabase
    .from("confirmaciones")
    .select("estado")
    .eq("invitado_id", personaId)
    .eq("es_vigente", true)
    .maybeSingle();

  if (errorLectura) {
    console.error("No se pudo comprobar si la persona había contestado:", errorLectura);
    volver("error", grupoId, token);
  }

  if (confirmacion && confirmacion.estado !== "pendiente") {
    volver("quitar-con-respuesta", grupoId, token);
  }

  const { error, count } = await supabase
    .from("invitados")
    .delete({ count: "exact" })
    .eq("id", personaId)
    .eq("grupo_id", grupoId);

  if (error) {
    console.error("No se pudo quitar a la persona:", error);
    volver("error", grupoId, token);
  }
  if (count === 0) {
    volver(
      (await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "persona-no-existe",
      grupoId,
      token,
    );
  }

  volver("persona-quitada", grupoId, token);
}

/**
 * APUNTAR LA RESPUESTA QUE LLEGA POR TELÉFONO.
 *
 * Pasado el plazo, la pantalla de pendientes manda llamar a quien falte; la
 * tía llama y dice que vienen tres y uno es celíaco, y no había dónde
 * apuntarlo. La base lo tenía previsto —el origen `panel`, «los novios a mano
 * tras una llamada», que el plazo no frena— y ninguna pantalla lo usaba.
 *
 * Es una respuesta nueva, como cuando el invitado la cambia desde su enlace:
 * el histórico es inmutable y la anterior deja de ser la vigente. Lo que ya
 * había escrito —su mensaje— viaja con ella para no perderlo de la bandeja.
 * El menú y las alergias viven en la persona, y se escriben antes: si lo
 * segundo fallara, lo anotado seguiría siendo cierto.
 */
export async function apuntarRespuesta(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const personaId = texto(datos, "persona_id");
  const token = texto(datos, "token");
  if (!grupoId || !personaId) volver("no-existe");

  const estado = texto(datos, "estado");
  if (estado !== "confirmado" && estado !== "rechazado") {
    volver("respuesta-sin-estado", grupoId, token);
  }
  const viene = estado === "confirmado";
  const menu = texto(datos, "tipo_menu") || MENUS_RSVP[0];
  const alergias = texto(datos, "alergias") || null;
  if (viene && !(MENUS_RSVP as readonly string[]).includes(menu))
    volver("error", grupoId, token);
  if ((alergias?.length ?? 0) > LARGOS_DE_CAMPO["invitados.alergias"]) {
    volver("alergias-largas", grupoId, token);
  }

  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso", grupoId, token);

  const supabase = await cliente();

  const { data: persona, error: errorPersona } = await supabase
    .from("invitados")
    .select("id, es_nino")
    .eq("id", personaId)
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (errorPersona) volver("error", grupoId, token);
  if (!persona) volver("persona-no-existe", grupoId, token);
  // La misma regla que la base (`invitados_menu_infantil_solo_ninos`), dicha antes.
  if (viene && menu === "infantil" && !persona.es_nino) volver("menu-infantil", grupoId, token);

  const { data: anterior } = await supabase
    .from("confirmaciones")
    .select("mensaje, cancion_solicitada")
    .eq("invitado_id", personaId)
    .eq("es_vigente", true)
    .maybeSingle();

  if (viene) {
    const { data: escrita, error } = await supabase
      .from("invitados")
      .update({ tipo_menu: menu, alergias })
      .eq("id", personaId)
      .select("id");
    if (error) {
      console.error("No se pudo apuntar el menú:", error);
      volver("error", grupoId, token);
    }
    if (!escrita?.length) volver("sin-permiso", grupoId, token);
  }

  const { error, count } = await supabase.from("confirmaciones").insert(
    {
      invitado_id: personaId,
      estado,
      origen: "panel",
      registrado_por: acceso.perfilId,
      respondido_en: new Date().toISOString(),
      // Como en el formulario del invitado: el alojamiento no se pregunta.
      necesita_autobus: viene ? datos.get("necesita_autobus") !== null : null,
      necesita_alojamiento: viene ? false : null,
      mensaje: anterior?.mensaje ?? null,
      cancion_solicitada: anterior?.cancion_solicitada ?? null,
    },
    { count: "exact" },
  );

  if (error) {
    console.error("No se pudo apuntar la respuesta:", error);
    volver("error", grupoId, token);
  }
  if (count === 0) volver("sin-permiso", grupoId, token);

  revalidatePath(RUTA_INVITADOS);
  volver("respuesta-apuntada", grupoId, token);
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
  redirect(`${URL_WHATSAPP}?text=${encodeURIComponent(mensaje)}`);
}

/**
 * BODA-111 · RECORDARLE A QUIEN NO HA CONTESTADO
 *
 * Anota el recordatorio y lleva a WhatsApp, igual que el reparto. Lo que cambia
 * es quién decide si se puede: aquí no basta con que la pantalla lo ofrezca.
 *
 * ENTRE ABRIR LA LISTA Y PULSAR EL BOTÓN PASAN MINUTOS, y en esos minutos
 * alguien puede contestar desde su móvil. `marcar_recordatorio()` mira el
 * estado en el instante de escribir y se niega si ya hay respuesta — el
 * criterio del ticket es «nunca alcanza a quien ya ha respondido, en ninguna
 * circunstancia», y una lista pintada hace un rato no puede garantizar eso.
 *
 * Cuando la base dice que no, NO se abre WhatsApp. Es la diferencia entre un
 * aviso y un mensaje mandado: si se abriera igual, quien organiza tendría el
 * texto delante y lo enviaría de todas formas.
 */
export async function recordarPorWhatsApp(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  const mensaje = texto(datos, "mensaje");

  if (!grupoId) volver("no-existe");
  if (mensaje === "") volver("error", grupoId);

  const supabase = await cliente();
  const { error } = await supabase.rpc("marcar_recordatorio", { p_grupo_id: grupoId });

  if (error) {
    if (error.message.includes("REC01")) redirect(`${RUTA_PENDIENTES}?estado=ya-contesto`);
    if (error.message.includes("REC02")) redirect(`${RUTA_PENDIENTES}?estado=plazo`);
    if (error.message.includes("RSV06")) redirect(`${RUTA_PENDIENTES}?estado=sin-permiso`);
    console.error("No se pudo anotar el recordatorio:", error);
    redirect(`${RUTA_PENDIENTES}?estado=error`);
  }

  revalidatePath(RUTA_PENDIENTES);
  redirect(`${URL_WHATSAPP}?text=${encodeURIComponent(mensaje)}`);
}
