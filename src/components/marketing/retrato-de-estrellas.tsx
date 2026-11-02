import type { CSSProperties } from "react";

import { TrazadoDelRetrato } from "@/components/marketing/trazado-del-retrato";
import { RETRATO_EN_EL_CIELO } from "@/config/cielo";
import type { Retrato } from "@/lib/bbdd/landing";

/**
 * EL RETRATO DE ESTRELLAS
 *
 * Paloma, Hati y David, dibujados con estrellas al final de la noche, de pie
 * sobre el horizonte: justo debajo empieza el amanecer, y el sol sale detrás
 * de ellos, como en la foto de la que sale el dibujo. La foto no se enseña;
 * se enseña su contorno, que el panel calculó al subirla (`src/lib/retrato/`).
 *
 * Las estrellas van en el orden del contorno y se encienden al bajar, como si
 * alguien lo trazara (`TrazadoDelRetrato`). Las principales —los vértices:
 * cabezas, hombros, manos, pies, la punta del rabo— son más grandes, en
 * bronce claro, con halo, y titilan despacio.
 *
 * NO ES UNA SECCIÓN, sino cielo: no tiene titular ni ancla, y no alarga la
 * página con un bloque que leer. Para quien no ve el dibujo, la figura es una
 * imagen con el texto alternativo de la foto.
 */
export function RetratoDeEstrellas({ retrato }: { retrato: Retrato }) {
  const { alto, radio, radioPrincipal, halo, brilloHalo, principal } = RETRATO_EN_EL_CIELO;
  const ancho = Math.round(alto * retrato.proporcion);
  const ultima = Math.max(1, retrato.estrellas.length - 1);

  return (
    <figure
      data-retrato=""
      role="img"
      aria-label={retrato.alternativo || undefined}
      className="relative flex h-retrato justify-center px-margen pt-pila"
    >
      <TrazadoDelRetrato>
        <svg
          aria-hidden
          viewBox={`0 0 ${ancho} ${alto}`}
          preserveAspectRatio="xMidYMax meet"
          className="block h-full w-auto max-w-full overflow-visible"
        >
          <defs>
            <radialGradient id="halo-del-retrato">
              <stop
                offset="0"
                stopColor="var(--retrato-estrella-principal)"
                stopOpacity={brilloHalo}
              />
              <stop offset="1" stopColor="var(--retrato-estrella-principal)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {retrato.estrellas.map(([x, y, brillo], i) => {
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
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radioPrincipal * halo}
                    fill="url(#halo-del-retrato)"
                  />
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
      </TrazadoDelRetrato>
    </figure>
  );
}
