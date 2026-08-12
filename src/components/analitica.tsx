"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

import { POSTHOG_CLAVE, POSTHOG_SERVIDOR } from "@/config/constants";
import { noQuiereQueLeSigan } from "@/lib/observabilidad/limpiar";
import { antesDeMedir } from "@/lib/observabilidad/sentry";

/**
 * BODA-93 (#64) · LA ANALÍTICA DE LA LANDING Y DEL EMBUDO
 *
 * Qué se quiere saber, y no es más que esto: cuánta gente abre la invitación,
 * cuánta llega al formulario, y cuánta lo termina. Con esos tres números se
 * sabe si el RSVP funciona. Sin ellos, la única señal de que algo va mal es que
 * no lleguen confirmaciones — y para cuando eso se nota, la boda es la semana
 * que viene.
 *
 * TRES COSAS QUE NO HACE, y las tres a propósito:
 *
 * 1 · NO MIDE A QUIEN HA PEDIDO QUE NO LE MIDAN. Se comprueban las tres señales
 *     —`doNotTrack`, la de Microsoft y `globalPrivacyControl`— y basta con una.
 *
 * 2 · NO CAPTURA LO QUE SE ESCRIBE. `autocapture` viene encendido de serie y
 *     recoge clics y campos; en un formulario que pide nombre, correo, teléfono
 *     y alergias eso es copiar la ficha de cada invitado. Se apaga, y se apaga
 *     también la grabación de sesión.
 *
 * 3 · NO MANDA LA URL TAL CUAL. `$current_url` en el RSVP ES el token de la
 *     invitación: una analítica sin limpiar sería una lista de credenciales
 *     ordenada por hora. Todo pasa por `antesDeMedir`.
 *
 * SIN CLAVE NO ARRANCA. En local y en CI no hay ninguna, así que no sale ni una
 * petición y no hace falta desconectar nada para los tests.
 */
export function Analitica() {
  useEffect(() => {
    if (!POSTHOG_CLAVE || noQuiereQueLeSigan()) return;

    posthog.init(POSTHOG_CLAVE, {
      api_host: POSTHOG_SERVIDOR,
      // Las vistas de página se mandan a mano desde `medir`: automáticas
      // llegarían con la URL sin limpiar en el primer evento, antes de que
      // `sanitize_properties` tenga nada que decir.
      capture_pageview: false,
      autocapture: false,
      disable_session_recording: true,
      persistence: "memory",
      sanitize_properties: (propiedades) => antesDeMedir(propiedades),
    });

    medir("landing_vista");
  }, []);

  return null;
}

/**
 * Un paso del embudo.
 *
 * NO LLEVA NADA DE NADIE: sólo el nombre del paso. Se podría mandar cuánta
 * gente confirma cada grupo, o de qué invitación viene — y sería información
 * útil. También sería seguir a personas concretas en un servicio de terceros
 * para una boda de ciento veinte invitados, que no compensa. Lo que hace falta
 * saber es cuántos llegan a cada paso, y para eso basta con contar.
 *
 * ES SEGURA DE LLAMAR SIEMPRE. Sin clave, sin consentimiento o desde el
 * servidor no hace nada y no lanza: quien la llama no tiene que acordarse de
 * comprobarlo, que es como se acaba llamando sin comprobar.
 */
export function medir(paso: string): void {
  if (!POSTHOG_CLAVE || typeof window === "undefined" || noQuiereQueLeSigan()) return;

  try {
    posthog.capture(paso);
  } catch {
    // La analítica nunca puede tumbar la pantalla que está midiendo.
  }
}
