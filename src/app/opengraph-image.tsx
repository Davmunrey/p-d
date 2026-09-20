import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";
import { construirImagenOg, TAMANO_OG, TIPO_OG } from "@/lib/og";

/** La imagen lleva la fecha de la boda: se genera al vuelo, nunca se cachea. */
export const dynamic = "force-dynamic";

export const alt = t("meta.titulo");
export const size = TAMANO_OG;
export const contentType = TIPO_OG;

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

export default async function ImagenAbierta() {
  /*
    SI LA BASE NO CONTESTA, 503 Y NO UNA TARJETA EN BLANCO. Aquí se tragaba el
    error y se pintaba la tarjeta con los nombres vacíos, «mejor que una rota»;
    pero esta es la imagen que WhatsApp, Twitter o Telegram piden la primera
    vez que alguien pega el enlace de la web, y la guardan DÍAS. Cuarenta
    invitados que reciban el enlace en el minuto de una caída verían para
    siempre una vista previa sin nombres. Con `Retry-After`, que vuelvan en un
    minuto; es lo mismo que ya hacían el `.ics` y la imagen de la reserva.

    `null` de verdad —todavía no hay configuración— sí pinta la tarjeta sin
    datos: es lo que hay, no una avería.
  */
  let configuracion;
  try {
    configuracion = await obtenerConfiguracion();
  } catch {
    return new Response(null, { status: 503, headers: { "Retry-After": "60" } });
  }

  return construirImagenOg({
    etiqueta: t("portada.etiquetaFecha"),
    nombreNovia: configuracion?.nombreNovia ?? "",
    conjuncion: t("portada.conjuncion"),
    nombreNovio: configuracion?.nombreNovio ?? "",
    pie: configuracion ? formatoFecha.format(configuracion.fechaCeremonia) : null,
  });
}
