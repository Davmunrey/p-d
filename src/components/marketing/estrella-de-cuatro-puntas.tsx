import { ESTRELLA_LLEGADA } from "@/config/cielo";

/** Lado del lienzo del dibujo: proporciones en un cuadrado de 100. */
const LIENZO = 100;
const CENTRO = LIENZO / 2;

/**
 * El contorno: ocho vértices alternando punta y cintura cada 45°, empezando
 * por la de arriba. Se calcula una vez; es geometría, no dato.
 */
export const CONTORNO_ESTRELLA = Array.from({ length: 8 }, (_, i) => {
  const angulo = -Math.PI / 2 + (i * Math.PI) / 4;
  const radio = i % 2 === 0 ? ESTRELLA_LLEGADA.radio : ESTRELLA_LLEGADA.cintura;
  const x = CENTRO + radio * Math.cos(angulo);
  const y = CENTRO + radio * Math.sin(angulo);
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}).join(" ");

/**
 * UNA ESTRELLA DE CUATRO PUNTAS, la de los mapas antiguos para marcar un
 * sitio. La usan los hitos de «nuestra historia» —una por momento— y la
 * estrella que baja al lugar al final de la página: es la misma estrella, de
 * principio a fin.
 *
 * `halo` le pone alrededor un brillo que se apaga hacia fuera. El color es el
 * del texto (`currentColor`): quien la usa decide de qué tono es con una clase.
 * Es decoración: `aria-hidden` siempre.
 */
export function EstrellaDeCuatroPuntas({
  halo = false,
  className = "",
  idHalo,
}: {
  halo?: boolean;
  className?: string;
  /** El id del degradado del halo: único por página si hay más de una con halo. */
  idHalo?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${LIENZO} ${LIENZO}`}
      className={`block overflow-visible ${className}`}
    >
      {halo && idHalo ? (
        <>
          <defs>
            <radialGradient id={idHalo}>
              <stop
                offset="0"
                stopColor="currentColor"
                stopOpacity={ESTRELLA_LLEGADA.brilloHalo}
              />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={CENTRO} cy={CENTRO} r={ESTRELLA_LLEGADA.halo} fill={`url(#${idHalo})`} />
        </>
      ) : null}
      <polygon points={CONTORNO_ESTRELLA} fill="currentColor" />
    </svg>
  );
}
