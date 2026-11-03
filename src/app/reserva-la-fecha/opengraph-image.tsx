import { BUCKET_MEDIOS } from "@/config/constants";
import { obtenerConfiguracion, obtenerMedios, obtenerSecciones } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";
import {
  construirImagenOg,
  construirImagenOgConFoto,
  fotoParaOg,
  FORMATO_FECHA_OG,
  TAMANO_OG,
  TIPO_OG,
} from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = t("saveTheDate.etiqueta");
export const size = TAMANO_OG;
export const contentType = TIPO_OG;

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
  let fotos;
  try {
    [secciones, configuracion, fotos] = await Promise.all([
      obtenerSecciones(),
      obtenerConfiguracion(),
      obtenerMedios("reserva_la_fecha"),
    ]);
  } catch {
    return new Response(null, { status: 503, headers: { "Retry-After": "60" } });
  }

  if (!secciones.includes("reserva_la_fecha") || !configuracion) {
    return new Response(null, { status: 404 });
  }

  /*
    CON LA ILUSTRACIÓN, SI LA HAY. La primera foto publicada de la sección del
    Save the Date —la misma que sale del sobre— es lo primero que ve quien
    recibe el enlace. Si no llega o no se puede pintar, la tarjeta de siempre.
  */
  const primera = fotos.find((medio) => medio.tipo === "imagen");
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const foto =
    primera && urlBase
      ? await fotoParaOg(
          `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${primera.ruta}`,
          primera.ancho,
          primera.alto,
        )
      : null;
  if (foto) return construirImagenOgConFoto(foto);

  return construirImagenOg({
    // Aquí la etiqueta es la propia llamada: es lo que se manda meses antes.
    etiqueta: t("saveTheDate.etiqueta"),
    nombreNovia: configuracion.nombreNovia,
    conjuncion: t("portada.conjuncion"),
    nombreNovio: configuracion.nombreNovio,
    pie: FORMATO_FECHA_OG.format(configuracion.fechaCeremonia),
  });
}
