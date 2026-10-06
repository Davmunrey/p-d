import type { Metadata } from "next";
import { Suspense } from "react";

import { Analitica } from "@/components/analitica";
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
        {children}
        {/*
          LA ANALÍTICA VA AQUÍ Y NO EN LA LANDING, aunque sólo mida la landing y
          el embudo: es el único sitio que envuelve también al RSVP, que es la
          mitad que importa. No pinta nada —devuelve `null`— y sin clave ni
          consentimiento no arranca siquiera.
        */}
        {/* `Suspense` porque lee la consulta de la URL: sin él, Next no puede
            dejar estática ninguna página que cuelgue de este layout. */}
        <Suspense fallback={null}>
          <Analitica />
        </Suspense>
      </body>
    </html>
  );
}
