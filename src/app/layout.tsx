import type { Metadata } from "next";
import { Cormorant_Garamond, Jost } from "next/font/google";

import { ATRIBUTO_TEMA, CLAVE_TEMA, IDIOMA } from "@/config/constants";
import { t } from "@/lib/copy";
import "@/styles/globals.css";

/**
 * Las fuentes se exponen como variables CSS y se consumen desde los tokens
 * primitivos (`--font-family-serif` / `--font-family-sans`). Ningún componente
 * nombra una fuente directamente.
 */
const serif = Cormorant_Garamond({
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

export const metadata: Metadata = {
  title: t("meta.titulo"),
  description: t("meta.descripcion"),
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
    <html lang={IDIOMA} className={`${serif.variable} ${sans.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: GUION_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
