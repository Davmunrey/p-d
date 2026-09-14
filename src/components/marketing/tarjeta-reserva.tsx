import { CuentaAtras } from "@/components/marketing/cuenta-atras";
import { Constelacion } from "@/components/ui/constelacion";
import { Conector } from "@/components/ui/tipografia";
import { CONSTELACION_NOVIOS, ESCALA_ESTRELLA_TARJETA } from "@/config/constelaciones";
import { t } from "@/lib/copy";

/**
 * LA TARJETA DEL SAVE THE DATE
 *
 * El naipe que sale del sobre con la información: la Lira, «Reservad la
 * fecha», los nombres, la fecha en dos líneas, el lugar y la cuenta atrás.
 * Es la tarjeta impresa de la entrega, letra por letra.
 *
 * SE MIDE EN `cqh`. El naipe tiene una proporción fija y su alto lo decide la
 * pantalla, así que todo lo de dentro va en centésimas de ese alto: los
 * nombres miden 8,4 cqh, el año 13, la cuenta atrás 6. En un móvil pequeño y
 * en un monitor grande la tarjeta es la misma, sólo que a otra escala — que
 * es exactamente lo que hace una tarjeta de papel al acercarla o alejarla.
 * El contenedor lo pone el naipe que la envuelve (`container-type: size`).
 *
 * Las versalitas van a interlínea corta y no a la del cuerpo: a 1,65 cada
 * línea pequeña crecía un tercio, y sumadas empujaban la cuenta atrás fuera
 * del naipe. La entrega las deja a la interlínea natural de la letra.
 *
 * LOS NOMBRES SON EL `h1` DE LA PÁGINA: es lo que la página dice. La «y» va
 * en la letra del conector a través de `Conector`, como en la portada, y en
 * el escalón del naipe.
 */
export function TarjetaReserva({
  nombreNovia,
  nombreNovio,
  fechaIso,
  fechaTexto,
  anio,
  lugar,
}: {
  nombreNovia: string;
  nombreNovio: string;
  fechaIso: string;
  /** «Sábado 26 de junio», ya formateada en el servidor. */
  fechaTexto: string;
  /** «2027», en su propia línea. */
  anio: string;
  /** «Finca La Sierra · León», o `null` si no hay lugar configurado. */
  lugar: string | null;
}) {
  return (
    <div className="tarjeta relative flex h-full w-full flex-col items-center overflow-hidden px-naipe-x py-naipe-y text-center">
      {/* El marco interior, a 2,4 cqh del borde: el filo de una tarjeta impresa. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-naipe-marco border border-borde-naipe"
      />

      <div className="tarjeta-contenido flex h-full w-full flex-col items-center">
        <div className="size-naipe-lira shrink-0">
          <Constelacion clave={CONSTELACION_NOVIOS} escala={ESCALA_ESTRELLA_TARJETA} />
        </div>

        <p className="mt-naipe-hueco-rotulo font-cuerpo peso-cuerpo text-naipe-rotulo leading-titulo-menor uppercase tracking-seccion text-tinta-tenue">
          {t("saveTheDate.etiqueta")}
        </p>

        <h1 className="mt-naipe-hueco font-titulo peso-titulo text-naipe-nombre leading-naipe-nombre tracking-normal text-tinta">
          {nombreNovia}
          <span className="block">
            <Conector tamano="naipe">{t("portada.conjuncion")}</Conector>
          </span>
          {nombreNovio}
        </h1>

        {/* Dos rayas y un rombo de bronce: el separador de la entrega. */}
        <div
          aria-hidden="true"
          className="my-naipe-separador flex items-center gap-naipe-hueco-raya"
        >
          <span className="w-naipe-raya border-t border-borde-filete" />
          <span className="size-naipe-rombo rotate-45 bg-acento" />
          <span className="w-naipe-raya border-t border-borde-filete" />
        </div>

        <p className="font-cuerpo text-naipe-fecha leading-titulo-menor uppercase tracking-naipe-fecha text-tinta-suave">
          <time dateTime={fechaIso}>{fechaTexto}</time>
        </p>
        <p className="mt-naipe-hueco-corto font-titulo peso-titulo text-naipe-anno leading-naipe-anno text-tinta-marca">
          {anio}
        </p>

        {lugar ? (
          <p className="mt-naipe-hueco font-cuerpo text-naipe-fecha leading-titulo-menor uppercase tracking-naipe-lugar text-tinta-tenue">
            {lugar}
          </p>
        ) : null}

        {/* Lo que sobre de alto se lo queda este hueco: la cuenta atrás va al pie. */}
        <div className="min-h-naipe-hueco-cifras flex-1" />

        <CuentaAtras fechaIso={fechaIso} compacta />
      </div>
    </div>
  );
}
