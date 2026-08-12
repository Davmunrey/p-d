import Link from "next/link";
import { redirect } from "next/navigation";

import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  ALTO_BARRA_GRAFICA,
  ANCHO_GRAFICA,
  HUECO_BARRA_GRAFICA,
  PARTE_ROTULO_GRAFICA,
  RUTA_ACCESO,
  RUTA_PRESUPUESTO,
} from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import { obtenerPagos } from "@/lib/bbdd/pagos";
import { obtenerResumenPresupuesto, type ResumenCategoria } from "@/lib/bbdd/presupuesto";
import { t } from "@/lib/copy";
import {
  evolucionMensual,
  proporcion,
  repartoPorCategoria,
  type MesDelGasto,
  type ParteDelGasto,
} from "@/lib/graficas";
import { formateadorDeImporte } from "@/lib/importe";
import { accesoActual } from "@/lib/sesion";

/**
 * BODA-63 (#49) · CÓMO VA EL DINERO
 *
 * Las mismas cifras del presupuesto, miradas de lejos. Nadie entra aquí a hacer
 * nada: se entra a ver si esto va bien o va mal, que es una pregunta que una
 * tabla de doce filas no contesta de un vistazo y una barra sí.
 *
 * TRES DECISIONES QUE VALE LA PENA CONTAR:
 *
 * 1 · LOS COLORES SON TOKENS, no una paleta de gráficas. Lo normal aquí sería
 *     una escala de doce colores; sería exactamente el hardcode que prohíbe la
 *     regla 1 y además rompería una marca que tiene un azul y un bronce. Así
 *     que las gráficas se diseñan para necesitar poco color: el reparto no
 *     lleva un color por categoría, lleva su nombre al lado. Donde de verdad
 *     hay dos series —previsto contra real— hay dos tokens, y se distinguen
 *     también por posición y por cifra.
 *
 * 2 · CADA GRÁFICA LLEVA SU TABLA, y no una versión resumida: la misma
 *     información. El `<svg>` va `aria-hidden` porque para un lector de
 *     pantalla no es nada, y debajo está la tabla de verdad — la que se puede
 *     recorrer celda a celda y la que se copia y se pega.
 *
 * 3 · SE DIBUJA EN EL SERVIDOR, sin una línea de JavaScript. Son barras y
 *     rectángulos: una librería de gráficas aquí serían doscientos kilobytes
 *     para pintar lo que hace un `<rect>`.
 */
export const dynamic = "force-dynamic";

/** Cuánto del lienzo queda para las barras, una vez apartado el rótulo. */
const ANCHO_BARRAS = ANCHO_GRAFICA * (1 - PARTE_ROTULO_GRAFICA);
const INICIO_BARRAS = ANCHO_GRAFICA * PARTE_ROTULO_GRAFICA;

export default async function PaginaGraficas() {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const [resumen, pagos, moneda] = await Promise.all([
    obtenerResumenPresupuesto(),
    obtenerPagos(),
    obtenerMonedaBoda(),
  ]);

  const euros = moneda ? formateadorDeImporte(moneda) : null;
  const reparto = repartoPorCategoria(resumen);
  const meses = evolucionMensual(pagos);
  const comparables = resumen.filter((fila) => fila.importePrevisto > 0 || fila.real > 0);

  const hayAlgo = reparto.length > 0 || meses.length > 0 || comparables.length > 0;

  return (
    <>
      <div className="max-w-texto">
        <Link href={RUTA_PRESUPUESTO} className="text-pequeno text-tinta-suave underline">
          {t("panel.presupuesto.graficas.volver")}
        </Link>
        <Titulo2 como="h1" className="mt-pila">
          {t("panel.presupuesto.graficas.titulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("panel.presupuesto.graficas.entradilla")}</Cuerpo>
      </div>

      {/*
        SIN DATOS SE EXPLICA, no se dibujan ejes vacíos. Es un criterio del
        ticket y tiene razón de ser: una gráfica en blanco no se distingue de
        una gráfica rota, y quien la mira acaba dudando de la aplicación en vez
        de entender que todavía no ha apuntado nada.
      */}
      {!hayAlgo ? (
        <Cuerpo className="mt-bloque max-w-texto text-pequeno text-tinta-suave">
          {t("panel.presupuesto.graficas.vacio")}
        </Cuerpo>
      ) : (
        <>
          <Reparto reparto={reparto} euros={euros} />
          <Evolucion meses={meses} euros={euros} />
          <Comparativa categorias={comparables} euros={euros} />
        </>
      )}
    </>
  );
}

type Euros = ((importe: number) => string) | null;

/** Un importe escrito como los escribe el panel, o la cifra pelada si no hay moneda. */
const escribir = (euros: Euros, importe: number) => (euros ? euros(importe) : String(importe));

function Seccion({
  id,
  titulo,
  entradilla,
  children,
}: {
  id: string;
  titulo: string;
  entradilla: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-bloque" aria-labelledby={id}>
      <Titulo3 como="h2" id={id}>
        {titulo}
      </Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {entradilla}
      </Cuerpo>
      {children}
    </section>
  );
}

/**
 * EN QUÉ SE VA EL DINERO · barras horizontales, una por categoría.
 *
 * Todas del mismo color a propósito: lo que se compara es la longitud, y el
 * nombre va escrito al lado. Doce colores no añadirían información — sólo
 * obligarían a mirar una leyenda para saber cuál es cuál.
 */
function Reparto({ reparto, euros }: { reparto: ParteDelGasto[]; euros: Euros }) {
  const mayor = reparto[0]?.importe ?? 0;
  const alto = reparto.length * (ALTO_BARRA_GRAFICA + HUECO_BARRA_GRAFICA);

  return (
    <Seccion
      id="grafica-reparto"
      titulo={t("panel.presupuesto.graficas.repartoTitulo")}
      entradilla={t("panel.presupuesto.graficas.repartoEntradilla")}
    >
      {reparto.length === 0 ? (
        <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-suave">
          {t("panel.presupuesto.graficas.repartoVacio")}
        </Cuerpo>
      ) : (
        <>
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${ANCHO_GRAFICA} ${alto}`}
            className="mt-elemento w-full"
          >
            {reparto.map((parte, indice) => {
              const y = indice * (ALTO_BARRA_GRAFICA + HUECO_BARRA_GRAFICA);
              return (
                <g key={parte.categoria}>
                  <text
                    x={0}
                    y={y + ALTO_BARRA_GRAFICA / 2}
                    dominantBaseline="middle"
                    className="fill-tinta text-pequeno"
                  >
                    {parte.categoria}
                  </text>
                  <rect
                    x={INICIO_BARRAS}
                    y={y}
                    width={proporcion(parte.importe, mayor) * ANCHO_BARRAS}
                    height={ALTO_BARRA_GRAFICA}
                    fill="var(--serie-real)"
                  />
                </g>
              );
            })}
          </svg>

          <TablaReparto reparto={reparto} euros={euros} />
        </>
      )}
    </Seccion>
  );
}

function TablaReparto({ reparto, euros }: { reparto: ParteDelGasto[]; euros: Euros }) {
  return (
    <div className="mt-elemento overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
          {t("panel.presupuesto.graficas.laTabla")}
        </caption>
        <thead>
          <tr>
            {[
              t("panel.presupuesto.graficas.columnaCategoria"),
              t("panel.presupuesto.graficas.columnaImporte"),
              t("panel.presupuesto.graficas.columnaParte"),
            ].map((titulo) => (
              <th key={titulo} scope="col" className={CABECERA}>
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reparto.map((parte) => (
            <tr key={parte.categoria}>
              <th scope="row" className={FILA}>
                {parte.categoria}
              </th>
              <td className={CIFRA}>{escribir(euros, parte.importe)}</td>
              <td className={CIFRA}>
                {t("panel.presupuesto.graficas.porcentaje", {
                  numero: parte.porcentaje.toFixed(1),
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * LO QUE LLEVAMOS GASTADO · barras acumuladas, mes a mes.
 *
 * Barras y no una línea: entre dos meses con pagos puede haber tres sin
 * ninguno, y una línea recta entre esos dos puntos dibujaría una subida
 * constante que no ocurrió. Con barras, un mes sin pagos es una barra que no
 * crece, que es exactamente lo que pasó.
 */
function Evolucion({ meses, euros }: { meses: MesDelGasto[]; euros: Euros }) {
  const total = meses[meses.length - 1]?.acumulado ?? 0;
  const alto = meses.length * (ALTO_BARRA_GRAFICA + HUECO_BARRA_GRAFICA);

  return (
    <Seccion
      id="grafica-evolucion"
      titulo={t("panel.presupuesto.graficas.evolucionTitulo")}
      entradilla={t("panel.presupuesto.graficas.evolucionEntradilla")}
    >
      {meses.length === 0 ? (
        <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-suave">
          {t("panel.presupuesto.graficas.evolucionVacio")}
        </Cuerpo>
      ) : (
        <>
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${ANCHO_GRAFICA} ${alto}`}
            className="mt-elemento w-full"
          >
            {meses.map((mes, indice) => {
              const y = indice * (ALTO_BARRA_GRAFICA + HUECO_BARRA_GRAFICA);
              return (
                <g key={mes.clave}>
                  <text
                    x={0}
                    y={y + ALTO_BARRA_GRAFICA / 2}
                    dominantBaseline="middle"
                    className="fill-tinta text-pequeno"
                  >
                    {mes.etiqueta}
                  </text>
                  {/*
                    Dos barras superpuestas: el acumulado en claro y lo de ese
                    mes en oscuro encima. Así se ve de un vistazo cuánto de lo
                    que llevamos gastado se gastó justo ese mes.
                  */}
                  <rect
                    x={INICIO_BARRAS}
                    y={y}
                    width={proporcion(mes.acumulado, total) * ANCHO_BARRAS}
                    height={ALTO_BARRA_GRAFICA}
                    fill="var(--serie-previsto)"
                  />
                  <rect
                    x={INICIO_BARRAS}
                    y={y}
                    width={proporcion(mes.importe, total) * ANCHO_BARRAS}
                    height={ALTO_BARRA_GRAFICA}
                    fill="var(--serie-real)"
                  />
                </g>
              );
            })}
          </svg>

          <div className="mt-elemento overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
                {t("panel.presupuesto.graficas.laTabla")}
              </caption>
              <thead>
                <tr>
                  {[
                    t("panel.presupuesto.graficas.columnaMes"),
                    t("panel.presupuesto.graficas.columnaPagado"),
                    t("panel.presupuesto.graficas.columnaAcumulado"),
                  ].map((titulo) => (
                    <th key={titulo} scope="col" className={CABECERA}>
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meses.map((mes) => (
                  <tr key={mes.clave}>
                    <th scope="row" className={FILA}>
                      {mes.etiqueta}
                    </th>
                    <td className={CIFRA}>{escribir(euros, mes.importe)}</td>
                    <td className={CIFRA}>{escribir(euros, mes.acumulado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Seccion>
  );
}

/**
 * PREVISTO CONTRA REAL · dos barras por categoría.
 *
 * LA DE ARRIBA ES SIEMPRE EL PREVISTO Y LA DE ABAJO EL REAL, en todas las
 * categorías. La posición es la que dice cuál es cuál; el color acompaña. Quien
 * no distingue los dos azules sigue leyendo la gráfica, y quien la ve impresa
 * en blanco y negro también.
 *
 * Y EL EXCESO SE PINTA DE OTRO COLOR, que es la única vez que el color dice
 * algo por su cuenta — con la cifra al lado en la tabla, que es donde tiene que
 * poder leerse.
 */
function Comparativa({ categorias, euros }: { categorias: ResumenCategoria[]; euros: Euros }) {
  const mayor = Math.max(
    0,
    ...categorias.map((fila) => Math.max(fila.importePrevisto, fila.real)),
  );
  const altoPar = ALTO_BARRA_GRAFICA + HUECO_BARRA_GRAFICA;
  const alto = categorias.length * (altoPar + HUECO_BARRA_GRAFICA);

  return (
    <Seccion
      id="grafica-comparativa"
      titulo={t("panel.presupuesto.graficas.comparativaTitulo")}
      entradilla={t("panel.presupuesto.graficas.comparativaEntradilla")}
    >
      {categorias.length === 0 ? (
        <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-suave">
          {t("panel.presupuesto.graficas.comparativaVacio")}
        </Cuerpo>
      ) : (
        <>
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${ANCHO_GRAFICA} ${alto}`}
            className="mt-elemento w-full"
          >
            {categorias.map((fila, indice) => {
              const y = indice * (altoPar + HUECO_BARRA_GRAFICA);
              const media = ALTO_BARRA_GRAFICA / 2;
              const seHaPasado = fila.real > fila.importePrevisto;

              return (
                <g key={fila.categoriaId}>
                  <text
                    x={0}
                    y={y + ALTO_BARRA_GRAFICA}
                    dominantBaseline="middle"
                    className="fill-tinta text-pequeno"
                  >
                    {fila.categoria}
                  </text>
                  <rect
                    x={INICIO_BARRAS}
                    y={y}
                    width={proporcion(fila.importePrevisto, mayor) * ANCHO_BARRAS}
                    height={media}
                    fill="var(--serie-previsto)"
                  />
                  <rect
                    x={INICIO_BARRAS}
                    y={y + media + HUECO_BARRA_GRAFICA / 2}
                    width={proporcion(fila.real, mayor) * ANCHO_BARRAS}
                    height={media}
                    fill={seHaPasado ? "var(--serie-exceso)" : "var(--serie-real)"}
                  />
                </g>
              );
            })}
          </svg>

          <div className="mt-elemento overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
                {t("panel.presupuesto.graficas.laTabla")}
              </caption>
              <thead>
                <tr>
                  {[
                    t("panel.presupuesto.graficas.columnaCategoria"),
                    t("panel.presupuesto.graficas.columnaPrevisto"),
                    t("panel.presupuesto.graficas.columnaReal"),
                    t("panel.presupuesto.graficas.columnaDesviacion"),
                  ].map((titulo) => (
                    <th key={titulo} scope="col" className={CABECERA}>
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categorias.map((fila) => {
                  const diferencia = fila.real - fila.importePrevisto;
                  return (
                    <tr key={fila.categoriaId}>
                      <th scope="row" className={FILA}>
                        {fila.categoria}
                      </th>
                      <td className={CIFRA}>{escribir(euros, fila.importePrevisto)}</td>
                      <td className={CIFRA}>{escribir(euros, fila.real)}</td>
                      {/*
                        EL SIGNO SE ESCRIBE, Y EL COLOR NO ES LO ÚNICO QUE AVISA:
                        pasarse cien euros y ahorrárselos se distinguen leyendo,
                        no sólo mirando.
                      */}
                      <td className={`${CIFRA} ${diferencia > 0 ? "text-error-tinta" : ""}`}>
                        {diferencia > 0 ? "+" : ""}
                        {escribir(euros, diferencia)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Seccion>
  );
}

const CABECERA =
  "border-b border-borde-fuerte px-interno py-interno-compacto text-etiqueta uppercase tracking-etiqueta text-tinta-suave";
const FILA =
  "border-b border-borde px-interno py-interno-compacto text-left align-top text-cuerpo text-tinta";
const CIFRA =
  "border-b border-borde px-interno py-interno-compacto align-top text-cuerpo tabular-nums text-tinta";
