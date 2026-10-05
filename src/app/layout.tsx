import type { Metadata } from "next";
import { Suspense } from "react";

import { Analitica } from "@/components/analitica";
import { VARIABLES_DE_FUENTES } from "@/fuentes/fuentes";
import { IDIOMA, IDIOMA_OG } from "@/config/constants";
import { t } from "@/lib/copy";
import { urlDelSitio } from "@/lib/url-sitio";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: urlDelSitio(),
  title: t("meta.titulo"),
  description: t("meta.descripcion"),
  openGraph: {
    title: t("meta.titulo"),
    description: t("meta.descripcion"),
    type: "website",
    locale: IDIOMA_OG,
    siteName: t("meta.titulo"),
  },
};

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
