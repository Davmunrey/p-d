import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
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

export default async function ImagenReservaLaFecha() {
  const configuracion = await obtenerConfiguracion().catch(() => null);

  return construirImagenOg({
    // Aquí la etiqueta es la propia llamada: es lo que se manda meses antes.
    etiqueta: t("saveTheDate.etiqueta"),
    nombreNovia: configuracion?.nombreNovia ?? "",
    conjuncion: t("portada.conjuncion"),
    nombreNovio: configuracion?.nombreNovio ?? "",
    pie: configuracion ? formatoFecha.format(configuracion.fechaCeremonia) : null,
  });
}
