import type { Metadata } from "next";
import { ViewTransition } from "react";

import { VARIABLES_DE_FUENTES } from "@/fuentes/fuentes";
import { IDIOMA, IDIOMA_OG } from "@/config/constants";
import { nombresDeLaBoda } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";
import { urlDelSitio } from "@/lib/url-sitio";
import "@/styles/globals.css";

/**
 * EL TÍTULO Y LA TARJETA AL COMPARTIR, CON LOS NOMBRES DE LA BASE.
 *
 * Salían del copy, escritos a mano: si los novios corregían cómo se escriben
 * sus nombres en Ajustes, la portada cambiaba y la pestaña y la vista previa de
 * WhatsApp seguían con los de antes. Lo arregló primero la portada; pero el
 * enlace que más se comparte es el de cada invitación, y el RSVP heredaba de
 * aquí el título de la tarjeta. Los datos de la boda viven en la base (regla
 * 1), así que se leen aquí, una vez, y valen para todas las páginas.
 *
 * Si la base no contesta, un título sin nombres: un título de menos vale menos
 * que tumbar la petición.
 */
export async function generateMetadata(): Promise<Metadata> {
  const titulo = (await nombresDeLaBoda()) ?? t("meta.titulo");
  return {
    metadataBase: urlDelSitio(),
    title: titulo,
    description: t("meta.descripcion"),
    openGraph: {
      title: titulo,
      description: t("meta.descripcion"),
      type: "website",
      locale: IDIOMA_OG,
      siteName: titulo,
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={IDIOMA} className={VARIABLES_DE_FUENTES}>
      <body>
        {/* Cada cambio de página, un fundido (ver `motion.css`). */}
        <ViewTransition>{children}</ViewTransition>
      </body>
    </html>
  );
}
