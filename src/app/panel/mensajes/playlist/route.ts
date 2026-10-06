import { NextResponse, type NextRequest } from "next/server";

import { RUTA_ACCESO, ZONA_HORARIA } from "@/config/constants";
import { obtenerCancionesTodas } from "@/lib/bbdd/mensajes";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

/**
 * BODA-113 · LA LISTA FINAL, PARA EL DJ
 *
 * Lo último que pedía el ticket y lo único que de verdad sale del panel: el
 * DJ no entra aquí, recibe un fichero. Va en texto plano, una canción por
 * línea, porque es lo que se pega en cualquier programa o se lee en el móvil
 * sin abrir nada más.
 *
 * SÓLO LO QUE SE VE EN LA WEB. Una canción oculta se ocultó por algo, y que
 * acabara sonando porque el fichero no lo sabía sería deshacer la moderación
 * por la puerta de atrás. Y EN EL ORDEN EN QUE LLEGARON: la pantalla enseña lo
 * último primero, que es lo que se modera; el DJ quiere la lista, no las
 * novedades.
 *
 * Como la exportación de invitados, es una ruta y no una acción porque lo que
 * devuelve es un fichero, y pide sesión antes de nada.
 */
export const dynamic = "force-dynamic";

const formatoFechaFichero = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ZONA_HORARIA,
});

export async function GET(peticion: NextRequest) {
  const acceso = await accesoActual();
  if (!acceso) return NextResponse.redirect(new URL(RUTA_ACCESO, peticion.url));

  const canciones = (await obtenerCancionesTodas())
    .filter((cancion) => cancion.aprobada)
    .sort((a, b) => a.pedidaEn.getTime() - b.pedidaEn.getTime());

  const cuerpo = canciones.map((cancion) => cancion.texto).join("\r\n");
  const nombre = t("panel.mensajes.nombreFicheroPlaylist", {
    fecha: formatoFechaFichero.format(new Date()),
  });

  return new NextResponse(cuerpo, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "no-store",
    },
  });
}
