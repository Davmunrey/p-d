"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { TRAZADO_DEL_RETRATO } from "@/config/cielo";

const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";
const CON_JAVASCRIPT = "(scripting: enabled)";
const ANIMACION_AL_LLEGAR = "trazar-retrato";

/**
 * EL RETRATO SE DIBUJA AL BAJAR, O AL LLEGAR SI YA SE VE
 *
 * Al bajar: pone en el contenedor `--trazado`, de 0 a 1, según lo que se ha
 * bajado por el retrato; el CSS (`motion.css`) enciende cada estrella cuando
 * el trazado llega a su sitio del contorno. Sólo crece: lo dibujado se queda
 * dibujado, y en cuanto está entero se deja de escuchar el scroll.
 *
 * AL LLEGAR: sin foto de portada, el retrato asoma ya en la primera pantalla.
 * Atado al scroll se quedaba a medio trazar hasta que alguien bajara, que es
 * justo lo que no tiene que parecer: algo que no ha terminado de cargar. Por
 * eso, con JavaScript, el CSS lo arranca a oscuras y lo traza entero él solo
 * en cuanto acaba de entrar la portada. Este componente sólo decide, con la
 * primera medida, si deja que siga (`llegando`, y `entero` al acabar) o si el
 * retrato está todavía por debajo de la pantalla y se lo pasa al scroll
 * (`data-al-bajar`, que quita la animación).
 *
 * Del servidor sale entero (`--trazado: 1` y `entero`): sin JavaScript se ve
 * así. Con movimiento reducido no se toca: está ahí desde el principio, quieto.
 */
export function TrazadoDelRetrato({ children }: { children: ReactNode }) {
  const referencia = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caja = referencia.current;
    if (!caja || window.matchMedia(SIN_MOVIMIENTO).matches) return;

    const { empieza, acaba } = TRAZADO_DEL_RETRATO;

    // Ya a la vista (o ya pasado, al recargar abajo): lo traza el CSS, entero.
    if (caja.getBoundingClientRect().top < window.innerHeight * empieza) {
      // Un navegador que no sabe preguntar por `scripting` no lo anima: entero.
      if (!window.matchMedia(CON_JAVASCRIPT).matches) return;
      caja.dataset.trazado = "llegando";
      const alAcabar = (evento: AnimationEvent) => {
        if (evento.target === caja && evento.animationName === ANIMACION_AL_LLEGAR) {
          caja.dataset.trazado = "entero";
        }
      };
      caja.addEventListener("animationend", alAcabar);
      return () => caja.removeEventListener("animationend", alAcabar);
    }

    let pedido = 0;
    let trazado = 0;

    const medir = () => {
      pedido = 0;
      const { top, height } = caja.getBoundingClientRect();
      const pantalla = window.innerHeight;
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

    caja.dataset.alBajar = "";
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
