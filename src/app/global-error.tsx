"use client";

import "@/styles/globals.css";

import Link from "next/link";
import { useEffect } from "react";

import { IDIOMA } from "@/config/constants";
import { VARIABLES_DE_FUENTES } from "@/fuentes/fuentes";
import { t } from "@/lib/copy";

/**
 * EL ÚLTIMO RECURSO: CUANDO FALLA EL PROPIO MARCO DE LA WEB
 *
 * Sustituye al layout raíz, así que trae su propio `<html>`, sus estilos y su
 * título. Sin este fichero, Next servía el suyo: «This page couldn’t load»,
 * en inglés y sin marca.
 *
 * Sin componentes de la interfaz a propósito: si lo que ha fallado es algo de
 * lo que dependen, esta pantalla también caería. HTML llano con los tokens del
 * sistema, y una de las dos salidas es un enlace, que funciona aunque el
 * JavaScript no haya llegado a cargar.
 */
export default function ErrorGlobal({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Fallo en el marco de la web:", error);
  }, [error]);

  return (
    <html lang={IDIOMA} className={VARIABLES_DE_FUENTES}>
      <body>
        <title>{t("errores.falloTitulo")}</title>
        <main
          role="alert"
          className="mx-auto grid min-h-dvh max-w-texto place-items-center px-margen text-center"
        >
          <div>
            <h1 className="font-titulo text-titulo-2 text-tinta">{t("errores.falloTitulo")}</h1>
            <p className="mt-pila text-cuerpo text-tinta-suave">{t("errores.falloTexto")}</p>
            <p className="mt-bloque flex flex-wrap justify-center gap-interno">
              <button
                type="button"
                onClick={() => retry()}
                className="min-h-control rounded-boton bg-accion px-elemento text-boton uppercase tracking-boton text-tinta-sobre-accion"
              >
                {t("errores.reintentar")}
              </button>
              <Link
                href="/"
                className="inline-flex min-h-control items-center rounded-boton border border-borde-fuerte px-elemento text-boton uppercase tracking-boton text-tinta"
              >
                {t("errores.volverAlInicio")}
              </Link>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
