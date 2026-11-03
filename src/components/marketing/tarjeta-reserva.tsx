import { EstrellasDelRetrato } from "@/components/marketing/estrellas-del-retrato";
import { Conector } from "@/components/ui/tipografia";
import { RETRATO_EN_LA_TARJETA } from "@/config/cielo";
import type { Retrato } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * LA TARJETA DEL SAVE THE DATE
 *
 * El naipe que sale del sobre con la información: el retrato de estrellas de
 * Paloma, Hati y David, «Reservad la fecha», los nombres, la fecha en dos
 * líneas y el lugar, centrados en el papel.
 *
 * SIN CUENTA ATRÁS: la llevaba al pie y los novios la quitaron. Un Save the
 * Date dice qué día es; contar los segundos es cosa de la web.
 *
 * ES PAPEL CLARO EN MEDIO DE LA NOCHE. La página va en marino
 * (`data-seccion="inversa"`) y la tarjeta vuelve a la paleta clara con
 * `data-seccion="papel"`: los mismos componentes, los mismos tokens, otro
 * papel. El retrato se imprime en él en tinta marino y oro, y se dibuja
 * estrella a estrella cuando la tarjeta sale (`trazado-del-naipe`).
 *
 * SE MIDE EN `cqh`. El naipe tiene una proporción fija y su alto lo decide la
 * pantalla, así que todo lo de dentro va en centésimas de ese alto: el
 * retrato mide 22 cqh, los nombres 8,4 y el año 13. En un móvil pequeño y en
 * un monitor grande la tarjeta es la misma, sólo que a otra escala — que es
 * exactamente lo que hace una tarjeta de papel al acercarla o alejarla. El
 * contenedor lo pone el naipe que la envuelve (`container-type: size`).
 *
 * Las versalitas van a interlínea corta y no a la del cuerpo: a 1,65 cada
 * línea pequeña crecía un tercio, y sumadas se salían del naipe. La entrega
 * las deja a la interlínea natural de la letra.
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
  retrato,
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
  /** El retrato de estrellas, o `null` si aún no se ha subido. */
  retrato: Retrato | null;
}) {
  return (
    <div
      data-seccion="papel"
      className="tarjeta relative flex h-full w-full flex-col items-center overflow-hidden px-naipe-x py-naipe-y text-center"
    >
      {/* El marco interior, a 2,4 cqh del borde: el filo de una tarjeta impresa. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-naipe-marco border border-borde-naipe"
      />

      <div className="tarjeta-contenido flex h-full w-full flex-col items-center justify-center">
        {retrato ? (
          <div
            className="trazado-del-naipe h-naipe-retrato shrink-0"
            {...(retrato.alternativo
              ? { role: "img", "aria-label": retrato.alternativo }
              : { "aria-hidden": true })}
          >
            <EstrellasDelRetrato
              retrato={retrato}
              medidas={RETRATO_EN_LA_TARJETA}
              idHalo="halo-retrato-naipe"
              encuadre="xMidYMid meet"
              className="block h-full w-auto overflow-visible"
            />
          </div>
        ) : null}

        <p className="mt-naipe-hueco-rotulo font-cuerpo peso-cuerpo text-naipe-rotulo leading-titulo-menor uppercase tracking-seccion text-tinta-suave">
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
          <p className="mt-naipe-hueco font-cuerpo text-naipe-fecha leading-titulo-menor uppercase tracking-naipe-lugar text-tinta-suave">
            {lugar}
          </p>
        ) : null}
      </div>
    </div>
  );
}
