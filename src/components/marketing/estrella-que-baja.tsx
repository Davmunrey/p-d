"use client";

import { useEffect, useRef } from "react";

import { EstrellaDeCuatroPuntas } from "@/components/marketing/estrella-de-cuatro-puntas";
import { ESTRELLA_LLEGADA, LINEA_DE_LLEGADA, RADIO_VUESTRA_ESTRELLA } from "@/config/cielo";

/** Lado del lienzo de la onda: proporciones en un cuadrado de 100. */
const LIENZO = 100;

const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

/**
 * LA ESTRELLA QUE BAJA AL LUGAR
 *
 * La última escena de la página: sobre el mapa del final, una estrella cae
 * desde arriba hasta el sitio de la boda, se posa, late y deja ver el nombre
 * del lugar. Es la misma estrella de cuatro puntas de los hitos de la
 * historia: la noche acaba en el sitio donde va a pasar todo.
 *
 * SÓLO SE ESCONDE PARA CAER. Del servidor sale posada; al llegar al
 * navegador, si hay movimiento y el mapa todavía no se ve, sube arriba
 * (`data-llegada="arriba"`) a esperar, y baja (`"bajando"`) cuando el sitio
 * entra en la pantalla. Si la página se abre ya con el mapa a la vista —al
 * recargar abajo del todo—, se queda donde está. El cambio es una transición
 * de CSS (`motion.css`); aquí sólo se pone el atributo, sin estado de React.
 *
 * Es decoración: el sitio, con su nombre y su dirección, se lee en la tarjeta
 * de «cómo llegar». `aria-hidden`.
 */
export function EstrellaQueBaja({ rotulo }: { rotulo: string | null }) {
  const referencia = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const estrella = referencia.current;
    if (!estrella || window.matchMedia(SIN_MOVIMIENTO).matches) return;
    // Ya a la vista al llegar: se queda posada, no se repite la escena.
    if (estrella.getBoundingClientRect().top < window.innerHeight) return;

    estrella.dataset.llegada = "arriba";
    const vigia = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        estrella.dataset.llegada = "bajando";
        vigia.disconnect();
      },
      { rootMargin: LINEA_DE_LLEGADA },
    );
    vigia.observe(estrella);
    return () => vigia.disconnect();
  }, []);

  return (
    <div
      ref={referencia}
      aria-hidden
      data-estrella-llegada=""
      data-llegada="posada"
      className="absolute top-0 left-0"
    >
      <div className="estrella-que-baja absolute size-estrella-llegada -translate-x-1/2 -translate-y-1/2 text-acento">
        {/* La onda del latido, la misma de vuestra estrella. */}
        <svg
          viewBox={`0 0 ${LIENZO} ${LIENZO}`}
          className="absolute inset-0 block size-full overflow-visible"
        >
          <circle
            cx={LIENZO / 2}
            cy={LIENZO / 2}
            r={ESTRELLA_LLEGADA.radio}
            fill="none"
            className="latido-estrella stroke-acento"
            strokeWidth={RADIO_VUESTRA_ESTRELLA.onda}
          />
        </svg>
        <EstrellaDeCuatroPuntas halo idHalo="halo-de-la-llegada" className="size-full" />
      </div>
      {/*
        EL NOMBRE DEL SITIO, COMO EN UN PLANO: un rótulo sobre una placa clara
        para que se lea encima de cualquier calle. No es una etiqueta de
        estado, y por eso no tiene su forma de píldora.
      */}
      {rotulo ? (
        <p className="rotulo-de-llegada bajo-la-estrella absolute left-0 -translate-x-1/2 rounded-tarjeta bg-superficie-cabecera px-interno py-interno-compacto text-etiqueta whitespace-nowrap uppercase tracking-etiqueta text-tinta-marca shadow-sutil">
          {rotulo}
        </p>
      ) : null}
    </div>
  );
}
