"use client";

import { useSyncExternalStore } from "react";

/**
 * BODA-28 · UN VÍDEO DE FONDO QUE SE SABE PRESCINDIBLE
 *
 * EMPIEZA SIENDO EL PÓSTER Y SÓLO SE CONVIERTE EN VÍDEO SI PROCEDE. El servidor
 * pinta el fotograma quieto; ya en el navegador, esto pregunta si se puede mover
 * y sólo entonces monta el `<video>`. De ahí salen tres cosas gratis:
 *
 *   · Sin JavaScript se ve el póster. La sección no depende de que el navegador
 *     ejecute nada.
 *   · Con `prefers-reduced-motion: reduce` se queda el póster, que es lo
 *     correcto: un bucle aéreo de fondo es exactamente lo que marea a quien
 *     activa esa preferencia.
 *   · Los cerca de ochocientos kilos del vídeo no se descargan para quien no va
 *     a verlo moverse. No es una optimización de manual: la invitación se abre
 *     desde datos móviles, muchas veces en el pueblo de la boda.
 *
 * `useSyncExternalStore` Y NO UN EFECTO QUE LLAMA A `setState`. La preferencia
 * de movimiento es estado que vive FUERA de React y puede cambiar sola —el
 * sistema operativo la mueve—, que es exactamente para lo que existe esta
 * primitiva. De regalo trae la instantánea del servidor: sin ella, React pinta
 * el vídeo en el HTML y lo quita al hidratar, y eso son dos pintados y un
 * parpadeo para quien pidió justo lo contrario.
 */

/**
 * La preferencia, leída del navegador. Fuera del componente porque
 * `useSyncExternalStore` compara la instantánea por identidad: una función
 * nueva en cada render la haría recalcular sin parar.
 */
const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

function suscribirse(alCambiar: () => void): () => void {
  const consulta = window.matchMedia(SIN_MOVIMIENTO);
  consulta.addEventListener("change", alCambiar);
  return () => consulta.removeEventListener("change", alCambiar);
}

const hayMovimiento = () => !window.matchMedia(SIN_MOVIMIENTO).matches;

/*
  EN EL SERVIDOR SE ASUME QUE NO. No se puede saber la preferencia de alguien
  que todavía no ha pedido la página, y de las dos suposiciones posibles sólo
  una es segura: quedarse quieto. Además es lo que hace que sin JavaScript se
  vea el póster.
*/
const enElServidor = () => false;

export function VideoDeFondo({
  fuente,
  poster,
  textoAlternativo,
  className = "",
}: {
  fuente: string;
  poster: string;
  textoAlternativo: string;
  className?: string;
}) {
  const conMovimiento = useSyncExternalStore(suscribirse, hayMovimiento, enElServidor);

  if (!conMovimiento) {
    /*
      El póster como imagen normal y con su alternativa: aquí no es un
      marcador de posición, es el contenido definitivo para esta persona.
      `<img>` y no `next/image` a propósito — es el mismo fichero que sirve de
      `poster` del vídeo, y pasarlo por el optimizador daría dos URL distintas
      para la misma imagen y dos descargas para quien cambie de una a otra.
    */
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt={textoAlternativo} className={className} />;
  }

  return (
    <video
      // `muted` no es una preferencia: sin él ningún navegador deja arrancar
      // solo. Y con sonido tampoco lo querríamos — esto es un fondo.
      muted
      autoPlay
      loop
      playsInline
      // Sin controles y fuera del recorrido de teclado: no es un reproductor,
      // es el fondo de la sección. Un `<video>` enfocable que no lleva a ningún
      // sitio es una parada de más para quien navega tabulando.
      tabIndex={-1}
      poster={poster}
      /*
        `aria-hidden` porque lo que cuenta la sección lo dice su titular, que
        está encima y es texto de verdad. Anunciar además «vídeo» no aporta
        nada y obliga a esquivarlo.
      */
      aria-hidden="true"
      className={className}
    >
      <source src={fuente} type="video/mp4" />
    </video>
  );
}
