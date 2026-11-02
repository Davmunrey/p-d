"use client";

import { useEffect, useRef } from "react";

import { LINEA_DE_LA_HORA, type FaseCielo } from "@/config/cielo";

/**
 * EL CIELO DEL DÍA
 *
 * La landing es un día entero: empieza de noche, amanece con la historia,
 * pasa la tarde con la logística, cae al ocaso con lo que se ofrece y vuelve a
 * ser de noche al final. Detrás de las secciones claras hay un tinte por hora
 * —alba, tarde dorada, ocaso— y un sol que es sólo luz, un brillo de bronce
 * sin disco que sale, culmina y se pone.
 *
 * LA HORA LA PONE LA SECCIÓN QUE ESTÁ A MEDIA PANTALLA, no la posición exacta
 * del scroll: un `IntersectionObserver` mira una línea en el centro de la
 * ventana y, cuando una sección la cruza, su hora (`FASE_DE_SECCION`) pasa a
 * `data-fase`. El cambio es un fundido de CSS, igual en todos los navegadores
 * —el scroll ligado a la línea de tiempo se portaba distinto en Safari—.
 *
 * Sin JavaScript se queda en `noche`, que no pinta ningún tinte: la página
 * clara de siempre. Con movimiento reducido no se pinta (ver `motion.css`).
 * Es decoración: `aria-hidden` y sin recibir el ratón.
 */
export function CieloDelDia({ fases }: { fases: Readonly<Record<string, FaseCielo>> }) {
  const cielo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const secciones = Object.keys(fases)
      .map((id) => document.getElementById(id))
      .filter((seccion): seccion is HTMLElement => seccion !== null);

    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting && cielo.current) {
            cielo.current.dataset.fase = fases[entrada.target.id];
          }
        }
      },
      // Una línea en el centro de la ventana: la sección que la cruza manda.
      { rootMargin: LINEA_DE_LA_HORA },
    );
    secciones.forEach((seccion) => vigia.observe(seccion));
    return () => vigia.disconnect();
  }, [fases]);

  return (
    <div
      ref={cielo}
      aria-hidden
      data-cielo-del-dia
      data-fase="noche"
      className="pointer-events-none fixed inset-0 capa-cielo overflow-hidden"
    >
      <div className="cielo-capa cielo-alba luz-alba absolute inset-0" />
      <div className="cielo-capa cielo-tarde luz-tarde absolute inset-0" />
      <div className="cielo-capa cielo-ocaso luz-ocaso absolute inset-0" />
      <div className="cielo-capa cielo-sol luz-sol absolute top-0 left-0" />
    </div>
  );
}
