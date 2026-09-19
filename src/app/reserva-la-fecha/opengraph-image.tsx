import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import { obtenerConfiguracion, obtenerSecciones } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";
import { construirImagenOg, TAMANO_OG, TIPO_OG } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = t("saveTheDate.etiqueta");
export const size = TAMANO_OG;
export const contentType = TIPO_OG;

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

/**
 * MISMO CRITERIO QUE LA PÁGINA Y QUE EL `.ics`: si la sección está apagada,
 * esto tampoco existe. Sin esta guarda quedaba una puerta trasera: la página
 * contestaba 404, el sitemap dejaba de anunciarla, el pie dejaba de enlazarla…
 * y esta URL seguía sirviendo una imagen con los nombres, la fecha y el lugar
 * de una página que se había querido retirar. Se vio en producción con un
 * `curl`: página 404, imagen 200 y cuarenta kilobytes.
 *
 * Y SI LA BASE NO CONTESTA, 503 Y NO UNA IMAGEN EN BLANCO. Antes se tragaba el
 * error y pintaba la tarjeta con los nombres vacíos, que es lo que un rastreador
 * de WhatsApp o Twitter guarda en caché durante días. Con `Retry-After`, como
 * el `.ics`: que vuelva en un minuto.
 */
export default async function ImagenReservaLaFecha() {
  let secciones;
  let configuracion;
  try {
    [secciones, configuracion] = await Promise.all([
      obtenerSecciones(),
      obtenerConfiguracion(),
    ]);
  } catch {
    return new Response(null, { status: 503, headers: { "Retry-After": "60" } });
  }

  if (!secciones.includes("reserva_la_fecha") || !configuracion) {
    return new Response(null, { status: 404 });
  }

  return construirImagenOg({
    // Aquí la etiqueta es la propia llamada: es lo que se manda meses antes.
    etiqueta: t("saveTheDate.etiqueta"),
    nombreNovia: configuracion.nombreNovia,
    conjuncion: t("portada.conjuncion"),
    nombreNovio: configuracion.nombreNovio,
    pie: formatoFecha.format(configuracion.fechaCeremonia),
  });
}
