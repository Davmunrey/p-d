import { NextResponse, type NextRequest } from "next/server";

import { RUTA_ACCESO, ZONA_HORARIA } from "@/config/constants";
import { obtenerGruposConGente } from "@/lib/bbdd/invitados";
import { esEstadoFiltro, filtrarGrupos, type EstadoFiltro } from "@/lib/filtro-invitados";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

/**
 * BODA-54 · EXPORTAR LA LISTA DE INVITADOS
 *
 * El catering, la finca y quien imprima las minutas van a pedir la lista, y
 * cada uno la quiere de una manera. Se descarga en CSV, con las columnas que se
 * elijan y **con lo que haya filtrado en pantalla** — no la tabla entera.
 *
 * Eso último no se consigue solo: el filtro vive en `lib/filtro-invitados.ts` y
 * lo usan la pantalla y esta ruta. Si cada una tuviera el suyo, el día que
 * alguien afinara el de la pantalla el fichero seguiría exportando otra cosa, y
 * nadie se enteraría hasta que el catering contara mal.
 *
 * VA COMO RUTA Y NO COMO SERVER ACTION porque el resultado es un fichero, no
 * una pantalla: hace falta controlar las cabeceras para que el navegador lo
 * descargue con su nombre en lugar de pintarlo.
 */
export const dynamic = "force-dynamic";

/** Las columnas que se pueden pedir, con el rótulo que va en la cabecera. */
const COLUMNAS = {
  grupo: "panel.invitados.columnaNombreGrupo",
  lado: "panel.invitados.columnaLado",
  nombre: "panel.invitados.columnaNombre",
  apellidos: "panel.invitados.columnaApellidos",
  nino: "panel.invitados.columnaEsNino",
  respuesta: "panel.invitados.columnaRespuesta",
  menu: "panel.invitados.columnaMenu",
  alergias: "panel.invitados.columnaAlergias",
} as const;

type Columna = keyof typeof COLUMNAS;

const TODAS = Object.keys(COLUMNAS) as Columna[];

const formatoFechaFichero = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ZONA_HORARIA,
});

/**
 * Una celda de CSV.
 *
 * Se entrecomilla SIEMPRE, no sólo cuando hay comas. Un campo de alergias
 * lleva comas, saltos de línea y comillas con total naturalidad —«Celíaca, y
 * alérgica a los frutos secos»— y decidir campo a campo es justo donde se
 * cuela el fichero que Excel abre partido por la mitad.
 */
function celda(valor: string | null | undefined): string {
  return `"${String(valor ?? "").replaceAll('"', '""')}"`;
}

export async function GET(peticion: NextRequest) {
  const acceso = await accesoActual();
  // Un fichero con los datos de ciento veinte personas no se sirve a quien
  // acierte la URL. La protección de verdad es RLS —sin sesión las consultas
  // devuelven cero filas— pero aquí se corta antes y sin dar detalles.
  if (!acceso) return NextResponse.redirect(new URL(RUTA_ACCESO, peticion.url));

  const parametros = peticion.nextUrl.searchParams;
  const busqueda = parametros.get("buscar") ?? "";
  const estadoBruto = parametros.get("estado_filtro") ?? "todos";
  const estado: EstadoFiltro = esEstadoFiltro(estadoBruto) ? estadoBruto : "todos";

  // Sin selección se llevan todas: quien no elige, quiere el listado completo.
  const pedidas = parametros.getAll("columna").filter((c): c is Columna => c in COLUMNAS);
  const columnas = pedidas.length > 0 ? pedidas : TODAS;

  const grupos = await obtenerGruposConGente();
  const visibles = filtrarGrupos(grupos, { busqueda, estado });

  const filas: string[][] = [columnas.map((columna) => t(COLUMNAS[columna]))];

  for (const grupo of visibles) {
    for (const persona of grupo.gente) {
      filas.push(
        columnas.map((columna) => {
          switch (columna) {
            case "grupo":
              return grupo.nombre;
            case "lado":
              return t(`panel.invitados.lados.${grupo.lado}` as "panel.invitados.lados.ambos");
            case "nombre":
              return persona.nombre;
            case "apellidos":
              return persona.apellidos ?? "";
            case "nino":
              return persona.esNino ? t("panel.invitados.si") : t("panel.invitados.no");
            case "respuesta":
              return persona.estado === "confirmado"
                ? t("rsvp.vieneSi")
                : persona.estado === "rechazado"
                  ? t("rsvp.vieneNo")
                  : t("panel.invitados.pendienteRespuesta");
            case "menu":
              // Sólo de quien viene. El menú de quien no viene no es un dato
              // para la cocina: es ruido que acabaría contándose.
              return persona.estado === "confirmado"
                ? t(`rsvp.menus.${persona.tipoMenu}` as "rsvp.menus.estandar")
                : "";
            case "alergias":
              return persona.alergias ?? "";
          }
        }),
      );
    }
  }

  const csv = filas.map((fila) => fila.map(celda).join(";")).join("\r\n");

  const fecha = formatoFechaFichero.format(new Date());
  const nombre = t("panel.invitados.nombreFichero", { fecha });

  /*
    EL BOM, Y NO ES OPCIONAL.

    Excel en Windows abre un CSV sin BOM como si fuera de su página de códigos
    local, y «Zubeldía» se convierte en «ZubeldÃ­a». Quien recibe el fichero es
    el catering, y va a abrirlo con Excel: sin estos tres bytes, la mitad de
    los apellidos españoles llegan rotos.

    El separador es `;` por lo mismo: es el que espera Excel en configuración
    regional española, donde la coma es el separador decimal.
  */
  const cuerpo = `﻿${csv}`;

  return new NextResponse(cuerpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre}"`,
      // Los datos de los invitados no se guardan en ninguna caché intermedia.
      "cache-control": "no-store",
    },
  });
}
