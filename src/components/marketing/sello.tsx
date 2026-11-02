import type { Ref } from "react";

import { Monograma } from "@/components/ui/monograma";
import { t } from "@/lib/copy";

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
 * ESE NOMBRE VA DENTRO, EN TEXTO OCULTO, Y NO EN `aria-label`: con
 * `aria-label`, axe 4.14 exige que lo que se ve («A & L») forme parte del
 * nombre (WCAG 2.5.3), y aquí lo visible es un monograma, no una etiqueta; la
 * etiqueta que se lee es la pista de debajo. Igual que en la cabecera.
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
      className="sello animacion-latido cursor-pointer border-0 p-0"
    >
      <Monograma
        nombreNovia={nombreNovia}
        nombreNovio={nombreNovio}
        variante="sello"
        nombreAccesible={false}
      />
      <span className="sr-only">{t("saveTheDate.abrir")}</span>
    </button>
  );
}
