import { EstrellasDelRetrato } from "@/components/marketing/estrellas-del-retrato";
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
 * bronce claro, con halo, y titilan despacio. El dibujo en sí lo pone
 * `EstrellasDelRetrato`, que es el mismo del Save the Date.
 *
 * NO ES UNA SECCIÓN, sino cielo: no tiene titular ni ancla, y no alarga la
 * página con un bloque que leer. Para quien no ve el dibujo, la figura es una
 * imagen con el texto alternativo de la foto.
 */
export function RetratoDeEstrellas({ retrato }: { retrato: Retrato }) {
  return (
    <figure
      data-retrato=""
      role="img"
      aria-label={retrato.alternativo || undefined}
      className="relative flex h-retrato justify-center px-margen pt-pila"
    >
      <TrazadoDelRetrato>
        <EstrellasDelRetrato
          retrato={retrato}
          medidas={RETRATO_EN_EL_CIELO}
          idHalo="halo-del-retrato"
          className="block h-full w-auto max-w-full overflow-visible"
        />
      </TrazadoDelRetrato>
    </figure>
  );
}
