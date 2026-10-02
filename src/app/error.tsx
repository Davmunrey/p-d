"use client";

import { useEffect } from "react";

import { Boton, BotonEnlace } from "@/components/ui/boton";
import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { t } from "@/lib/copy";

/**
 * EL FALLO, FUERA DEL PANEL
 *
 * No existía. El panel tenía su `error.tsx`; la parte pública no, así que un
 * fallo en la portada, en la reserva o en una acción del RSVP subía hasta la
 * página de error de serie de Next: en inglés, sin la marca, y en la pantalla
 * donde un invitado tiene menos ganas de adivinar qué ha pasado.
 *
 * DOS SALIDAS: probar otra vez —`retry`, que vuelve a pedir la página al
 * servidor, no sólo a pintarla— y la portada, que funciona aunque no haya
 * cargado el JavaScript. Y la tranquilidad que más se pregunta: lo que ya
 * estuviera confirmado sigue guardado, porque un fallo al pintar no borra nada
 * de la base.
 *
 * NO SE ENSEÑA `error.message`: puede llevar dentro una consulta o un dato de
 * otra persona. Va al registro (y a Sentry, si está puesto).
 */
export default function ErrorPublico({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Fallo en una página pública:", error);
  }, [error]);

  return (
    <main
      role="alert"
      className="mx-auto grid min-h-dvh max-w-texto place-items-center px-interno text-center"
    >
      <div>
        <Titulo2 como="h1">{t("errores.falloTitulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("errores.falloTexto")}</Cuerpo>
        <div className="mt-bloque flex flex-wrap justify-center gap-interno">
          <Boton type="button" onClick={() => retry()}>
            {t("errores.reintentar")}
          </Boton>
          <BotonEnlace href="/" jerarquia="secundario">
            {t("errores.volverAlInicio")}
          </BotonEnlace>
        </div>
      </div>
    </main>
  );
}
