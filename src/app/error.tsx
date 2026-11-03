"use client";

import { useEffect, useState } from "react";

import { PantallaEstado } from "@/components/marketing/pantalla-estado";
import { Boton, BotonEnlace } from "@/components/ui/boton";
import { RUTA_RETRATO_DE_ESTRELLAS } from "@/config/constants";
import { t } from "@/lib/copy";
import { comoRetrato, type RetratoDeEstrellas } from "@/lib/retrato/estrellas";

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
 * EL RETRATO SE PIDE APARTE. Esta pantalla la pinta el navegador y no puede
 * preguntar a la base, así que pide las estrellas a `RUTA_RETRATO_DE_ESTRELLAS`
 * y las dibuja cuando llegan. Si no llegan —no hay retrato, o lo que ha fallado
 * es justo la base—, la pantalla se queda sin dibujo y sin decir nada más.
 *
 * NO SE ENSEÑA `error.message`: puede llevar dentro una consulta o un dato de
 * otra persona. Va al registro del servidor.
 */
export default function ErrorPublico({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [retrato, setRetrato] = useState<RetratoDeEstrellas | null>(null);

  useEffect(() => {
    console.error("Fallo en una página pública:", error);
  }, [error]);

  useEffect(() => {
    const cancelar = new AbortController();
    fetch(RUTA_RETRATO_DE_ESTRELLAS, { signal: cancelar.signal })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : null))
      .then((datos: unknown) => setRetrato(comoRetrato(datos)))
      .catch(() => {});
    return () => cancelar.abort();
  }, []);

  return (
    <PantallaEstado
      alerta
      titulo={t("errores.falloTitulo")}
      texto={t("errores.falloTexto")}
      retrato={retrato}
    >
      <Boton type="button" onClick={() => retry()}>
        {t("errores.reintentar")}
      </Boton>
      <BotonEnlace href="/" jerarquia="secundario">
        {t("errores.volverAlInicio")}
      </BotonEnlace>
    </PantallaEstado>
  );
}
