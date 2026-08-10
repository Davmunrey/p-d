import type { Metadata } from "next";
import { Cormorant_Infant, Italianno, Jost } from "next/font/google";

import { ATRIBUTO_TEMA, CLAVE_TEMA, IDIOMA } from "@/config/constants";
import { t } from "@/lib/copy";
import { urlDelSitio } from "@/lib/url-sitio";
import "@/styles/globals.css";

/**
 * Las fuentes se exponen como variables CSS y se consumen desde los tokens
 * primitivos (`--font-family-serif` / `--font-family-sans`). Ningún componente
 * nombra una fuente directamente.
 */
const serif = Cormorant_Infant({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Jost({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * El conector «y» y el ampersand, y nada más. Una sola letra por pieza, así
 * que un peso basta y no compensa cargar más.
 */
const conector = Italianno({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-conector",
  display: "swap",
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

/**
 * Aplica el tema guardado ANTES del primer pintado.
 *
 * Sin esto, la página se pinta en claro y salta a oscuro al hidratarse: un
 * fogonazo blanco en la cara de quien navega de noche.
 */
const GUION_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});if(t==="claro"||t==="oscuro")document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_TEMA)},t)}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={IDIOMA} className={`${serif.variable} ${sans.variable} ${conector.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: GUION_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
