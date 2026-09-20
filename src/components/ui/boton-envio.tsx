"use client";

import { useFormStatus } from "react-dom";

import { Boton } from "./boton";

/**
 * UN BOTÓN DE ENVIAR QUE NO SE PUEDE PULSAR DOS VECES
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
 */
export function BotonEnvio({ disabled, ...resto }: Omit<Parameters<typeof Boton>[0], "type">) {
  const { pending } = useFormStatus();
  const bloqueado = pending || Boolean(disabled);

  return (
    <Boton
      type="submit"
      disabled={bloqueado}
      aria-disabled={bloqueado || undefined}
      {...resto}
    />
  );
}
