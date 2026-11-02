import { Constelacion } from "@/components/ui/constelacion";
import { CONSTELACION_NOVIOS, GROSOR_ANILLO, RADIO_ANILLO } from "@/config/constelaciones";

/** El centro del anillo, en porcentaje del lado. */
const CENTRO = "50%";

/**
 * LA CONSTELACIÓN DE LA PORTADA, mientras no haya foto.
 *
 * La entrega parte la portada en dos y pone una foto a la derecha. Sin foto, la
 * portada se quedaba en una columna centrada: honesta, pero quieta, y con la
 * mitad de una pantalla grande vacía. Aquí va el único elemento ilustrativo
 * del sistema de marca —la Lira de los novios, «dentro de círculo con aire,
 * nunca recortada», como dice la regla 3— y se DIBUJA al llegar: el anillo se
 * cierra, Vega se enciende primero, luego las demás, y los trazos las unen.
 * Detrás, el cielo claro del Save the Date deriva despacio dentro del círculo.
 *
 * SÓLO CUANDO CABEN DOS COLUMNAS. En un móvil la portada apilada ya llena la
 * pantalla, y la constelación empujaría «Confirmar asistencia» fuera de ella:
 * ahí no se pinta, y la columna de texto sigue sola como antes.
 *
 * Con la foto publicada, la foto ocupa este sitio y esto no se monta.
 *
 * Es decoración: `aria-hidden` entero. Con movimiento reducido aparece ya
 * dibujada, sin deriva ni titileo.
 */
export function ConstelacionPortada() {
  return (
    <div
      aria-hidden
      data-constelacion-portada
      className="hidden items-center justify-center px-portada-lado md:flex"
    >
      <div className="animacion-paralaje-portada relative size-constelacion-portada">
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="animacion-cielo-claro cielo-claro pointer-events-none absolute -inset-sangrado-cielo" />
        </div>

        {/*
          Girado un cuarto de vuelta para que el anillo empiece a cerrarse por
          arriba, a las doce, y no a las tres. Sin `viewBox` a propósito: con
          él, un trazo de un píxel necesitaría `vector-effect`, y éste mide
          los guiones en pantalla y rompe el dibujo en dos arcos.
        */}
        <svg className="absolute inset-0 h-full w-full -rotate-90 overflow-visible" fill="none">
          <circle
            cx={CENTRO}
            cy={CENTRO}
            r={RADIO_ANILLO}
            pathLength={1}
            className="anillo-dibujado stroke-borde-fuerte"
            strokeWidth={GROSOR_ANILLO}
          />
        </svg>

        <div className="absolute inset-aire-constelacion">
          <Constelacion clave={CONSTELACION_NOVIOS} animada />
        </div>
      </div>
    </div>
  );
}
