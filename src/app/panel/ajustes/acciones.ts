"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  LONGITUD_MAXIMA_AVISO_PROGRAMA,
  LONGITUD_MINIMA_NOMBRE,
  RUTA_ACCESO,
  RUTA_AJUSTES,
  TOPE_AVISOS_PROGRAMA,
} from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";
import { instanteDesdeLocal } from "@/lib/zona-horaria";

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

/** Los estados con los que vuelve la pantalla. Cada uno tiene su copy. */
type Estado =
  | "guardado"
  | "regalos-guardado"
  | "iban"
  | "solo-propietario"
  | "nombres"
  | "ceremonia"
  | "limite"
  | "limite-tarde"
  | "banquete"
  | "banquete-antes"
  | "coordenadas"
  | "hashtag"
  | "correo"
  | "avisos"
  | "sin-permiso"
  | "error";

function volver(estado: Estado): never {
  redirect(`${RUTA_AJUSTES}?estado=${estado}`);
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

  const nombreNovia = texto(datos, "nombre_novia");
  const nombreNovio = texto(datos, "nombre_novio");
  if (
    nombreNovia.length < LONGITUD_MINIMA_NOMBRE ||
    nombreNovio.length < LONGITUD_MINIMA_NOMBRE
  ) {
    volver("nombres");
  }

  const hashtag = textoONulo(datos, "hashtag");
  if (hashtag && !/^#[\p{L}\p{N}_]{1,60}$/u.test(hashtag)) volver("hashtag");

  const correo = textoONulo(datos, "correo_contacto");
  if (correo && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(correo)) volver("correo");

  const latCeremonia = coordenada(datos, "latitud_ceremonia", 90);
  const lonCeremonia = coordenada(datos, "longitud_ceremonia", 180);
  const latBanquete = coordenada(datos, "latitud_banquete", 90);
  const lonBanquete = coordenada(datos, "longitud_banquete", 180);

  if ([latCeremonia, lonCeremonia, latBanquete, lonBanquete].includes(undefined)) {
    volver("coordenadas");
  }

  // La base exige que vayan las dos o ninguna: media coordenada no señala
  // ningún punto del mapa.
  if ((latCeremonia === null) !== (lonCeremonia === null)) volver("coordenadas");
  if ((latBanquete === null) !== (lonBanquete === null)) volver("coordenadas");

  try {
    const supabase = await clienteServidor();

    const { data: sesion } = await supabase.auth.getUser();
    if (!sesion.user) redirect(RUTA_ACCESO);

    // La zona sale de la propia fila: las horas del formulario vienen sin zona
    // y hay que saber de dónde son antes de convertirlas a instantes.
    const { data: actual, error: errorLectura } = await supabase
      .from("configuracion_boda")
      .select("id, zona_horaria")
      .maybeSingle();

    if (errorLectura || !actual) {
      console.error("No se pudo leer la configuración:", errorLectura?.message);
      volver("error");
    }

    const zona = actual.zona_horaria;

    const ceremonia = instanteDesdeLocal(texto(datos, "fecha_hora_ceremonia"), zona);
    if (!ceremonia) volver("ceremonia");

    /*
      FALTAR NO ES LLEGAR TARDE. Un campo vacío o a medio escribir también hace
      `null` aquí, y contestaba «la fecha límite no puede ser posterior a la
      ceremonia» — una frase sobre dos fechas cuando sólo hay una, que manda a
      mirar la que sí está puesta. Cada motivo tiene el suyo.
    */
    const limite = instanteDesdeLocal(texto(datos, "fecha_limite_rsvp"), zona);
    if (!limite) volver("limite");

    // Pedir confirmación después de la boda no tiene sentido, y es un error
    // fácil de cometer copiando la fecha de arriba.
    if (limite.getTime() > ceremonia.getTime()) volver("limite-tarde");

    const avisos = avisosDelPrograma(datos);
    if (avisos === undefined) volver("avisos");

    const banqueteTexto = texto(datos, "fecha_hora_banquete");
    const banquete = banqueteTexto ? instanteDesdeLocal(banqueteTexto, zona) : null;
    if (banqueteTexto && !banquete) volver("banquete");
    if (banquete && banquete.getTime() < ceremonia.getTime()) volver("banquete-antes");

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
          latitud_ceremonia: latCeremonia,
          longitud_ceremonia: lonCeremonia,
          lugar_banquete: textoONulo(datos, "lugar_banquete"),
          direccion_banquete: textoONulo(datos, "direccion_banquete"),
          latitud_banquete: latBanquete,
          longitud_banquete: lonBanquete,
        },
        { count: "exact" },
      )
      .eq("id", actual.id);

    if (error) {
      console.error("No se pudo guardar la configuración:", error.message);
      volver("error");
    }

    /**
     * RLS NO DA ERROR CUANDO PROHÍBE UNA ESCRITURA: devuelve cero filas
     * tocadas, porque para la política esa fila sencillamente no existe. Sin
     * mirar el recuento, un lector vería «Guardado» y no se habría guardado
     * nada — que es la peor de las respuestas posibles.
     */
    if (count === 0) volver("sin-permiso");
  } catch (error) {
    // `redirect` funciona lanzando: hay que dejar pasar su excepción o los
    // saltos de arriba se quedarían aquí atrapados y la pantalla no diría nada.
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al guardar la configuración:", error);
    volver("error");
  }

  // La landing lee esta tabla en cada petición, pero el `.ics` y las imágenes
  // de Open Graph son rutas aparte: sin esto seguirían sirviendo la fecha
  // anterior en la tarjeta de WhatsApp.
  revalidatePath("/", "layout");
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
 * El patrón es EL MISMO que el `CHECK` de la tabla
 * (`configuracion_privada_iban_valido`). Aquí se comprueba antes para poder
 * decirlo en castellano; la base se queda detrás como red.
 *
 * `undefined` significa «no es un IBAN» —error— y `null`, «no hay dato», que es
 * lo que apaga la sección.
 */
function ibanNormalizado(datos: FormData): string | null | undefined {
  const bruto = texto(datos, "iban_regalos").replace(/\s+/g, "").toUpperCase();
  if (!bruto) return null;
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(bruto) ? bruto : undefined;
}

export async function guardarRegalos(datos: FormData) {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);

  const iban = ibanNormalizado(datos);
  if (iban === undefined) volver("iban");

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
      volver("solo-propietario");
    }

    const { error, count } = await supabase
      .from("configuracion_privada")
      .update({ iban_regalos: iban, titular_cuenta: titular }, { count: "exact" })
      .eq("id", actual.id);

    if (error) {
      // El `CHECK` del IBAN, si algo se escapó de la comprobación de arriba.
      if (error.message?.includes("iban")) volver("iban");
      console.error("No se pudo guardar la cuenta:", error.message);
      volver("error");
    }

    /*
      RLS NO DA ERROR CUANDO PROHÍBE: devuelve cero filas tocadas. Aquí eso
      significa «no eres propietario», que es un mensaje distinto del de
      siempre — un editor puede tocar todo lo demás de esta pantalla.
    */
    if (count === 0) volver("solo-propietario");
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al guardar la cuenta:", error);
    volver("error");
  }

  // La sección de regalos aparece o desaparece según haya cuenta, así que el
  // menú de la landing cambia con esto.
  revalidatePath("/", "layout");
  volver("regalos-guardado");
}
