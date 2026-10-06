"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  LARGOS_DE_CAMPO,
  LONGITUD_MAXIMA_AVISO_PROGRAMA,
  LONGITUD_MINIMA_FRASE_PAISAJE,
  LONGITUD_MINIMA_NOMBRE,
  RUTA_ACCESO,
  RUTA_AJUSTES,
  TOPE_AVISOS_PROGRAMA,
} from "@/config/constants";
import { borrarBorradorAjustes, guardarBorradorAjustes } from "@/lib/ajustes-borrador";
import { esCorreoValido } from "@/lib/correo-valido";
import { esIbanValido } from "@/lib/iban";
import { ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";
import { instanteDesdeLocal } from "@/lib/zona-horaria";

import { anclaDeCampo, type CampoAjustes, type EstadoAjustes } from "./estado";

/**
 * BODA-44 · GUARDAR LOS DATOS DE LA BODA
 *
 * `configuracion_boda` alimenta la portada, la cuenta atrás, el mapa, el `.ics`
 * y la vista previa al compartir. Es el dato más visible de la web y hasta
 * ahora la única forma de tocarlo era el editor SQL de Supabase.
 *
 * SE VALIDA AQUÍ AUNQUE LA BASE YA VALIDE. La tabla tiene `CHECK` para casi
 * todo esto, y son ellos los que mandan. Pero un `CHECK` que salta devuelve un
 * error de Postgres con el nombre de la restricción, y eso no es un mensaje
 * para nadie. Se comprueba antes para poder decir qué pasa en castellano, y se
 * deja el `CHECK` detrás como red: si algo se escapa de aquí, no entra igual.
 *
 * QUIÉN PUEDE GUARDAR lo decide RLS, no este fichero. La política
 * `configuracion_boda_editor_actualizar` exige `puede_editar()`, que es
 * propietario o editor. Un lector puede llegar hasta aquí —la pantalla se le
 * enseña— y la base no le dejará escribir. Lo que se hace aquí es traducir ese
 * «no» a una frase, no sustituirlo.
 */

/**
 * A LA PANTALLA, Y SI EL FALLO ES DE UN CAMPO, A ESE CAMPO.
 *
 * El aviso salía en una línea arriba del todo, y en el móvil el error de la
 * cuenta quedaba a cuatro mil píxeles de su campo. Con el campo en la URL, la
 * página lo marca —en rojo, con el porqué debajo— y el ancla la lleva hasta él.
 */
function volver(estado: EstadoAjustes, campo?: CampoAjustes): never {
  redirect(
    `${RUTA_AJUSTES}?estado=${estado}${campo ? `&campo=${campo}#${anclaDeCampo(campo)}` : ""}`,
  );
}

/**
 * VOLVER CON UN ERROR SIN PERDER LO ESCRITO. Lo enviado se queda en un
 * borrador (`ajustes-borrador.ts`) y la página lo prefiere a la base mientras
 * el aviso sea de error: corregir una fecha ya no deshace el lugar, la
 * dirección y el paisaje que se habían cambiado en el mismo envío.
 *
 * Se llama con `return`: es asíncrona, y así el control de flujo sabe que no
 * se sigue.
 */
async function rechazar(
  datos: FormData,
  estado: EstadoAjustes,
  campo?: CampoAjustes,
): Promise<never> {
  await guardarBorradorAjustes(datos);
  volver(estado, campo);
}

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/** Un campo de texto vacío es `null` en la base, no la cadena vacía. */
function textoONulo(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

/**
 * Los avisos del programa, uno por línea. Las líneas en blanco se ignoran —son
 * lo que deja un intro de más— y lo que queda tiene que caber: como mucho
 * `TOPE_AVISOS_PROGRAMA`, y ninguno más largo de lo que cabe en una etiqueta.
 * Devuelve `null` si no hay ninguno, que es como la base dice «sin avisos».
 */
function avisosDelPrograma(datos: FormData): string[] | null | undefined {
  const lineas = texto(datos, "avisos_programa")
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean);
  if (lineas.length === 0) return null;
  const caben =
    lineas.length <= TOPE_AVISOS_PROGRAMA &&
    lineas.every((linea) => linea.length <= LONGITUD_MAXIMA_AVISO_PROGRAMA);
  return caben ? lineas : undefined;
}

/**
 * Coordenada suelta. Se acepta la coma decimal porque es la que sale del
 * teclado español y la que copia y pega quien mira Google Maps en castellano;
 * rechazarla sería castigar a quien escribe bien en su idioma.
 *
 * `undefined` significa «no es un número» —error— y `null`, «no hay dato».
 */
function coordenada(datos: FormData, campo: string, tope: number): number | null | undefined {
  const bruto = texto(datos, campo).replace(",", ".");
  if (!bruto) return null;

  const numero = Number(bruto);
  if (!Number.isFinite(numero) || Math.abs(numero) > tope) return undefined;
  return numero;
}

export async function guardarAjustes(datos: FormData) {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);

  if (texto(datos, "nombre_novia").length < LONGITUD_MINIMA_NOMBRE) {
    return rechazar(datos, "nombres", "nombre_novia");
  }
  if (texto(datos, "nombre_novio").length < LONGITUD_MINIMA_NOMBRE) {
    return rechazar(datos, "nombres", "nombre_novio");
  }
  const nombreNovia = texto(datos, "nombre_novia");
  const nombreNovio = texto(datos, "nombre_novio");

  /*
    LOS TOPES DE LA BASE, ANTES DE ESCRIBIR. Sin esto, una dirección de 301
    caracteres o un nombre de 81 llegaban al CHECK y volvían como «no hemos
    podido guardar los ajustes. Inténtalo de nuevo», que no va a funcionar.
  */
  const topes: [CampoAjustes, number][] = [
    ["nombre_novia", LARGOS_DE_CAMPO["configuracion_boda.nombre_novia"]],
    ["nombre_novio", LARGOS_DE_CAMPO["configuracion_boda.nombre_novio"]],
    ["lugar_ceremonia", LARGOS_DE_CAMPO["configuracion_boda.lugar_ceremonia"]],
    ["direccion_ceremonia", LARGOS_DE_CAMPO["configuracion_boda.direccion_ceremonia"]],
    ["ciudad_ceremonia", LARGOS_DE_CAMPO["configuracion_boda.ciudad_ceremonia"]],
    ["lugar_banquete", LARGOS_DE_CAMPO["configuracion_boda.lugar_banquete"]],
    ["direccion_banquete", LARGOS_DE_CAMPO["configuracion_boda.direccion_banquete"]],
    ["paisaje_intro", LARGOS_DE_CAMPO["configuracion_boda.paisaje_intro"]],
    ["paisaje_titulo", LARGOS_DE_CAMPO["configuracion_boda.paisaje_titulo"]],
    ["paisaje_cierre", LARGOS_DE_CAMPO["configuracion_boda.paisaje_cierre"]],
  ];
  const demasiadoLargo = topes.find(([campo, tope]) => texto(datos, campo).length > tope);
  if (demasiadoLargo) return rechazar(datos, "largo", demasiadoLargo[0]);

  const frasesDelPaisaje: CampoAjustes[] = [
    "paisaje_intro",
    "paisaje_titulo",
    "paisaje_cierre",
  ];
  const fraseCorta = frasesDelPaisaje.find((campo) => {
    const frase = texto(datos, campo);
    return frase.length > 0 && frase.length < LONGITUD_MINIMA_FRASE_PAISAJE;
  });
  if (fraseCorta) return rechazar(datos, "paisaje-corto", fraseCorta);

  const hashtag = textoONulo(datos, "hashtag");
  if (hashtag && !/^#[\p{L}\p{N}_]{1,60}$/u.test(hashtag)) {
    return rechazar(datos, "hashtag", "hashtag");
  }

  const correo = textoONulo(datos, "correo_contacto");
  // La regla de la base (`es_correo_valido`), no una parecida: la de antes
  // dejaba pasar «a@b.c» y el CHECK lo rechazaba con el aviso genérico.
  if (correo && !esCorreoValido(correo)) return rechazar(datos, "correo", "correo_contacto");

  /*
    LAS COORDENADAS, POR PAREJAS Y CON SU CAMPO. La base exige que vayan las
    dos o ninguna: media coordenada no señala ningún punto del mapa. El error
    va al campo que falla —o al que falta—, no a «las coordenadas» en general.
  */
  const parejas: [CampoAjustes, CampoAjustes][] = [
    ["latitud_ceremonia", "longitud_ceremonia"],
    ["latitud_banquete", "longitud_banquete"],
  ];
  const coordenadas: Partial<Record<CampoAjustes, number | null>> = {};
  for (const [latitud, longitud] of parejas) {
    const lat = coordenada(datos, latitud, 90);
    const lon = coordenada(datos, longitud, 180);
    if (lat === undefined) return rechazar(datos, "coordenadas", latitud);
    if (lon === undefined) return rechazar(datos, "coordenadas", longitud);
    if (lat === null && lon !== null) return rechazar(datos, "coordenadas", latitud);
    if (lat !== null && lon === null) return rechazar(datos, "coordenadas", longitud);
    coordenadas[latitud] = lat;
    coordenadas[longitud] = lon;
  }

  const avisos = avisosDelPrograma(datos);
  if (avisos === undefined) return rechazar(datos, "avisos", "avisos_programa");

  try {
    const supabase = await clienteServidor();

    const { data: sesion } = await supabase.auth.getUser();
    if (!sesion.user) redirect(RUTA_ACCESO);

    // La zona sale de la propia fila: las horas del formulario vienen sin zona
    // y hay que saber de dónde son antes de convertirlas a instantes.
    const { data: actual, error: errorLectura } = await supabase
      .from("configuracion_boda")
      .select("id, zona_horaria, actualizado_en")
      .maybeSingle<{ id: string; zona_horaria: string; actualizado_en: string }>();

    if (errorLectura || !actual) {
      console.error("No se pudo leer la configuración:", errorLectura?.message);
      return await rechazar(datos, "error");
    }

    /*
      DOS PERSONAS CON AJUSTES ABIERTO. El formulario manda los veinte campos,
      los tocados y los que no, así que quien guardaba el último deshacía en
      silencio lo del otro: el lugar del banquete volvía al antiguo en la web,
      el `.ics` y la tarjeta de WhatsApp. El formulario lleva la versión que
      se pintó; si la fila ya es otra, no se escribe, se dice.
    */
    const version = texto(datos, "actualizado_en");
    if (version && version !== actual.actualizado_en) return await rechazar(datos, "cambiado");

    const zona = actual.zona_horaria;

    const ceremonia = instanteDesdeLocal(texto(datos, "fecha_hora_ceremonia"), zona);
    if (!ceremonia) return await rechazar(datos, "ceremonia", "fecha_hora_ceremonia");

    /*
      FALTAR NO ES LLEGAR TARDE. Un campo vacío o a medio escribir también hace
      `null` aquí, y contestaba «la fecha límite no puede ser posterior a la
      ceremonia» — una frase sobre dos fechas cuando sólo hay una, que manda a
      mirar la que sí está puesta. Cada motivo tiene el suyo.
    */
    const limite = instanteDesdeLocal(texto(datos, "fecha_limite_rsvp"), zona);
    if (!limite) return await rechazar(datos, "limite", "fecha_limite_rsvp");

    // Pedir confirmación después de la boda no tiene sentido, y es un error
    // fácil de cometer copiando la fecha de arriba.
    //
    // `>=` Y NO `>`, PORQUE EL CHECK DE LA BASE ES ESTRICTO: exige
    // `fecha_limite_rsvp < fecha_hora_ceremonia`. Con `>` aquí, copiar la fecha
    // de la ceremonia tal cual pasaba esta comprobación y la rechazaba la base
    // con 23514, que acababa en «no hemos podido guardar los ajustes» sin decir
    // qué campo. Justo el caso que este aviso existe para explicar.
    if (limite.getTime() >= ceremonia.getTime()) {
      return await rechazar(datos, "limite-tarde", "fecha_limite_rsvp");
    }

    const banqueteTexto = texto(datos, "fecha_hora_banquete");
    const banquete = banqueteTexto ? instanteDesdeLocal(banqueteTexto, zona) : null;
    if (banqueteTexto && !banquete) {
      return await rechazar(datos, "banquete", "fecha_hora_banquete");
    }
    if (banquete && banquete.getTime() < ceremonia.getTime()) {
      return await rechazar(datos, "banquete-antes", "fecha_hora_banquete");
    }

    const { error, count } = await supabase
      .from("configuracion_boda")
      .update(
        {
          nombre_novia: nombreNovia,
          nombre_novio: nombreNovio,
          hashtag,
          correo_contacto: correo,
          fecha_hora_ceremonia: ceremonia.toISOString(),
          fecha_hora_banquete: banquete ? banquete.toISOString() : null,
          fecha_limite_rsvp: limite.toISOString(),
          paisaje_intro: textoONulo(datos, "paisaje_intro"),
          paisaje_titulo: textoONulo(datos, "paisaje_titulo"),
          paisaje_cierre: textoONulo(datos, "paisaje_cierre"),
          ciudad_ceremonia: textoONulo(datos, "ciudad_ceremonia"),
          avisos_programa: avisos,
          lugar_ceremonia: textoONulo(datos, "lugar_ceremonia"),
          direccion_ceremonia: textoONulo(datos, "direccion_ceremonia"),
          latitud_ceremonia: coordenadas.latitud_ceremonia ?? null,
          longitud_ceremonia: coordenadas.longitud_ceremonia ?? null,
          lugar_banquete: textoONulo(datos, "lugar_banquete"),
          direccion_banquete: textoONulo(datos, "direccion_banquete"),
          latitud_banquete: coordenadas.latitud_banquete ?? null,
          longitud_banquete: coordenadas.longitud_banquete ?? null,
        },
        { count: "exact" },
      )
      .eq("id", actual.id)
      // Y la versión otra vez al escribir: entre leerla y escribir cabe otro.
      .eq("actualizado_en", actual.actualizado_en);

    if (error) {
      console.error("No se pudo guardar la configuración:", error.message);
      return await rechazar(datos, "error");
    }

    /**
     * RLS NO DA ERROR CUANDO PROHÍBE UNA ESCRITURA: devuelve cero filas
     * tocadas, porque para la política esa fila sencillamente no existe. Sin
     * mirar el recuento, un lector vería «Guardado» y no se habría guardado
     * nada — que es la peor de las respuestas posibles. Con permiso, cero
     * filas es que la versión cambió en ese instante.
     */
    if (count === 0) {
      return await rechazar(
        datos,
        (await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "cambiado",
      );
    }
  } catch (error) {
    // `redirect` funciona lanzando: hay que dejar pasar su excepción o los
    // saltos de arriba se quedarían aquí atrapados y la pantalla no diría nada.
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al guardar la configuración:", error);
    return rechazar(datos, "error");
  }

  // La landing lee esta tabla en cada petición, pero el `.ics` y las imágenes
  // de Open Graph son rutas aparte: sin esto seguirían sirviendo la fecha
  // anterior en la tarjeta de WhatsApp.
  revalidatePath("/", "layout");
  await borrarBorradorAjustes();
  volver("guardado");
}

/**
 * BODA-129 · LA CUENTA PARA LOS REGALOS
 *
 * VA EN SU PROPIA ACCIÓN Y NO DENTRO DE `guardarAjustes`, y hay dos motivos.
 * El primero es la tabla: el IBAN vive en `configuracion_privada`, que es la
 * que `anon` no puede tocar ni de lejos, y mezclarla con la configuración
 * pública en un mismo `update` sería una sola pantalla escribiendo en dos
 * tablas con dos niveles de secreto.
 *
 * El segundo es quién puede. `configuracion_privada_propietario_actualizar`
 * exige `es_propietario()`, no `puede_editar()`: un editor que cambia la hora
 * de la ceremonia NO cambia la cuenta corriente. Si estuvieran en la misma
 * acción, o se le negaría todo o se le colaría el IBAN.
 *
 * SIN IBAN NO HAY SECCIÓN DE REGALOS. `datos_para_regalos()` devuelve cero
 * filas cuando está vacío, y la landing lo oculta. Por eso vaciarlo es una
 * forma legítima de apagar la sección, y aquí se admite.
 */

/**
 * El IBAN, normalizado como lo guarda la base.
 *
 * Se quitan los espacios y se pasa a mayúsculas antes de comprobar nada: «ES91
 * 2100 0418 4502 0005 1332» es como lo imprime el banco y como lo copia
 * cualquiera, y rechazarlo por los espacios sería rechazar un dato correcto por
 * cómo está escrito.
 *
 * Y SE COMPRUEBAN LOS DÍGITOS DE CONTROL, no sólo la forma: «ES91 2100 0418
 * 4502 0005 1333», con la última cifra cambiada, se guardaba, salía en la web y
 * el banco de cada invitado rechazaba la transferencia. Es la misma regla que
 * el `CHECK` de la tabla (`es_iban_valido()`); aquí se comprueba antes para
 * poder decirlo en castellano y la base se queda detrás como red.
 *
 * `undefined` significa «no es un IBAN» —error— y `null`, «no hay dato», que es
 * lo que apaga la sección.
 */
function ibanNormalizado(datos: FormData): string | null | undefined {
  const bruto = texto(datos, "iban_regalos").replace(/\s+/g, "").toUpperCase();
  if (!bruto) return null;
  return esIbanValido(bruto) ? bruto : undefined;
}

export async function guardarRegalos(datos: FormData) {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);

  const iban = ibanNormalizado(datos);
  if (iban === undefined) return rechazar(datos, "iban", "iban_regalos");

  const titular = textoONulo(datos, "titular_cuenta");

  try {
    const supabase = await clienteServidor();

    const { data: sesion } = await supabase.auth.getUser();
    if (!sesion.user) redirect(RUTA_ACCESO);

    const { data: actual, error: errorLectura } = await supabase
      .from("configuracion_privada")
      .select("id")
      .maybeSingle();

    if (errorLectura || !actual) {
      /*
        Cero filas aquí es RLS: leer `configuracion_privada` ya pide
        `puede_editar()`. A un lector no se le enseña ni el formulario, así que
        llegar aquí significa que alguien lo ha mandado a mano.
      */
      if (errorLectura) console.error("No se pudo leer la cuenta:", errorLectura.message);
      return await rechazar(datos, "solo-propietario");
    }

    const { error, count } = await supabase
      .from("configuracion_privada")
      .update({ iban_regalos: iban, titular_cuenta: titular }, { count: "exact" })
      .eq("id", actual.id);

    if (error) {
      // El `CHECK` del IBAN, si algo se escapó de la comprobación de arriba.
      if (error.message?.includes("iban")) return await rechazar(datos, "iban", "iban_regalos");
      console.error("No se pudo guardar la cuenta:", error.message);
      return await rechazar(datos, "error");
    }

    /*
      RLS NO DA ERROR CUANDO PROHÍBE: devuelve cero filas tocadas. Aquí eso
      significa «no eres propietario», que es un mensaje distinto del de
      siempre — un editor puede tocar todo lo demás de esta pantalla.
    */
    if (count === 0) return await rechazar(datos, "solo-propietario");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al guardar la cuenta:", error);
    return rechazar(datos, "error");
  }

  // La sección de regalos aparece o desaparece según haya cuenta, así que el
  // menú de la landing cambia con esto.
  revalidatePath("/", "layout");
  await borrarBorradorAjustes();
  volver("regalos-guardado");
}
