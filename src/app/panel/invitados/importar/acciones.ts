"use server";

import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_INVITADOS } from "@/config/constants";
import { obtenerGruposConGente } from "@/lib/bbdd/invitados";
import { decodificar } from "@/lib/csv";
import { clavePersona, leerImportacion, type FilaImportada } from "@/lib/importacion-invitados";
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
 * Todo lo que ya está dado de alta, en forma de clave de duplicado.
 *
 * Se lee con la sesión de quien importa, así que RLS decide qué ve. Si no
 * pudiera ver a nadie, no detectaría duplicados — pero tampoco podría importar,
 * porque la función exige `puede_editar()`.
 */
async function personasExistentes(): Promise<Set<string>> {
  const grupos = await obtenerGruposConGente();
  const claves = new Set<string>();
  for (const grupo of grupos) {
    for (const persona of grupo.gente) {
      claves.add(clavePersona(grupo.nombre, persona.nombre, persona.apellidos));
    }
  }
  return claves;
}

/** Los nombres de grupo del fichero que todavía no existen en la base. */
function gruposPorCrear(filas: FilaImportada[], existentes: string[]): string[] {
  const yaHay = new Set(existentes.map((nombre) => nombre.trim().toLowerCase()));
  const nuevos: string[] = [];
  for (const fila of filas) {
    const clave = fila.grupo.trim().toLowerCase();
    if (!yaHay.has(clave)) {
      yaHay.add(clave);
      nuevos.push(fila.grupo);
    }
  }
  return nuevos;
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
  _previo: EstadoImportacion,
  datos: FormData,
): Promise<EstadoImportacion> {
  const fichero = datos.get("fichero");

  if (!(fichero instanceof File) || fichero.size === 0) {
    return { ...ESTADO_INICIAL, aviso: t("panel.importar.errorSinFichero") };
  }

  const contenido = decodificar(await fichero.arrayBuffer());

  const grupos = await obtenerGruposConGente();
  const existentes = new Set<string>();
  for (const grupo of grupos) {
    for (const persona of grupo.gente) {
      existentes.add(clavePersona(grupo.nombre, persona.nombre, persona.apellidos));
    }
  }

  const lectura = leerImportacion(contenido, existentes);

  return {
    fase: "previa",
    filas: lectura.filas,
    errores: lectura.errores,
    columnasIgnoradas: lectura.columnasIgnoradas,
    gruposNuevos: gruposPorCrear(
      lectura.filas,
      grupos.map((grupo) => grupo.nombre),
    ),
    contenido,
  };
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
  const contenido = String(datos.get("contenido") ?? "");
  if (contenido.trim() === "") {
    return { ...ESTADO_INICIAL, aviso: t("panel.importar.errorSinFichero") };
  }

  const lectura = leerImportacion(contenido, await personasExistentes());

  // NADA A MEDIAS: si sobrevivió un error, no se escribe una sola fila.
  if (lectura.errores.length > 0) {
    const grupos = await obtenerGruposConGente();
    return {
      fase: "previa",
      filas: lectura.filas,
      errores: lectura.errores,
      columnasIgnoradas: lectura.columnasIgnoradas,
      gruposNuevos: gruposPorCrear(
        lectura.filas,
        grupos.map((grupo) => grupo.nombre),
      ),
      contenido,
    };
  }

  if (lectura.filas.length === 0) {
    return { ...ESTADO_INICIAL, aviso: t("panel.importar.errorNadaQueImportar") };
  }

  const supabase = await cliente();
  const { error } = await supabase.rpc("importar_invitados", { p_filas: lectura.filas });

  if (error) {
    console.error("No se pudo importar:", error);
    return {
      fase: "previa",
      filas: lectura.filas,
      errores: [],
      columnasIgnoradas: lectura.columnasIgnoradas,
      gruposNuevos: [],
      contenido,
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
