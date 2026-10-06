"use server";

import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_INVITADOS } from "@/config/constants";
import { obtenerGruposConGente } from "@/lib/bbdd/invitados";
import { decodificar, noEsTexto } from "@/lib/csv";
import {
  clavePersona,
  leerImportacion,
  textosDelFichero,
  type Contexto,
  type Lado,
  type Lectura,
} from "@/lib/importacion-invitados";
import { t } from "@/lib/copy";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { ESTADO_INICIAL, type EstadoImportacion } from "./estado";

/**
 * BODA-53 · IMPORTAR INVITADOS, EN DOS PASOS
 *
 * Primero se mira y luego se escribe, y las dos cosas usan **el mismo**
 * `leerImportacion()`. Que sea el mismo no es economía de código: es lo que
 * hace que la vista previa sea de fiar. Con dos caminos distintos —uno para
 * enseñar y otro para guardar— la pantalla acabaría prometiendo una cosa y la
 * base haciendo otra, y el fallo sólo se vería con los invitados ya dentro.
 *
 * LA ESCRITURA ES UNA SOLA LLAMADA. `importar_invitados()` mete las doscientas
 * filas en una transacción; aquí no hay bucle. Un bucle de doscientas llamadas
 * no podría cumplir el criterio del ticket —o entran todas o ninguna— porque
 * cada llamada sería su propia transacción.
 */

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * CUÁNDO DOS NOMBRES SON EL MISMO, SEGÚN LA BASE.
 *
 * Se le pregunta a `claves_de_importacion()` por todos los textos de una vez
 * en vez de imitar su criterio aquí: la imitación acertaba con las tildes y
 * fallaba con los doscientos signos más que traduce `unaccent` —«Col·lell»,
 * «Øyvind», el apóstrofo del móvil—, y cada fallo era una invitación de más o
 * una importación rechazada sin explicación.
 */
async function clavesDeLaBase(textos: string[]): Promise<(texto: string) => string> {
  const supabase = await cliente();
  const { data, error } = await supabase.rpc("claves_de_importacion", { p_textos: textos });
  if (error || !Array.isArray(data) || data.length !== textos.length) {
    throw new Error(
      `No se pudieron calcular las claves de la importación: ${error?.message ?? "respuesta inesperada"}`,
    );
  }

  const claves = new Map(textos.map((texto, posicion) => [texto, String(data[posicion])]));
  return (texto) => {
    const clave = claves.get(texto);
    if (clave === undefined) throw new Error(`Texto sin clave de importación: «${texto}»`);
    return clave;
  };
}

/**
 * Lo que hay en la base y hace falta para leer el fichero: quién está ya, de
 * qué lado es cada invitación y cómo se comparan los nombres.
 *
 * Se lee con la sesión de quien importa, así que RLS decide qué ve. Si no
 * pudiera ver a nadie, no detectaría duplicados — pero tampoco podría importar,
 * porque la función exige `puede_editar()`.
 */
async function contextoDeLaBase(contenido: string): Promise<Contexto> {
  const grupos = await obtenerGruposConGente();

  const textos = new Set(textosDelFichero(contenido));
  for (const grupo of grupos) {
    textos.add(grupo.nombre.trim());
    for (const persona of grupo.gente) {
      textos.add(persona.nombre.trim());
      textos.add((persona.apellidos ?? "").trim());
    }
  }
  const clave = await clavesDeLaBase([...textos]);

  const yaExisten = new Set<string>();
  const ladosExistentes = new Map<string, Lado>();
  for (const grupo of grupos) {
    const invitacion = clave(grupo.nombre.trim());
    if (!ladosExistentes.has(invitacion)) ladosExistentes.set(invitacion, grupo.lado);
    for (const persona of grupo.gente) {
      yaExisten.add(clavePersona(grupo.nombre, persona.nombre, persona.apellidos, clave));
    }
  }

  return { yaExisten, ladosExistentes, clave };
}

/** La vista previa de una lectura, lista para pintar o para confirmar. */
function previa(lectura: Lectura, contenido: string, serie: number): EstadoImportacion {
  return {
    fase: "previa",
    filas: lectura.filas,
    nuevas: lectura.nuevas,
    invitaciones: lectura.invitaciones,
    errores: lectura.errores,
    columnasIgnoradas: lectura.columnasIgnoradas,
    contenido,
    serie,
  };
}

/**
 * PASO 1 · Leer el fichero y enseñar qué saldría de él.
 *
 * No escribe nada. Devuelve además el contenido ya decodificado para que el
 * paso de confirmar no tenga que volver a subir el fichero: lo que se confirma
 * es exactamente lo que se ha visto, y no un segundo fichero que a lo mejor no
 * es el mismo.
 */
export async function analizarFichero(
  previo: EstadoImportacion,
  datos: FormData,
): Promise<EstadoImportacion> {
  // Cada análisis es uno más: es lo que deja distinguir el más reciente del
  // resultado de una confirmación anterior (ver `estadoVigente`).
  const serie = previo.serie + 1;
  const fichero = datos.get("fichero");

  if (!(fichero instanceof File) || fichero.size === 0) {
    return { ...ESTADO_INICIAL, serie, aviso: t("panel.importar.errorSinFichero") };
  }

  // Un .xlsx tal cual no es un CSV, y decodificarlo daba «Faltan las columnas
  // Grupo, Nombre» con cuatrocientos caracteres de basura como columnas.
  const bytes = await fichero.arrayBuffer();
  if (noEsTexto(bytes)) {
    return { ...ESTADO_INICIAL, serie, aviso: t("panel.importar.errorNoEsCsv") };
  }

  const contenido = decodificar(bytes);
  const lectura = leerImportacion(contenido, await contextoDeLaBase(contenido));

  // Sólo la cabecera, o filas en blanco: sin esto la pantalla se quedaba igual,
  // sin error, sin aviso y sin vista previa.
  if (lectura.filas.length === 0 && lectura.errores.length === 0) {
    return { ...ESTADO_INICIAL, serie, aviso: t("panel.importar.errorNadaQueImportar") };
  }

  return previa(lectura, contenido, serie);
}

/**
 * PASO 2 · Darlos de alta.
 *
 * Se vuelve a validar contra la base antes de escribir, y no por desconfiar de
 * la pantalla: entre mirar la vista previa y pulsar el botón puede haber pasado
 * cualquier cosa —la otra familia importando su parte, alguien dando de alta a
 * mano—. La comprobación definitiva está dentro de la función, donde nadie
 * puede colarse en medio; ésta es para poder contarlo en castellano.
 */
export async function importar(
  _previo: EstadoImportacion,
  datos: FormData,
): Promise<EstadoImportacion> {
  // La serie del análisis que se confirma viaja en el formulario: el resultado
  // de aquí sólo manda sobre ESE análisis, no sobre uno posterior.
  const serie = Number(datos.get("serie")) || 0;
  const contenido = String(datos.get("contenido") ?? "");
  if (contenido.trim() === "") {
    return { ...ESTADO_INICIAL, serie, aviso: t("panel.importar.errorSinFichero") };
  }

  const lectura = leerImportacion(contenido, await contextoDeLaBase(contenido));

  // NADA A MEDIAS: si sobrevivió un error, no se escribe una sola fila.
  if (lectura.errores.length > 0) return previa(lectura, contenido, serie);

  if (lectura.filas.length === 0) {
    return { ...ESTADO_INICIAL, serie, aviso: t("panel.importar.errorNadaQueImportar") };
  }

  const supabase = await cliente();
  const { error } = await supabase.rpc("importar_invitados", { p_filas: lectura.filas });

  if (error) {
    console.error("No se pudo importar:", error);
    return {
      ...previa(lectura, contenido, serie),
      aviso: error.message.includes("RSV06")
        ? t("panel.invitados.errorSinPermiso")
        : t("panel.importar.errorImportando"),
    };
  }

  /*
    Sin `revalidatePath` de `RUTA_INVITADOS`: es el destino de la redirección y
    revalidarlo se comía el `?estado=importados`, dejando la importación hecha
    y sin el aviso que dice cuántos entraron. Ver el comentario de
    `proveedores/acciones.ts`.
  */
  redirect(`${RUTA_INVITADOS}?estado=importados`);
}
