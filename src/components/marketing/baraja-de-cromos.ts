"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as EventoPuntero,
  type RefObject,
} from "react";

import { BARAJA_CROMOS } from "@/config/constants";

export type Cromo = "foto" | "tarjeta";
export type Lanzamiento = "izquierda" | "derecha";

/** El atributo con el que se encuentra, dentro de cada cromo, su franja de brillo. */
export const ATRIBUTO_FRANJA = "data-franja";

/**
 * LA BARAJA DE CROMOS: la ilustración y la tarjeta, una encima de otra.
 *
 * En el móvil, una al lado de la otra no caben y una debajo de otra obligan a
 * bajar; así que salen del sobre como dos cromos en la mano: el de delante
 * derecho, el de detrás asomando girado. Se pasan:
 *
 *   · DESLIZANDO: el cromo sigue al dedo —gira según se aparta, y un brillo le
 *     cruza la cara— y, si se suelta lejos o de un golpe, sale volando por ese
 *     lado y se mete por detrás mientras el otro pasa delante. Si no, vuelve a
 *     su sitio.
 *   · TOCANDO cualquiera de los dos, o con el botón «Ver la otra tarjeta», que
 *     es también lo que alcanza el teclado.
 *
 * Que la baraja esté activa lo dice el CSS (`--modo-baraja: 1` en el móvil,
 * con foto y con JavaScript), no un punto de ruptura escrito aquí: en
 * escritorio los cromos van uno al lado del otro y arrastrarlos no hace nada.
 *
 * Durante el arrastre la posición se escribe directamente en el `transform`
 * del cromo, sin pasar por React: un render por cada píxel del dedo se nota.
 * Al soltar se borra, y la transición del CSS lo lleva a donde toque.
 */
export function useBarajaDeCromos({
  pieza,
  cromos,
  duracionVuelo,
}: {
  pieza: RefObject<HTMLElement | null>;
  cromos: Record<Cromo, RefObject<HTMLElement | null>>;
  /** Lee del CSS cuánto vuela el cromo antes de meterse por detrás (ms). */
  duracionVuelo: () => number;
}) {
  const [delante, setDelante] = useState<Cromo>("tarjeta");
  const [lanzado, setLanzado] = useState<Lanzamiento | null>(null);
  /** Ya se ha tocado la baraja: se acabaron el amago y el brillo de llegada. */
  const [barajada, setBarajada] = useState(false);
  const arrastre = useRef<{
    id: number;
    cual: Cromo;
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const soltarEnElLanzamiento = useRef(false);
  const vuelo = useRef<number | null>(null);

  const activa = useCallback(() => {
    if (!pieza.current) return false;
    return getComputedStyle(pieza.current).getPropertyValue("--modo-baraja").trim() === "1";
  }, [pieza]);

  /*
    EL CROMO LANZADO SALE DESDE DONDE LO DEJÓ EL DEDO. Se borra su posición a
    mano en el mismo pintado en que aparece `data-lanzado`, así la transición
    va del dedo a fuera, y no del centro a fuera.
  */
  useLayoutEffect(() => {
    if (!soltarEnElLanzamiento.current) return;
    soltarEnElLanzamiento.current = false;
    for (const cromo of Object.values(cromos)) {
      if (cromo.current) soltar(cromo.current);
    }
  }, [lanzado, cromos]);

  const pasar = useCallback(
    (hacia: Lanzamiento = "izquierda") => {
      if (vuelo.current !== null) return;
      const otro: Cromo = delante === "foto" ? "tarjeta" : "foto";
      setBarajada(true);
      navigator.vibrate?.(BARAJA_CROMOS.vibracionMs);

      // Con movimiento reducido no se vuela: se cambia y ya.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setDelante(otro);
        return;
      }

      setLanzado(hacia);
      vuelo.current = window.setTimeout(() => {
        vuelo.current = null;
        setDelante(otro);
        setLanzado(null);
      }, duracionVuelo());
    },
    [delante, duracionVuelo],
  );

  function alPulsar(cual: Cromo) {
    return (evento: EventoPuntero<HTMLElement>) => {
      // Un solo dedo, el botón principal, y nada mientras un cromo vuela.
      if (arrastre.current || evento.button !== 0) return;
      if (vuelo.current !== null || !activa()) return;
      const cromo = evento.currentTarget;
      cromo.setPointerCapture(evento.pointerId);
      arrastre.current = {
        id: evento.pointerId,
        cual,
        x: evento.clientX,
        y: evento.clientY,
        t: performance.now(),
      };
      setBarajada(true);
      if (cual !== delante) return;
      cromo.style.transition = "none";
      const franja = franjaDe(cromo);
      if (franja) franja.style.transition = "none";
    };
  }

  function alMover(evento: EventoPuntero<HTMLElement>) {
    const inicio = arrastre.current;
    if (!inicio || inicio.id !== evento.pointerId || inicio.cual !== delante) return;
    const cromo = evento.currentTarget;
    const dx = evento.clientX - inicio.x;
    const dy = (evento.clientY - inicio.y) * BARAJA_CROMOS.arrastreVertical;
    cromo.style.transform =
      `translate(calc(var(--centrado) + ${dx}px), calc(var(--centrado) + ${dy}px)) ` +
      `rotate(${dx * BARAJA_CROMOS.giroPorPixel}deg) scale(${BARAJA_CROMOS.escalaAlCoger})`;

    // El brillo cruza la cara según se aparta el cromo, hacia cualquier lado.
    const franja = franjaDe(cromo);
    if (franja) {
      const avance = Math.min(
        1,
        Math.abs(dx) / (cromo.offsetWidth * BARAJA_CROMOS.recorridoBrillo),
      );
      franja.style.transform = `translateX(calc((${avance * 2} - 1) * var(--recorrido-brillo-cromo)))`;
    }
  }

  function alSoltar(evento: EventoPuntero<HTMLElement>) {
    const inicio = arrastre.current;
    if (!inicio || inicio.id !== evento.pointerId) return;
    arrastre.current = null;
    const cromo = evento.currentTarget;
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    const toque = Math.hypot(dx, dy) <= BARAJA_CROMOS.toleranciaToque;

    // El de detrás sólo se toca: tocarlo lo trae delante.
    if (inicio.cual !== delante) {
      if (toque) pasar("izquierda");
      return;
    }

    // Un toque en el de delante: se pasa, como con el botón.
    if (toque) {
      soltar(cromo);
      pasar("izquierda");
      return;
    }

    const velocidad = Math.abs(dx) / Math.max(1, performance.now() - inicio.t);
    const lejos = Math.abs(dx) > cromo.offsetWidth * BARAJA_CROMOS.umbralArrastre;
    if (lejos || velocidad > BARAJA_CROMOS.umbralVelocidad) {
      soltarEnElLanzamiento.current = true;
      pasar(dx < 0 ? "izquierda" : "derecha");
      return;
    }

    // Se arrepintió: vuelve a su sitio con la transición del CSS.
    soltar(cromo);
  }

  function alCancelar(evento: EventoPuntero<HTMLElement>) {
    if (arrastre.current?.id !== evento.pointerId) return;
    arrastre.current = null;
    soltar(evento.currentTarget);
  }

  /** Lo que lleva cada cromo: si va delante o detrás, y el gesto. */
  function propiedadesDe(cual: Cromo) {
    return {
      "data-cromo": cual === delante ? "delante" : "detras",
      onPointerDown: alPulsar(cual),
      onPointerMove: alMover,
      onPointerUp: alSoltar,
      onPointerCancel: alCancelar,
    } as const;
  }

  return { delante, lanzado, barajada, pasar, propiedadesDe };
}

function franjaDe(cromo: HTMLElement) {
  return cromo.querySelector<HTMLElement>(`[${ATRIBUTO_FRANJA}]`);
}

/** Devuelve el cromo y su brillo a lo que diga el CSS. */
function soltar(cromo: HTMLElement) {
  cromo.style.transition = "";
  cromo.style.transform = "";
  const franja = franjaDe(cromo);
  if (franja) {
    franja.style.transition = "";
    franja.style.transform = "";
  }
}
