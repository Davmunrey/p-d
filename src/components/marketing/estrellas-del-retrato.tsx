import type { CSSProperties } from "react";

import type { Retrato } from "@/lib/bbdd/landing";

/** Las medidas del dibujo, en el lienzo de `alto` de alto (ver `config/cielo.ts`). */
export interface MedidasDelRetrato {
  alto: number;
  radio: number;
  radioPrincipal: number;
  /** El halo de las principales, en veces su radio; con `brilloHalo` 0 no hay. */
  halo: number;
  brilloHalo: number;
  principal: number;
  /** Cuántas estrellas pintar como mucho; sin él, todas. */
  maximo?: number;
}

/**
 * Las estrellas que se pintan: todas las principales y, de las demás, una de
 * cada `paso`, repartidas a lo largo del contorno. Cada una conserva su sitio
 * en el orden del dibujo, que es lo que decide cuándo se enciende.
 */
export function estrellasAPintar(
  estrellas: Retrato["estrellas"],
  principal: number,
  maximo?: number,
): { estrella: Retrato["estrellas"][number]; i: number }[] {
  const todas = estrellas.map((estrella, i) => ({ estrella, i }));
  if (!maximo || estrellas.length <= maximo) return todas;
  const principales = estrellas.filter(([, , brillo]) => brillo >= principal).length;
  const comunes = estrellas.length - principales;
  const paso = Math.max(1, Math.ceil(comunes / Math.max(1, maximo - principales)));
  let comun = 0;
  return todas.filter(({ estrella: [, , brillo] }) => {
    if (brillo >= principal) return true;
    return comun++ % paso === 0;
  });
}

/**
 * LAS ESTRELLAS DEL RETRATO, SIN MÁS
 *
 * El dibujo de Paloma, Hati y David que sale del contorno de su foto: una
 * estrella por punto, en el orden del contorno, y las principales —cabezas,
 * hombros, manos, pies, la punta del rabo— más grandes, con halo y titilando.
 * Lo comparten el cielo de la landing (`RetratoDeEstrellas`) y el Save the Date
 * (la solapa del sobre y la tarjeta); cada uno decide su tamaño, sus colores
 * —los tokens `--retrato-estrella*` del sitio donde se pinta— y cuándo se
 * enciende, a través de `--trazado` en un contenedor.
 *
 * `idHalo` es el `id` del degradado del halo. Va por fuera porque una misma
 * página puede llevar dos retratos —el sobre lleva uno en la solapa y otro en
 * la tarjeta— y dos degradados con el mismo `id` se pisan.
 */
export function EstrellasDelRetrato({
  retrato,
  medidas,
  idHalo,
  encuadre = "xMidYMax meet",
  className,
}: {
  retrato: Pick<Retrato, "proporcion" | "estrellas">;
  medidas: MedidasDelRetrato;
  idHalo: string;
  encuadre?: string;
  className?: string;
}) {
  const { alto, radio, radioPrincipal, halo, brilloHalo, principal, maximo } = medidas;
  const ancho = Math.round(alto * retrato.proporcion);
  const ultima = Math.max(1, retrato.estrellas.length - 1);
  const conHalo = brilloHalo > 0 && halo > 1;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${ancho} ${alto}`}
      preserveAspectRatio={encuadre}
      className={className}
    >
      {conHalo ? (
        <defs>
          <radialGradient id={idHalo}>
            <stop
              offset="0"
              stopColor="var(--retrato-estrella-principal)"
              stopOpacity={brilloHalo}
            />
            <stop offset="1" stopColor="var(--retrato-estrella-principal)" stopOpacity="0" />
          </radialGradient>
        </defs>
      ) : null}
      {estrellasAPintar(retrato.estrellas, principal, maximo).map(({ estrella, i }) => {
        const [x, y, brillo] = estrella;
        const estilo = { "--orden": i / ultima, "--brillo": brillo } as CSSProperties;
        const cx = x * ancho;
        const cy = y * alto;
        if (brillo < principal) {
          return (
            <circle
              key={i}
              className="estrella-del-retrato"
              style={estilo}
              cx={cx}
              cy={cy}
              r={radio}
              fill="var(--retrato-estrella)"
            />
          );
        }
        return (
          <g key={i} className="titila-en-el-retrato" style={estilo}>
            <g className="estrella-del-retrato" data-principal="">
              {conHalo ? (
                <circle cx={cx} cy={cy} r={radioPrincipal * halo} fill={`url(#${idHalo})`} />
              ) : null}
              <circle
                cx={cx}
                cy={cy}
                r={radioPrincipal}
                fill="var(--retrato-estrella-principal)"
              />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
