import { NextResponse, type NextRequest } from "next/server";

import { RUTA_ACCESO } from "@/config/constants";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

/**
 * BODA-53 · LA PLANTILLA DE EJEMPLO
 *
 * Una hoja con las columnas puestas y una fila de muestra. Es lo que evita la
 * primera importación fallida: sin ella, quien rellena la hoja tiene que
 * adivinar cómo se llaman las columnas y en qué orden van.
 *
 * SE GENERA, NO SE GUARDA EN `/public`. Los rótulos son los mismos que usa la
 * pantalla y salen del mismo sitio, así que el día que uno cambie, la plantilla
 * cambia con él. Un fichero estático se quedaría con los rótulos viejos y nadie
 * se enteraría hasta que una importación fallara por una columna que ya no se
 * llama así.
 */
export const dynamic = "force-dynamic";

export async function GET(peticion: NextRequest) {
  const acceso = await accesoActual();
  if (!acceso) return NextResponse.redirect(new URL(RUTA_ACCESO, peticion.url));

  const columnas = [
    t("panel.importar.columna.grupo"),
    t("panel.importar.columna.nombre"),
    t("panel.importar.columna.apellidos"),
    t("panel.importar.columna.lado"),
    t("panel.importar.columna.nino"),
  ];

  /*
    La fila de muestra lleva acento y ñ a propósito: es la comprobación de que
    la codificación sobrevive al viaje de ida y vuelta por Excel. Si alguien
    abre la plantilla y ve «ZubeldÃ­a», el problema está en su Excel y no en su
    lista, y es mucho mejor descubrirlo aquí que con doscientos apellidos rotos.
  */
  const muestra = [
    t("panel.importar.muestraGrupo"),
    t("panel.importar.muestraNombre"),
    t("panel.importar.muestraApellidos"),
    t("panel.invitados.lados.novia"),
    t("panel.invitados.no"),
  ];

  const celda = (valor: string) => `"${valor.replaceAll('"', '""')}"`;
  const csv = [columnas, muestra].map((fila) => fila.map(celda).join(";")).join("\r\n");

  // El BOM y el `;`, por lo mismo que en la exportación: es lo que espera Excel
  // en configuración regional española, y sin el BOM abre los acentos rotos.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${t("panel.importar.nombreFicheroPlantilla")}"`,
      "cache-control": "no-store",
    },
  });
}
