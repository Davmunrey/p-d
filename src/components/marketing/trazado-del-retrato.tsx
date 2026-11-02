"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { TRAZADO_DEL_RETRATO } from "@/config/cielo";

const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

/**
 * EL RETRATO SE DIBUJA AL BAJAR
 *
 * Pone en el contenedor `--trazado`, de 0 a 1, según lo que se ha bajado por
 * el retrato; el CSS (`motion.css`) enciende cada estrella cuando el trazado
 * llega a su sitio del contorno. Sólo crece: lo dibujado se queda dibujado,
 * y en cuanto está entero se deja de escuchar el scroll.
 *
 * Del servidor sale entero (`--trazado: 1` por defecto). Con movimiento
 * reducido no se toca: el retrato está ahí desde el principio, quieto. Y si
 * la página se abre ya por debajo —al recargar abajo del todo—, la primera
 * medida lo da por dibujado.
 */
export function TrazadoDelRetrato({ children }: { children: ReactNode }) {
  const referencia = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caja = referencia.current;
    if (!caja || window.matchMedia(SIN_MOVIMIENTO).matches) return;

    let pedido = 0;
    let trazado = 0;

    const medir = () => {
      pedido = 0;
      const { top, height } = caja.getBoundingClientRect();
      const pantalla = window.innerHeight;
      const { empieza, acaba } = TRAZADO_DEL_RETRATO;
      const avance = (pantalla * empieza - top) / (height + pantalla * (empieza - acaba));
      trazado = Math.max(trazado, Math.min(1, Math.max(0, avance)));
      caja.style.setProperty("--trazado", trazado.toFixed(3));
      caja.dataset.trazado = trazado >= 1 ? "entero" : "dibujando";
      if (trazado >= 1) dejar();
    };
    const alBajar = () => {
      if (!pedido) pedido = window.requestAnimationFrame(medir);
    };
    function dejar() {
      window.removeEventListener("scroll", alBajar);
      window.removeEventListener("resize", alBajar);
      if (pedido) window.cancelAnimationFrame(pedido);
    }

    window.addEventListener("scroll", alBajar, { passive: true });
    window.addEventListener("resize", alBajar);
    medir();
    return dejar;
  }, []);

  return (
    <div ref={referencia} data-trazado="entero" className="trazado-del-retrato h-full">
      {children}
    </div>
  );
}
