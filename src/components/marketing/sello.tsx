import type { Ref } from "react";

import { Conector } from "@/components/ui/tipografia";
import { t } from "@/lib/copy";
import { inicial } from "@/lib/nombres";

/**
 * EL SELLO DEL SOBRE
 *
 * Un botón redondo con el monograma, como el lacre de un sobre de verdad: es
 * lo único que se puede tocar en la pieza cerrada, y late a propósito para que
 * se sepa. El «&» va en la letra del conector —a través de `Conector`, que es
 * el único sitio que puede nombrarla— porque es un ampersand, y esa letra es
 * para el conector y el ampersand y nada más.
 *
 * ES UN `<button type="submit">` Y NO UN `<div>` CON `onClick`: el sobre se
 * abre mandando un formulario, así que sin JavaScript —o antes de que llegue—
 * la pulsación sigue haciendo algo. El nombre accesible es «Abrir la
 * invitación»; las iniciales son decoración para quien escucha.
 *
 * El aspecto vive en `sobre.css`: el degradado, el latido y el crecimiento al
 * pasar el ratón son capa de componente y no caben en una utilidad.
 */
export function Sello({
  nombreNovia,
  nombreNovio,
  ref,
}: {
  nombreNovia: string;
  nombreNovio: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="submit"
      aria-label={t("saveTheDate.abrir")}
      className="sello animacion-latido cursor-pointer border-0 p-0"
    >
      <span
        aria-hidden="true"
        className="font-titulo text-sello leading-compacto text-tinta-sello"
      >
        {inicial(nombreNovia)}
        <Conector tamano="sello">{t("navegacion.monogramaConector")}</Conector>
        {inicial(nombreNovio)}
      </span>
    </button>
  );
}
