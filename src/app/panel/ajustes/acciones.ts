"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LONGITUD_MINIMA_NOMBRE, RUTA_ACCESO, RUTA_AJUSTES } from "@/config/constants";
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
  | "nombres"
  | "ceremonia"
  | "limite-tarde"
  | "banquete-antes"
  | "coordenadas"
  | "hashtag"
  | "correo"
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

    const limite = instanteDesdeLocal(texto(datos, "fecha_limite_rsvp"), zona);
    if (!limite) volver("limite-tarde");

    // Pedir confirmación después de la boda no tiene sentido, y es un error
    // fácil de cometer copiando la fecha de arriba.
    if (limite.getTime() > ceremonia.getTime()) volver("limite-tarde");

    const banqueteTexto = texto(datos, "fecha_hora_banquete");
    const banquete = banqueteTexto ? instanteDesdeLocal(banqueteTexto, zona) : null;
    if (banqueteTexto && !banquete) volver("banquete-antes");
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
