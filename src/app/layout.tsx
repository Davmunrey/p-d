import type { Metadata } from "next";
import localFont from "next/font/local";

import { Analitica } from "@/components/analitica";
import { IDIOMA } from "@/config/constants";
import { t } from "@/lib/copy";
import { urlDelSitio } from "@/lib/url-sitio";
import "@/styles/globals.css";

/**
 * LAS FUENTES VIVEN EN EL REPOSITORIO, NO EN GOOGLE.
 *
 * Son las mismas tres de la entrega del estudio —Cormorant Infant, Jost e
 * Italianno—, pero servidas desde `src/fuentes` con `next/font/local` en vez de
 * descargadas en cada compilación. Tres motivos, por orden de importancia:
 *
 *   · EL DISEÑO DE ESTA WEB *ES* LA TIPOGRAFÍA, y con `next/font/google` la
 *     compilación se cae si Google no contesta. Ya pasó en CI: el mismo commit
 *     compiló en un trabajo y falló en otro con «Can't resolve
 *     @vercel/turbopack-next/internal/font/google/font». Una dependencia de red
 *     en el arranque convierte un despliegue en una tirada de dados.
 *   · NADIE LE CUENTA A GOOGLE QUIÉN ABRE LA INVITACIÓN. Es el mismo criterio
 *     por el que el mapa es OpenStreetMap y no Google Maps.
 *   · Un salto de red menos antes del primer texto, que es lo único que hay que
 *     leer en un móvil con cobertura de pueblo.
 *
 * Los ficheros son los `.woff2` del subconjunto **latin**, que es el que cubre
 * el castellano entero —tildes, eñes, comillas angulares y guiones largos
 * incluidos—. Cormorant y Jost son fuentes variables: un solo fichero por
 * estilo cubre todo el rango de pesos, así que esto pesa MENOS que los ocho
 * ficheros estáticos que servía Google.
 *
 * Se exponen como variables CSS y se consumen desde los tokens primitivos
 * (`--font-family-serif` / `--font-family-sans`). Ningún componente nombra una
 * fuente directamente.
 */
const serif = localFont({
  src: [
    { path: "../fuentes/cormorant-infant-latin.woff2", weight: "300 600", style: "normal" },
    {
      path: "../fuentes/cormorant-infant-latin-italica.woff2",
      weight: "300 600",
      style: "italic",
    },
  ],
  variable: "--font-serif",
  display: "swap",
  // Contra qué fuente del sistema se ajustan las métricas mientras la nuestra
  // carga. Una serif se sustituye por una serif: con Arial, el titular de la
  // portada daría un salto de tamaño al cambiar.
  adjustFontFallback: "Times New Roman",
});

const sans = localFont({
  src: [{ path: "../fuentes/jost-latin.woff2", weight: "300 500", style: "normal" }],
  variable: "--font-sans",
  display: "swap",
  adjustFontFallback: "Arial",
});

/**
 * El conector «y» y el ampersand, y nada más. Una sola letra por pieza, así
 * que un peso basta y no compensa cargar más.
 */
const conector = localFont({
  src: [{ path: "../fuentes/italianno-latin.woff2", weight: "400", style: "normal" }],
  variable: "--font-conector",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  metadataBase: urlDelSitio(),
  title: t("meta.titulo"),
  description: t("meta.descripcion"),
  openGraph: {
    title: t("meta.titulo"),
    description: t("meta.descripcion"),
    type: "website",
    locale: IDIOMA,
    siteName: t("meta.titulo"),
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={IDIOMA} className={`${serif.variable} ${sans.variable} ${conector.variable}`}>
      <body>
        {children}
        {/*
          LA ANALÍTICA VA AQUÍ Y NO EN LA LANDING, aunque sólo mida la landing y
          el embudo: es el único sitio que envuelve también al RSVP, que es la
          mitad que importa. No pinta nada —devuelve `null`— y sin clave ni
          consentimiento no arranca siquiera.
        */}
        <Analitica />
      </body>
    </html>
  );
}
