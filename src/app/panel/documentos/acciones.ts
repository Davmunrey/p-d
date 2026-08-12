"use server";

import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_DOCUMENTOS } from "@/config/constants";
import {
  ESTADO_INICIAL_DOCUMENTO,
  esEstadoDocumento,
  esTitularDocumento,
} from "@/lib/bbdd/documentos";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoDocumentos } from "./estado";

/**
 * BODA-105 · APUNTAR, CONSEGUIR Y BORRAR PAPELES
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE, no este fichero. La política
 * `documentos_boda_escribir` exige `puede_editar()`. Aquí sólo se traduce ese
 * «no» a una frase en castellano y se evita ofrecer un botón que va a fallar.
 *
 * OJO CON EL SILENCIO DE RLS: una escritura prohibida no da error, devuelve
 * cero filas tocadas. Por eso cada operación pide de vuelta lo que ha escrito y
 * mira si ha venido algo, en lugar de conformarse con que `error` sea nulo.
 *
 * LA REGLA «CONSEGUIDO ⇔ FECHA» SE COMPRUEBA DOS VECES, Y NO SOBRA NINGUNA. El
 * `check` de la base es quien manda —vale igual si alguien escribe por SQL—
 * pero sólo sabe decir que una restricción ha saltado. Aquí se mira antes para
 * poder decir QUÉ falta, que es lo que resuelve el problema en vez de sólo
 * nombrarlo.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/** `""` se convierte en `null`: una columna opcional vacía es ausencia, no cadena vacía. */
function opcional(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

/*
  NO SE REVALIDA LA RUTA A LA QUE SE VA A REDIRIGIR.

  `revalidatePath` de la ruta destino y `redirect` a esa misma ruta compiten: el
  refresco repinta la página donde ya estás y la redirección, que sólo añadía
  una query, se pierde por el camino — y sin `?estado=` no sale el aviso de
  «hecho». Es redundante además: esta pantalla es `force-dynamic`, así que la
  redirección ya la vuelve a leer de la base entera.

  Este módulo no tiene ninguna otra pantalla que dependa de él, así que aquí no
  se revalida nada en absoluto.
*/
function volver(estado: EstadoDocumentos, extra?: Record<string, string>): never {
  const parametros = new URLSearchParams({ estado, ...extra });
  redirect(`${RUTA_DOCUMENTOS}?${parametros.toString()}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * Traduce el fallo de la base a un estado de pantalla.
 *
 * `42501` y `RSV06` son «no tienes permiso». El `check` de la fecha se nombra
 * aparte porque tiene un remedio concreto que contar; el resto es una avería
 * nuestra y se registra entera, que es la diferencia entre arreglarlo en un
 * minuto o a ciegas.
 */
function motivo(error: { code?: string; message?: string }): EstadoDocumentos {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";
  if (error.message?.includes("documentos_boda_conseguido_con_fecha")) {
    return "sin-fecha-obtencion";
  }
  if (error.message?.includes("documentos_boda_titulo_longitud")) return "titulo";

  console.error("Fallo escribiendo en documentos de la boda:", error);
  return "error";
}

/**
 * UNA FECHA SE VALIDA POR SU FORMA Y EL RESTO LO HACE LA BASE.
 *
 * `date` rechaza un 31 de febrero por su cuenta; reimplementar el calendario en
 * TypeScript para adelantarse sería tener dos calendarios y que un día no dijan
 * lo mismo.
 */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `null` cuando el campo viene vacío —que es legítimo: un papel puede no
 * caducar— y `undefined` cuando lo escrito no es una fecha. Los dos casos son
 * distintos y confundirlos guardaría un vacío donde había un error de dedo.
 */
function fecha(datos: FormData, campo: string): string | null | undefined {
  const escrita = texto(datos, campo);
  if (!escrita) return null;
  return FECHA.test(escrita) ? escrita : undefined;
}

/** Los campos que comparten el alta y la edición, ya validados. */
function camposDocumento(datos: FormData):
  | { ok: false; estado: EstadoDocumentos }
  | {
      ok: true;
      valores: {
        titulo: string;
        de_quien: string;
        donde_se_pide: string | null;
        notas: string | null;
        estado: string;
        obtenido_en: string | null;
        caduca_en: string | null;
      };
    } {
  const titulo = texto(datos, "titulo");
  if (titulo.length < 2 || titulo.length > 160) return { ok: false, estado: "titulo" };

  const deQuien = texto(datos, "de_quien");
  if (!esTitularDocumento(deQuien)) return { ok: false, estado: "de-quien" };

  /*
    EL ESTADO PUEDE NO VENIR, y entonces es el inicial. El alta no ofrece el
    desplegable de estado en el formulario reducido; en la edición sí viene
    siempre. Inventarse «conseguido» por defecto sería dar por recogido un papel
    que nadie ha ido a buscar.
  */
  const estadoEscrito = texto(datos, "estado") || ESTADO_INICIAL_DOCUMENTO;
  if (!esEstadoDocumento(estadoEscrito)) return { ok: false, estado: "estado-invalido" };

  const obtenidoEn = fecha(datos, "obtenido_en");
  const caducaEn = fecha(datos, "caduca_en");
  if (obtenidoEn === undefined || caducaEn === undefined) {
    return { ok: false, estado: "fecha" };
  }

  /*
    CONSEGUIDO SIN FECHA SE PARA AQUÍ, ANTES DEL INSERT.

    El `check` de la base lo impediría igual, pero llegaría como un fallo de
    restricción con el nombre de un constraint dentro — que no le dice nada a
    quien está rellenando un formulario. Y al revés: marcar «pendiente» con una
    fecha de obtención puesta es la misma contradicción vista del otro lado, así
    que la fecha se suelta en lugar de rechazar el guardado. Nadie pierde
    trabajo por cambiar de opinión sobre el estado de un papel.
  */
  const conseguido = estadoEscrito === "conseguido";
  if (conseguido && !obtenidoEn) return { ok: false, estado: "sin-fecha-obtencion" };

  return {
    ok: true,
    valores: {
      titulo,
      de_quien: deQuien,
      donde_se_pide: opcional(datos, "donde_se_pide"),
      notas: opcional(datos, "notas"),
      estado: estadoEscrito,
      obtenido_en: conseguido ? obtenidoEn : null,
      caduca_en: caducaEn,
    },
  };
}

export async function apuntarDocumento(datos: FormData): Promise<void> {
  const campos = camposDocumento(datos);
  if (!campos.ok) volver(campos.estado);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .insert(campos.valores)
    .select("id");

  if (error) volver(motivo(error));
  // Cero filas y sin error es RLS callando: un lector no apunta documentos.
  if (!data?.length) volver("sin-permiso");

  volver("apuntado");
}

export async function editarDocumento(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const campos = camposDocumento(datos);
  if (!campos.ok) volver(campos.estado);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .update(campos.valores)
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("editado");
}

/**
 * MARCAR CONSEGUIDO EN UN TOQUE.
 *
 * Tiene su propia acción y no obliga a abrir el formulario entero, por lo mismo
 * que el embudo de proveedores: es lo que más se hace y es lo único que se hace
 * de pie, con el papel recién recogido en la mano y el móvil en la otra.
 *
 * LA FECHA VIENE DEL CAMPO Y EL CAMPO VIENE RELLENO CON EL DÍA DE HOY, que lo
 * calcula el servidor en la zona horaria de la boda. Así el caso normal es
 * pulsar y ya, y el caso de «lo recogí el jueves y lo apunto el lunes» también
 * cabe sin abrir nada. Lo que no se hace es preguntarle la fecha al navegador:
 * un reloj mal puesto apuntaría un papel recogido «mañana», y con un plazo de
 * tres meses ese día cuenta.
 *
 * NO BORRA NADA. Un papel conseguido sale de «pendientes» porque cambia de
 * grupo, no porque desaparezca: su caducidad sigue vigilándose, que es
 * justamente cuando el aviso de este módulo hace falta.
 */
export async function marcarConseguido(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const obtenidoEn = fecha(datos, "obtenido_en");
  if (obtenidoEn === undefined) volver("fecha");
  if (!obtenidoEn) volver("sin-fecha-obtencion");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .update({ estado: "conseguido", obtenido_en: obtenidoEn })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("conseguido");
}

/**
 * BORRAR PREGUNTA ANTES, SIEMPRE.
 *
 * No hay nada que cuelgue de un documento, así que la base no se va a negar:
 * el borrado sale a la primera y no hay vuelta atrás. Y lo que se pierde no es
 * una fila, es la tarde que costó averiguar en qué ventanilla se pedía ese
 * papel y hasta cuándo valía.
 *
 * Dos pasos, los dos por `POST`, y sin una línea de JavaScript: el primer envío
 * devuelve el aviso y la pantalla enseña el botón que ya trae la confirmación.
 *
 * EL AVISO VUELVE CON EL `id` DENTRO. Sin él, la pantalla sabría que hay algo
 * que confirmar pero no cuál, y tendría que pintar el botón de confirmar en
 * todas las filas — que es exactamente el sitio donde se pulsa el de al lado.
 */
export async function borrarDocumento(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  if (texto(datos, "confirmar") !== "si") volver("confirmar-borrado", { borrar: id });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("borrado");
}
