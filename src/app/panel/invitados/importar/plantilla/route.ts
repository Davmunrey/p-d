import { NextResponse, type NextRequest } from "next/server";

import { RUTA_ACCESO } from "@/config/constants";
import { t } from "@/lib/copy";
import { plantillaDeImportacion } from "@/lib/importacion-invitados";
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

  const csv = plantillaDeImportacion();

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
