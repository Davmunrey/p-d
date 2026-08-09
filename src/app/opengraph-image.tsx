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
  // Si la base calla, sale la tarjeta con la marca y sin datos. Es mejor que
  // una tarjeta rota, y desde luego mejor que inventarse una fecha.
  const configuracion = await obtenerConfiguracion().catch(() => null);

  return construirImagenOg({
    etiqueta: t("portada.etiquetaFecha"),
    nombreNovia: configuracion?.nombreNovia ?? "",
    conjuncion: t("portada.conjuncion"),
    nombreNovio: configuracion?.nombreNovio ?? "",
    pie: configuracion ? formatoFecha.format(configuracion.fechaCeremonia) : null,
  });
}
