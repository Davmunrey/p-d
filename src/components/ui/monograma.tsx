import { Conector } from "@/components/ui/tipografia";
import { t } from "@/lib/copy";
import { inicial } from "@/lib/nombres";

/**
 * EL MONOGRAMA
 *
 * Las dos iniciales con el nexo en medio: la marca de la boda. Estaba escrito
 * tres veces —en la barra, en el pie y en el sello del sobre—, las tres con el
 * mismo `inicial(...) + conector + inicial(...)` y las tres con un tamaño y un
 * color distintos. Tres copias de un logo acaban discrepando en el detalle que
 * nadie mira, y un logo que discrepa consigo mismo no es un logo.
 *
 * EL NEXO SALE DEL COPY, no del código. La entrega usa «&» en el logotipo y
 * «y» en la portada, y son dos decisiones tipográficas distintas que alguien
 * puede querer cambiar sin tocar un componente.
 *
 * QUIEN ESCUCHA LA PÁGINA OYE LOS NOMBRES, no las letras. «P & D» leído de una
 * en una no es nada; por eso las iniciales van `aria-hidden` y al lado va el
 * nombre entero para el lector de pantalla. Cuando el monograma es un enlace o
 * un botón, el nombre accesible lo pone quien lo envuelve y este componente se
 * calla entero: `nombreAccesible` a `false`.
 *
 * LAS CUATRO VERSIONES SON LAS DE LA ENTREGA, y cada una tiene su sitio:
 * `principal` es el de la barra, en una línea; `apilado` pone el nexo en su
 * propia línea, que es como la marca se dibuja cuando tiene aire por arriba y
 * por abajo —el pie—; `sello` es el del lacre, en claro sobre el marino; y
 * `secundaria` es la de una sola tinta, para cuando el monograma cae sobre una
 * foto y no se le puede pedir dos colores.
 */

export type VarianteMonograma = "principal" | "apilado" | "sello" | "secundaria";

const VARIANTES: Record<VarianteMonograma, { caja: string; nexo: string }> = {
  /* El de la barra: 23 px, en una línea, sobre superficie clara. */
  principal: {
    caja: "font-titulo peso-titulo-menor text-monograma leading-compacto tracking-monograma text-tinta-marca",
    nexo: "text-marca",
  },

  /* El grande del pie, con aire por arriba y por abajo. Sus colores no son los
     de la barra porque el bloque del pie reasigna los semánticos: allí `tinta`
     es clara y el nexo se apoya en `tinta-marca`. */
  apilado: {
    caja: "font-titulo peso-titulo-menor text-monograma-pie leading-compacto text-tinta",
    nexo: "text-tinta-marca",
  },

  /* El del lacre: claro sobre el marino del sello. */
  sello: {
    caja: "font-titulo text-sello leading-compacto text-tinta-sello",
    nexo: "",
  },

  /* La de una tinta, para cuando el monograma cae sobre una foto y no se le
     pueden pedir dos colores. */
  secundaria: {
    caja: "font-titulo peso-titulo-menor text-monograma leading-compacto tracking-monograma text-sobre-foto",
    nexo: "text-sobre-foto",
  },
};

interface Propiedades {
  nombreNovia: string;
  nombreNovio: string;
  variante?: VarianteMonograma;
  /**
   * Si el monograma ya vive dentro de algo con nombre —un enlace a la portada,
   * el botón del sello—, no vuelve a anunciarse: sería oírlo dos veces.
   */
  nombreAccesible?: boolean;
  className?: string;
}

export function Monograma({
  nombreNovia,
  nombreNovio,
  variante = "principal",
  nombreAccesible = true,
  className = "",
}: Propiedades) {
  const forma = VARIANTES[variante];
  const nombres = [nombreNovia, nombreNovio].filter(Boolean).join(" & ");

  /*
    El nexo del sello va por `Conector`, que es el único sitio del proyecto
    autorizado a nombrar la letra del ampersand. Los demás lo pintan con la
    misma cursiva de la barra, que es lo que hace la entrega fuera del lacre.
  */
  const nexo =
    variante === "sello" ? (
      <Conector tamano="sello">{t("navegacion.monogramaConector")}</Conector>
    ) : (
      <span className={`mx-linea text-ampersand italic ${forma.nexo}`}>
        {t("navegacion.monogramaConector")}
      </span>
    );

  return (
    <span className={`${forma.caja} ${className}`}>
      {nombreAccesible ? <span className="sr-only">{nombres}</span> : null}
      <span aria-hidden="true">
        {inicial(nombreNovia)}
        {nexo}
        {inicial(nombreNovio)}
      </span>
    </span>
  );
}
