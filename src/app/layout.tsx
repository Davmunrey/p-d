import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";

import { IDIOMA } from "@/config/constants";
import { t } from "@/lib/copy";
import "@/styles/globals.css";

/**
 * Las fuentes se exponen como variables CSS y se consumen desde los tokens
 * primitivos (`--font-family-serif` / `--font-family-sans`). Ningún componente
 * nombra una fuente directamente.
 */
const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: t("meta.titulo"),
  description: t("meta.descripcion"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={IDIOMA} className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
