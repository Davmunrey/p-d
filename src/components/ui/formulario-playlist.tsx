"use client";

import { useActionState } from "react";

import { anadirCancion } from "@/app/acciones-playlist";
import { ESTADO_INICIAL } from "@/app/estado-playlist";
import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { LIMITE_TEXTO_CANCION } from "@/config/constants";
import { t } from "@/lib/copy";

/**
 * BODA-27 · EL CAMPO PARA APUNTAR UNA CANCIÓN
 *
 * FUNCIONA SIN JAVASCRIPT, y no es un adorno: es un `<form>` con una acción de
 * servidor, así que sin JavaScript el navegador manda el formulario de toda la
 * vida y la canción se apunta igual. Quien abre esto es un invitado desde el
 * móvil, en el pueblo, con cobertura de dos rayas — el escenario donde el
 * JavaScript tarda o no llega. Con JavaScript encima no recarga la página y
 * confirma en el sitio.
 *
 * EL TOKEN NO ESTÁ AQUÍ. Ni en un campo oculto ni en ninguna parte del HTML:
 * la acción lo saca de la cookie que dejó el enlace de invitación. Un token en
 * la portada sería un token en el código fuente de una página pública.
 *
 * EL AVISO ES UN `role="alert"`, que es lo que hace que un lector de pantalla
 * lo anuncie sin que haya que ir a buscarlo. Vale igual para el «apuntada» que
 * para el error: quien no ve la pantalla necesita saber las dos cosas.
 */
export function FormularioPlaylist() {
  const [estado, enviar, enviando] = useActionState(anadirCancion, ESTADO_INICIAL);

  return (
    <form action={enviar} className="mx-auto mt-elemento grid max-w-texto gap-interno">
      <CampoTexto
        /*
          La `key` cambia en cada envío para que el campo se monte de nuevo y
          coja el `defaultValue` de este estado: vacío si la canción entró, lo
          escrito si no. Sin esto, apuntada la canción el texto se quedaba
          puesto y el botón invitaba a mandarla otra vez.
        */
        key={estado.sello}
        etiqueta={t("playlist.campoCancion")}
        ayuda={t("playlist.campoAyuda")}
        error={estado.fase === "fallo" ? (estado.aviso ?? undefined) : undefined}
        name="cancion"
        type="text"
        defaultValue={estado.texto}
        required
        maxLength={LIMITE_TEXTO_CANCION}
        autoComplete="off"
        enterKeyHint="done"
      />

      <div className="flex flex-wrap items-center justify-center gap-interno">
        <Boton type="submit" jerarquia="secundario" disabled={enviando}>
          {enviando ? t("playlist.anadiendo") : t("playlist.anadir")}
        </Boton>

        {estado.fase === "apuntada" ? (
          <p role="status" className="text-pequeno text-tinta-suave">
            {t("playlist.anadida")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
