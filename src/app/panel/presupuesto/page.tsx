import { redirect } from "next/navigation";

import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  LARGOS_DE_CAMPO,
  RUTA_ACCESO,
  RUTA_GASTOS,
  RUTA_GRAFICAS,
  RUTA_PAGOS,
} from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import {
  loQueVaCostando,
  obtenerCategoriasPresupuesto,
  obtenerResumenPresupuesto,
  type CategoriaPresupuesto,
  type ResumenCategoria,
} from "@/lib/bbdd/presupuesto";
import { t } from "@/lib/copy";
import { formateadorDeImporte, importeParaCampo } from "@/lib/importe";
import { accesoActual } from "@/lib/sesion";

import { borrarCategoria, crearCategoria, editarCategoria } from "./acciones";
import { AvisoPresupuesto } from "./aviso";

/**
 * BODA-60 · CATEGORÍAS DE PRESUPUESTO
 *
 * El armazón del presupuesto: banquete, fotografía, música, flores, trajes. Sin
 * ellas los gastos son una lista plana de cuarenta líneas en la que no se ve
 * nada — y lo que hay que ver no es cuántas líneas hay, es en qué se está
 * yendo el dinero.
 *
 * PREVISTO ENFRENTE DE LO QUE VA COSTANDO, en la misma fila. Una tabla de
 * presupuestos sin la realidad al lado es una lista de deseos: se mira una vez
 * al empezar y no se vuelve a abrir.
 *
 * LA DESVIACIÓN USA EL IMPORTE REAL CUANDO EXISTE Y EL ESTIMADO MIENTRAS NO, y
 * la calcula la base. Es la cifra que de verdad interesa —«¿me estoy
 * pasando?»— y no la suma de lo ya pagado, que la semana antes de la boda es
 * siempre tranquilizadora y siempre falsa.
 *
 * UN LECTOR VE PERO NO CREA: la protección de verdad es RLS; esto es no
 * ofrecer un formulario que va a fallar al enviarlo.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

export default async function PaginaPresupuesto({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const estado = soloTexto(consulta.estado);

  const [categorias, resumen, moneda] = await Promise.all([
    obtenerCategoriasPresupuesto(),
    obtenerResumenPresupuesto(),
    obtenerMonedaBoda(),
  ]);

  const puedeEditar = acceso.rol !== "lector";

  /*
    Sin moneda configurada no se enseñan importes. Un «21.400» a secas en una
    pantalla de presupuesto invita a leerlo en euros, y si esta boda se paga en
    otra cosa eso es peor que no decir nada. El resto de la pantalla funciona.
  */
  const euros = moneda ? formateadorDeImporte(moneda) : null;

  /*
    EL TOTAL LLEVA LAS CUATRO CIFRAS. Se quedaba en previsto y «va costando», y
    las dos columnas que más se miran —cuánto se ha pagado ya y cuánto queda de
    margen— acababan en blanco justo en la fila que resume. La diferencia total
    es la suma de las de cada categoría: lo que sobra en unas compensa lo que
    falta en otras, que es la pregunta de «¿nos llega?».
  */
  const totales = resumen.reduce(
    (suma, fila) => ({
      previsto: suma.previsto + fila.importePrevisto,
      real: suma.real + loQueVaCostando(fila),
      pagado: suma.pagado + fila.pagado,
      desviacion: suma.desviacion + fila.desviacion,
    }),
    { previsto: 0, real: 0, pagado: 0, desviacion: 0 },
  );

  const aDecidir = estado === "decidir-gastos" ? soloTexto(consulta.categoria) : "";

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.presupuesto.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.presupuesto.descripcion")}</Cuerpo>
        <div className="mt-pila flex flex-wrap gap-interno">
          <EnlaceSuave href={RUTA_GASTOS}>{t("panel.presupuesto.verGastos")}</EnlaceSuave>
          <EnlaceSuave href={RUTA_PAGOS}>{t("panel.presupuesto.verPagos")}</EnlaceSuave>
          <EnlaceSuave href={RUTA_GRAFICAS}>
            {t("panel.presupuesto.graficas.enlace")}
          </EnlaceSuave>
        </div>
      </header>

      <AvisoPresupuesto estado={estado} />

      {aDecidir && puedeEditar ? (
        <DecidirGastos
          categoriaId={aDecidir}
          categorias={categorias.filter((categoria) => categoria.id !== aDecidir)}
        />
      ) : null}

      {resumen.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">{t("panel.presupuesto.vacio")}</Cuerpo>
      ) : (
        <Tabla resumen={resumen} totales={totales} euros={euros} />
      )}

      {puedeEditar ? (
        <>
          <Edicion categorias={categorias} />
          <Alta />
        </>
      ) : null}
    </>
  );
}

/**
 * LA TABLA, CON SU EQUIVALENTE LEGIBLE EN MÓVIL.
 *
 * Es una sola tabla y no dos maquetaciones: en móvil se desplaza en horizontal
 * dentro de su contenedor. Duplicar la tabla en tarjetas para pantallas
 * pequeñas duplica también el sitio donde una cifra puede quedarse vieja.
 */
function Tabla({
  resumen,
  totales,
  euros,
}: {
  resumen: ResumenCategoria[];
  totales: { previsto: number; real: number; pagado: number; desviacion: number };
  euros: ((valor: number) => string) | null;
}) {
  const importe = (valor: number) => (euros ? euros(valor) : "");

  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.presupuesto.resumenTitulo")}</Titulo3>

      <div className="mt-elemento overflow-x-auto">
        <table className="w-full border-collapse text-pequeno">
          <thead>
            <tr className="border-b border-borde text-left">
              <th className="py-linea pr-interno font-normal text-tinta-suave">
                {t("panel.presupuesto.columnaCategoria")}
              </th>
              <th className="py-linea pr-interno text-right font-normal text-tinta-suave">
                {t("panel.presupuesto.columnaPrevisto")}
              </th>
              <th className="py-linea pr-interno text-right font-normal text-tinta-suave">
                {t("panel.presupuesto.columnaGastado")}
              </th>
              <th className="py-linea pr-interno text-right font-normal text-tinta-suave">
                {t("panel.presupuesto.columnaPagado")}
              </th>
              <th className="py-linea text-right font-normal text-tinta-suave">
                {t("panel.presupuesto.columnaDesviacion")}
              </th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((fila) => (
              <tr key={fila.categoriaId} className="border-b border-borde">
                <td className="py-linea pr-interno text-tinta">{fila.categoria}</td>
                <td className="py-linea pr-interno text-right tabular-nums text-tinta-suave">
                  {importe(fila.importePrevisto)}
                </td>
                <td className="py-linea pr-interno text-right tabular-nums text-tinta">
                  {importe(loQueVaCostando(fila))}
                </td>
                <td className="py-linea pr-interno text-right tabular-nums text-tinta-suave">
                  {importe(fila.pagado)}
                </td>
                <td
                  className={`py-linea text-right tabular-nums ${
                    fila.desviacion < 0 ? "text-error" : "text-tinta-suave"
                  }`}
                >
                  {importe(fila.desviacion)}
                  <DeMas desviacion={fila.desviacion} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="py-interno-compacto pr-interno text-left font-normal text-tinta">
                {t("panel.presupuesto.total")}
              </th>
              <td className="py-interno-compacto pr-interno text-right tabular-nums text-tinta">
                {importe(totales.previsto)}
              </td>
              <td className="py-interno-compacto pr-interno text-right tabular-nums text-tinta">
                {importe(totales.real)}
              </td>
              <td className="py-interno-compacto pr-interno text-right tabular-nums text-tinta">
                {importe(totales.pagado)}
              </td>
              <td
                className={`py-interno-compacto text-right tabular-nums ${
                  totales.desviacion < 0 ? "text-error" : "text-tinta"
                }`}
              >
                {importe(totales.desviacion)}
                <DeMas desviacion={totales.desviacion} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/**
 * A DÓNDE VAN LOS GASTOS, QUE ES LA PREGUNTA DE VERDAD.
 *
 * Borrar una categoría con gastos no es «¿seguro?»: la base se niega —
 * `on delete restrict`— y hace bien, porque arrastrarlos falsearía el
 * presupuesto y dejarlos sueltos no es posible. Lo único que hay que decidir es
 * dónde se quedan.
 */
function DecidirGastos({
  categoriaId,
  categorias,
}: {
  categoriaId: string;
  categorias: CategoriaPresupuesto[];
}) {
  return (
    <section className="mt-elemento rounded-tarjeta border border-error bg-error-fondo p-interno">
      <Titulo3 como="h2">{t("panel.presupuesto.decidirTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.presupuesto.decidirAyuda")}
      </Cuerpo>

      {categorias.length === 0 ? (
        // Sin otra categoría a la que moverlos no hay decisión que ofrecer, y
        // un desplegable vacío sería una trampa: se pulsa y no puede pasar nada.
        <Cuerpo className="mt-elemento max-w-texto text-pequeno">
          {t("panel.presupuesto.decidirSinDestino")}
        </Cuerpo>
      ) : (
        <form
          action={borrarCategoria}
          className="mt-elemento grid gap-interno sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <input type="hidden" name="id" value={categoriaId} />
          <CampoSeleccion
            etiqueta={t("panel.presupuesto.campoDestino")}
            name="destino"
            required
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </CampoSeleccion>
          <BotonEnvio>{t("panel.presupuesto.moverYBorrar")}</BotonEnvio>
        </form>
      )}
    </section>
  );
}

/**
 * Editar y borrar, una fila por categoría.
 *
 * El orden se teclea en lugar de arrastrarse: arrastrar deja fuera al teclado y
 * al lector de pantalla si es la única forma, y aquí lo que se ordena son ocho
 * filas que se colocan una vez y no se vuelven a tocar.
 */
/**
 * PASARSE NO SE MARCA SÓLO CON COLOR. El signo ya lo dice —la desviación
 * negativa es lo que sobra— y además lleva su palabra, porque un rojo no lo lee
 * ni un daltónico ni un lector de pantalla ni nadie con el sol de junio en la
 * pantalla. Va entera a la línea de abajo si no cabe: partida, «DE» y «MÁS»
 * quedaban cada una en su renglón.
 */
function DeMas({ desviacion }: { desviacion: number }) {
  if (desviacion >= 0) return null;
  return (
    <span className="ml-interno-compacto inline-block whitespace-nowrap text-etiqueta uppercase tracking-etiqueta">
      {t("panel.presupuesto.pasado")}
    </span>
  );
}

/*
  EL NOMBRE SE QUEDA EL SITIO, EL ORDEN SÓLO EL QUE NECESITA. Con
  `2fr_1fr_auto_auto`, la columna `auto` del orden tomaba el ancho natural de un
  campo numérico —unos 170 px— y en la tableta, con el lateral abierto, al
  nombre le tocaban 60: se leía «(DES» y nada más. El orden son dos cifras y
  tiene su token; nombre y previsto se reparten el resto. Y hasta escritorio el
  nombre va en su propia fila: junto al botón, ni repartiendo bien le cabía.
*/
const FILA_CATEGORIA =
  "grid gap-interno sm:grid-cols-[minmax(0,1fr)_var(--spacing-campo-corto)_auto] sm:items-end lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_var(--spacing-campo-corto)_auto]";

/** En tableta el nombre va solo en su fila; en escritorio, en la de todos. */
const CAMPO_NOMBRE = "sm:col-span-full lg:col-span-1";

function Edicion({ categorias }: { categorias: CategoriaPresupuesto[] }) {
  if (categorias.length === 0) return null;

  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.presupuesto.editarTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.presupuesto.editarAyuda")}
      </Cuerpo>

      <ul className="mt-elemento grid gap-interno">
        {categorias.map((categoria) => (
          <li key={categoria.id} className="rounded-tarjeta border border-borde p-interno">
            <form action={editarCategoria} className={FILA_CATEGORIA}>
              <input type="hidden" name="id" value={categoria.id} />
              <CampoTexto
                etiqueta={t("panel.presupuesto.campoNombre")}
                className={CAMPO_NOMBRE}
                name="nombre"
                type="text"
                required
                maxLength={LARGOS_DE_CAMPO["categorias_presupuesto.nombre"]}
                defaultValue={categoria.nombre}
              />
              <CampoTexto
                etiqueta={t("panel.presupuesto.campoPrevisto")}
                name="importe_previsto"
                type="text"
                inputMode="decimal"
                defaultValue={importeParaCampo(categoria.importePrevisto)}
              />
              <CampoTexto
                etiqueta={t("panel.presupuesto.campoOrden")}
                name="orden"
                type="number"
                min={0}
                defaultValue={String(categoria.orden)}
              />
              <BotonEnvio jerarquia="secundario">{t("panel.presupuesto.guardar")}</BotonEnvio>
            </form>

            <form action={borrarCategoria} className="mt-interno-compacto">
              <input type="hidden" name="id" value={categoria.id} />
              <BotonEnvio jerarquia="terciario">{t("panel.presupuesto.borrar")}</BotonEnvio>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Alta() {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.presupuesto.nuevaTitulo")}</Titulo3>
      {/* Una frase entera se lee en minúscula: en versalita espaciada era un
          rótulo de cuarenta palabras que costaba seguir. */}
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.presupuesto.nuevaAyuda")}
      </Cuerpo>

      <form action={crearCategoria} className={`mt-elemento ${FILA_CATEGORIA}`}>
        <CampoTexto
          etiqueta={t("panel.presupuesto.campoNombre")}
          className={CAMPO_NOMBRE}
          name="nombre"
          type="text"
          required
          maxLength={LARGOS_DE_CAMPO["categorias_presupuesto.nombre"]}
        />
        {/* La ayuda del importe va bajo la fila: colgada del campo, lo subía
            por encima de los otros dos y del botón. En el móvil, donde no hay
            fila, el orden y el botón bajan detrás de ella para que la ayuda
            quede pegada al importe y no debajo de «Crear». */}
        <CampoTexto
          etiqueta={t("panel.presupuesto.campoPrevisto")}
          aria-describedby="ayuda-previsto-nueva"
          name="importe_previsto"
          type="text"
          inputMode="decimal"
        />
        <CampoTexto
          etiqueta={t("panel.presupuesto.campoOrden")}
          className="max-sm:order-1"
          name="orden"
          type="number"
          min={0}
        />
        <BotonEnvio className="max-sm:order-1">{t("panel.presupuesto.crear")}</BotonEnvio>
        <p id="ayuda-previsto-nueva" className="text-pequeno text-tinta-suave sm:col-span-full">
          {t("panel.presupuesto.campoPrevistoAyuda")}
        </p>
      </form>
    </section>
  );
}
