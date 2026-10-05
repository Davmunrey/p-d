"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Boton } from "./boton";

/**
 * UN BOTÓN DE ENVIAR QUE NO SE PUEDE PULSAR DOS VECES, Y QUE DICE QUE ESTÁ EN ELLO
 *
 * Con JavaScript, `<form action>` no bloquea un segundo envío mientras el
 * primero está en vuelo: dos toques seguidos en un móvil con conexión lenta
 * despachaban la acción dos veces. En el RSVP eso eran dos acuses de recibo
 * idénticos y, hasta que la base dejó de admitir la misma canción dos veces,
 * la canción por duplicado en la playlist.
 *
 * Se lee el estado del formulario que lo envuelve —tiene que ir DENTRO del
 * `<form>`— y se deshabilita mientras la acción corre. Sin JavaScript el
 * botón es un botón normal: el formulario sigue funcionando exactamente igual,
 * que es el contrato del RSVP.
 *
 * APAGARSE NO BASTA. El botón se quedaba gris con el mismo rótulo y, en una
 * conexión lenta, parecía roto justo en el momento de enviar. Con
 * `rotuloPendiente`, el botón que se pulsó —y sólo ése: el formulario sabe cuál
 * fue por su `name` y `value`— dice lo que está pasando, se marca `aria-busy` y
 * conserva sus colores; los demás botones del formulario sólo se apagan.
 */
export function BotonEnvio({
  disabled,
  rotuloPendiente,
  children,
  ...resto
}: Omit<Parameters<typeof Boton>[0], "type"> & { rotuloPendiente?: ReactNode }) {
  const { pending, data } = useFormStatus();
  const bloqueado = pending || Boolean(disabled);

  const pulsado =
    pending &&
    rotuloPendiente !== undefined &&
    (resto.name === undefined || data?.get(resto.name) === resto.value);

  return (
    <Boton
      type="submit"
      disabled={bloqueado}
      aria-disabled={bloqueado || undefined}
      aria-busy={pulsado || undefined}
      {...resto}
    >
      {pulsado ? rotuloPendiente : children}
    </Boton>
  );
}
