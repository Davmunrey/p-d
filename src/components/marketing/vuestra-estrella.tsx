import { CONTORNO_ESTRELLA } from "@/components/marketing/estrella-de-cuatro-puntas";
import { ESTRELLA_LLEGADA, RADIO_VUESTRA_ESTRELLA } from "@/config/cielo";

/** Lado del lienzo: proporciones en un cuadrado de 100. */
const LIENZO = 100;

/**
 * VUESTRA ESTRELLA: la que falta en el cielo, al final de la página.
 *
 * Mientras no se ha confirmado, es HUECA, en bronce, y late: una onda sale de
 * ella y se apaga al crecer, cada pocos segundos (`latido-estrella`, que se
 * para con movimiento reducido). Es el botón de la confirmación: tocarla
 * despliega el formulario.
 *
 * Cuando el grupo ha confirmado que viene alguien, se ENCIENDE: la misma
 * estrella de cuatro puntas de la historia y del mapa, llena, con su halo.
 *
 * Es decoración (`aria-hidden`): lo que hace lo dice el texto que la acompaña.
 */
export function VuestraEstrella({
  encendida = false,
  className = "",
}: {
  encendida?: boolean;
  className?: string;
}) {
  const centro = LIENZO / 2;
  return (
    <svg
      aria-hidden
      data-vuestra-estrella={encendida ? "encendida" : "falta"}
      viewBox={`0 0 ${LIENZO} ${LIENZO}`}
      className={`block overflow-visible text-acento ${className}`}
      fill="none"
    >
      {encendida ? (
        <>
          <defs>
            <radialGradient id="halo-de-vuestra-estrella">
              <stop
                offset="0"
                stopColor="currentColor"
                stopOpacity={ESTRELLA_LLEGADA.brilloHalo}
              />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle
            cx={centro}
            cy={centro}
            r={ESTRELLA_LLEGADA.halo}
            fill="url(#halo-de-vuestra-estrella)"
          />
          <polygon points={CONTORNO_ESTRELLA} fill="currentColor" />
        </>
      ) : (
        <>
          {/* La onda: sale del anillo y se apaga al crecer. */}
          <circle
            cx={centro}
            cy={centro}
            r={RADIO_VUESTRA_ESTRELLA.anillo}
            className="latido-estrella stroke-acento"
            strokeWidth={RADIO_VUESTRA_ESTRELLA.onda}
          />
          <circle
            cx={centro}
            cy={centro}
            r={RADIO_VUESTRA_ESTRELLA.anillo}
            className="stroke-acento"
            strokeWidth={RADIO_VUESTRA_ESTRELLA.grosor}
          />
        </>
      )}
    </svg>
  );
}
