import { RADIO_VUESTRA_ESTRELLA } from "@/config/cielo";

/** Lado del lienzo: proporciones en un cuadrado de 100. */
const LIENZO = 100;

/**
 * VUESTRA ESTRELLA: la que falta en el cielo del final.
 *
 * Hueca, en bronce, entre todas las demás, y late: una onda sale de ella y se
 * apaga al crecer, cada pocos segundos (`latido-estrella`, que se para con movimiento
 * reducido). Es la de los invitados, que confirman por WhatsApp; no se
 * enciende en ninguna parte de la web, porque la respuesta llega por el chat.
 *
 * Es decoración: la frase que la acompaña dice lo mismo con palabras.
 */
export function VuestraEstrella({ className = "" }: { className?: string }) {
  const centro = LIENZO / 2;
  return (
    <svg
      aria-hidden
      data-vuestra-estrella="falta"
      viewBox={`0 0 ${LIENZO} ${LIENZO}`}
      className={`block overflow-visible ${className}`}
      fill="none"
    >
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
    </svg>
  );
}
