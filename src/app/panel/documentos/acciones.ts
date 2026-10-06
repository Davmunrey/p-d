"use server";

import { redirect } from "next/navigation";

import { LARGOS_DE_CAMPO, RUTA_ACCESO, RUTA_DOCUMENTOS } from "@/config/constants";
import {
  ESTADO_INICIAL_DOCUMENTO,
  esEstadoDocumento,
  esTitularDocumento,
} from "@/lib/bbdd/documentos";
import { ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import {
  ANCLA_ALTA_DOCUMENTO,
  anclaDeDocumento,
  DESDE_EL_ALTA,
  type EstadoDocumentos,
} from "./estado";

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
function volver(
  estado: EstadoDocumentos,
  extra?: Record<string, string>,
  /** El sitio de la pantalla al que se vuelve, y donde se pinta el aviso. */
  ancla?: string,
): never {
  const parametros = new URLSearchParams({ estado, ...extra });
  redirect(`${RUTA_DOCUMENTOS}?${parametros.toString()}${ancla ? `#${ancla}` : ""}`);
}

/**
 * VOLVER AL PAPEL QUE SE TOCÓ, con su aviso al lado. Toda acción volvía al
 * principio: «Ya lo tenemos» o «Borrar» en el último de la lista obligaban a
 * bajar a buscarlo para ver qué había pasado o para confirmar.
 */
function alDocumento(
  estado: EstadoDocumentos,
  id: string,
  extra?: Record<string, string>,
): never {
  volver(estado, { documento: id, ...extra }, anclaDeDocumento(id));
}

/** Cero filas: o no podéis, o el papel ya no está —y entonces no hay fila—. */
async function ceroFilas(): Promise<never> {
  volver((await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "no-existe");
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
  // El calendario lo pone la base (ver `fecha`): un 31 de febrero vuelve como
  // 22008, y eso es «esa fecha no existe», no una avería.
  if (error.code === "22008" || error.code === "22007") return "fecha";

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
  // El mismo tope que el `maxLength` de la pantalla: si un día la migración
  // lo sube, la pantalla dejaba escribir 200 y esto seguía rechazando a 160.
  if (titulo.length < 2 || titulo.length > LARGOS_DE_CAMPO["documentos_boda.titulo"]) {
    return { ok: false, estado: "titulo" };
  }

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
  // Los errores del alta vuelven al alta, que está al final de la pantalla.
  const alAlta: (estado: EstadoDocumentos) => never = (estado) =>
    volver(estado, DESDE_EL_ALTA, ANCLA_ALTA_DOCUMENTO);

  const campos = camposDocumento(datos);
  if (!campos.ok) alAlta(campos.estado);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .insert(campos.valores)
    .select("id");

  if (error) alAlta(motivo(error));
  // Cero filas y sin error es RLS callando: un lector no apunta documentos.
  if (!data?.length) alAlta("sin-permiso");

  alDocumento("apuntado", data[0]!.id as string);
}

export async function editarDocumento(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  // Los errores vuelven con la edición abierta: es donde están los campos.
  const campos = camposDocumento(datos);
  if (!campos.ok) alDocumento(campos.estado, id, { editar: id });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .update(campos.valores)
    .eq("id", id)
    .select("id");

  if (error) alDocumento(motivo(error), id, { editar: id });
  if (!data?.length) await ceroFilas();

  alDocumento("editado", id);
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
  if (obtenidoEn === undefined) alDocumento("fecha", id);
  if (!obtenidoEn) alDocumento("sin-fecha-obtencion", id);

  /*
    Y SU CADUCIDAD, QUE ES LO QUE SE LEE EN EL PAPEL RECIÉN RECOGIDO. El atajo
    sólo pedía la fecha de obtención: un empadronamiento que vale tres meses
    quedaba «No caduca», y el aviso verde aseguraba que nada caducaba antes de
    la boda. El campo llega con la caducidad que hubiera, así que renovar un
    papel deja corregir la vieja; vacío es que no caduca.
  */
  const caducaEn = fecha(datos, "caduca_en");
  if (caducaEn === undefined) alDocumento("fecha", id);

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .update({ estado: "conseguido", obtenido_en: obtenidoEn, caduca_en: caducaEn })
    .eq("id", id)
    .select("id");

  if (error) alDocumento(motivo(error), id);
  if (!data?.length) await ceroFilas();

  alDocumento("conseguido", id);
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

  // La pregunta va al papel, junto al botón que la contesta.
  if (texto(datos, "confirmar") !== "si") {
    volver("confirmar-borrado", { borrar: id }, anclaDeDocumento(id));
  }

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("documentos_boda")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) alDocumento(motivo(error), id);
  if (!data?.length) await ceroFilas();

  volver("borrado");
}
