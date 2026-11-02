import type { CSSProperties } from "react";

import {
  ANCHO_LIENZO_NOCHE,
  CONSTELACION_NOVIOS,
  constelacionPorClave,
  ESCALA_HALO,
  GROSOR_TRAZO,
  UNION_CON_VUESTRA_ESTRELLA,
  VUESTRA_ESTRELLA,
} from "@/config/constelaciones";

/** Alto del lienzo: la Lira ocupa su cuadrado de 100 a la izquierda. */
const LIENZO = 100;

/** El turno de cada pieza del dibujo, en una variable que lee el CSS. */
function turno(orden: number): CSSProperties {
  return { "--orden": orden } as CSSProperties;
}

/**
 * LA LIRA Y VUESTRA ESTRELLA
 *
 * El final de la historia. La landing ha contado el día de la mañana a la
 * noche y ha dibujado la Lira de los novios; al llegar al RSVP, a su lado
 * espera una estrella más: la de los invitados.
 *
 * - `falta` (la landing): la estrella está hueca y late, y el trazo que la
 *   une a la Lira es discontinuo. Con `alLlegar`, la Lira se dibuja cuando se
 *   llega a la noche del final (`lira-que-llega`, ligada al scroll).
 * - `encendida` (las gracias del RSVP, si alguien viene): la estrella se
 *   enciende en bronce con un destello y el trazo se dibuja entero.
 *
 * Es decoración y va `aria-hidden`: lo que significa —que falta la respuesta,
 * o que ya está— lo dicen las frases de al lado. No lleva colores: lee los
 * semánticos de la constelación y del acento, que el bloque inverso reasigna.
 */
export function LiraConVuestraEstrella({
  estado,
  alLlegar = false,
}: {
  estado: "falta" | "encendida";
  alLlegar?: boolean;
}) {
  const lira = constelacionPorClave(CONSTELACION_NOVIOS);
  if (!lira) return null;

  const [vx, vy, vr] = VUESTRA_ESTRELLA;
  const [ux, uy] = lira.estrellas[UNION_CON_VUESTRA_ESTRELLA];
  const encendida = estado === "encendida";

  return (
    <svg
      aria-hidden
      data-vuestra-estrella={estado}
      viewBox={`0 0 ${ANCHO_LIENZO_NOCHE} ${LIENZO}`}
      className={`block h-auto w-full overflow-visible ${alLlegar ? "lira-que-llega" : ""}`}
      fill="none"
    >
      {lira.lineas.map(([desde, hasta], orden) => {
        const [x1, y1] = lira.estrellas[desde];
        const [x2, y2] = lira.estrellas[hasta];
        return (
          <line
            key={`${desde}-${hasta}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            pathLength={1}
            className="trazo-lira stroke-constelacion-trazo"
            strokeWidth={GROSOR_TRAZO}
            strokeLinecap="round"
            style={turno(orden)}
          />
        );
      })}

      {/* El trazo que une la Lira con vuestra estrella: entero si ya está. */}
      <line
        x1={ux}
        y1={uy}
        x2={vx}
        y2={vy}
        pathLength={encendida ? 1 : undefined}
        className={`stroke-acento ${encendida ? "trazo-que-se-une" : "trazo-pendiente"}`}
        strokeWidth={GROSOR_TRAZO}
        strokeLinecap="round"
      />

      {lira.estrellas.map(([x, y, radio], orden) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={radio}
          className="estrella-lira fill-constelacion-estrella"
          style={turno(orden)}
        />
      ))}

      {encendida ? (
        <>
          <circle
            cx={vx}
            cy={vy}
            r={vr * ESCALA_HALO}
            className="halo-que-se-enciende fill-acento"
          />
          <circle cx={vx} cy={vy} r={vr} className="estrella-que-se-enciende fill-acento" />
        </>
      ) : (
        <>
          <circle cx={vx} cy={vy} r={vr} className="latido-estrella fill-acento" />
          <circle cx={vx} cy={vy} r={vr} className="stroke-acento" strokeWidth={GROSOR_TRAZO} />
        </>
      )}
    </svg>
  );
}
