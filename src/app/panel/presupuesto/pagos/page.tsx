import { redirect } from "next/navigation";

import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  RUTA_ACCESO,
  RUTA_GASTOS,
  RUTA_PAGOS,
  RUTA_PRESUPUESTO,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import {
  obtenerGastosParaPagar,
  obtenerPagos,
  porMes,
  totalesDe,
  METODOS_PAGO,
  PAGADORES,
  type GastoParaPagar,
  type Pago,
} from "@/lib/bbdd/pagos";
import { t } from "@/lib/copy";
import { formateadorDeImporte } from "@/lib/importe";
import { accesoActual } from "@/lib/sesion";

import { borrarPago, crearPago, editarPago, marcarPagado } from "./acciones";
import { AvisoPagos } from "./aviso";

/**
 * BODA-62 · QUÉ HAY QUE PAGAR Y CUÁNDO
 *
 * ES UN CALENDARIO Y NO UNA LISTA, y ésa es toda la decisión de esta pantalla.
 * Los proveedores cobran a plazos y lo que se olvida no es el importe —está
 * escrito en el contrato— sino la fecha. Treinta vencimientos en una lista plana
 * obligan a leer fechas una a una para contestar «¿qué me viene encima este
 * mes?»; agrupados por mes, la respuesta está antes de mirar.
 *
 * LO VENCIDO VA ARRIBA Y CON SU PALABRA. Sale de su bloque mensual y se pone el
 * primero, porque es lo único de esta pantalla que ya es tarde. Y lleva escrito
 * «Vencido»: un rojo no lo lee ni un daltónico, ni un lector de pantalla, ni
 * nadie con el sol de junio dando en el móvil.
 *
 * «VENCIDO» LO DICE LA BASE, comparando con su fecha. Preguntárselo al navegador
 * es preguntárselo a un reloj que puede estar mal puesto.
 *
 * UN LECTOR VE PERO NO CREA: la protección de verdad es RLS; esto es no ofrecer
 * un formulario que va a fallar al enviarlo.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

/*
  LAS FECHAS SE PINTAN CON MEDIODÍA DENTRO.

  `fecha_vencimiento` es un `date` y llega como «2027-06-12». Construir
  `new Date("2027-06-12")` lo interpreta en UTC, y al pintarlo en Europe/Madrid
  un pago del día 1 se enseña como del 31 del mes anterior en invierno y del día
  1 en verano — es decir, a veces. Poniendo las 12:00 UTC, ningún huso de Europa
  cruza la medianoche y el día es siempre el que se escribió.
*/
function comoDia(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`);
}

const formatoDia = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

const formatoMes = new Intl.DateTimeFormat(IDIOMA, {
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

export default async function PaginaPagos({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const estado = soloTexto(consulta.estado);
  const editando = soloTexto(consulta.editar);

  const [pagos, gastos, moneda] = await Promise.all([
    obtenerPagos(),
    obtenerGastosParaPagar(),
    obtenerMonedaBoda(),
  ]);

  const puedeEditar = acceso.rol !== "lector";
  const euros = moneda ? formateadorDeImporte(moneda) : null;

  const totales = totalesDe(pagos);
  const vencidos = pagos.filter((pago) => pago.vencido);
  const proximos = pagos.filter((pago) => !pago.pagadoEn && !pago.vencido);
  const pagados = pagos.filter((pago) => pago.pagadoEn);

  /*
    La cifra del aviso «no cabe» viaja en la URL como número crudo y se formatea
    aquí, que es donde se sabe la moneda de la boda. Mandarla ya formateada
    desde la acción metería «€» en una query, y el símbolo cambia si la boda se
    paga en otra cosa.
  */
  const quedaCrudo = soloTexto(consulta.queda);
  const queda =
    quedaCrudo && euros && Number.isFinite(Number(quedaCrudo)) ? euros(Number(quedaCrudo)) : "";

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.presupuesto.pagos.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.presupuesto.pagos.descripcion")}</Cuerpo>
        <div className="mt-pila flex flex-wrap gap-interno">
          <Enlace href={RUTA_PRESUPUESTO}>{t("panel.presupuesto.pagos.volver")}</Enlace>
          <Enlace href={RUTA_GASTOS}>{t("panel.presupuesto.pagos.verGastos")}</Enlace>
        </div>
      </header>

      <AvisoPagos estado={estado} queda={queda} />

      <Totales totales={totales} euros={euros} />

      {pagos.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">{t("panel.presupuesto.pagos.vacio")}</Cuerpo>
      ) : (
        <>
          {vencidos.length > 0 ? (
            <section className="mt-bloque rounded-tarjeta border border-error bg-error-fondo p-interno">
              <Titulo3 como="h2">{t("panel.presupuesto.pagos.vencidosTitulo")}</Titulo3>
              <Cuerpo className="mt-pila max-w-texto text-pequeno">
                {t("panel.presupuesto.pagos.vencidosAyuda")}
              </Cuerpo>
              <Lista
                pagos={vencidos}
                gastos={gastos}
                puedeEditar={puedeEditar}
                editando={editando}
                euros={euros}
              />
            </section>
          ) : null}

          {[...porMes(proximos)].map(([mes, delMes]) => (
            <section key={mes} className="mt-bloque">
              <Titulo3 como="h2" className="border-b border-borde pb-linea capitalize">
                {formatoMes.format(comoDia(`${mes}-01`))}
              </Titulo3>
              <Lista
                pagos={delMes}
                gastos={gastos}
                puedeEditar={puedeEditar}
                editando={editando}
                euros={euros}
              />
            </section>
          ))}

          {pagados.length > 0 ? (
            <section className="mt-bloque">
              <Titulo3 como="h2" className="border-b border-borde pb-linea">
                {t("panel.presupuesto.pagos.pagadosTitulo")}
              </Titulo3>
              <Lista
                pagos={pagados}
                gastos={gastos}
                puedeEditar={puedeEditar}
                editando={editando}
                euros={euros}
              />
            </section>
          ) : null}
        </>
      )}

      {puedeEditar ? <Alta gastos={gastos} /> : null}
    </>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return <EnlaceSuave href={href}>{children}</EnlaceSuave>;
}

/**
 * Lo pagado, lo que falta y, dentro de lo que falta, lo que ya es tarde.
 *
 * Los tres juntos y no sólo el pendiente: «quedan 12.000 €» tranquiliza hasta
 * que resulta que 3.000 vencieron el mes pasado.
 */
function Totales({
  totales,
  euros,
}: {
  totales: { pagado: number; pendiente: number; vencido: number };
  euros: ((valor: number) => string) | null;
}) {
  if (!euros) return null;

  return (
    <section className="mt-elemento rounded-tarjeta border border-borde p-interno">
      <dl className="flex flex-wrap gap-bloque">
        <Cifra
          rotulo={t("panel.presupuesto.pagos.totalPagado")}
          valor={euros(totales.pagado)}
        />
        <Cifra
          rotulo={t("panel.presupuesto.pagos.totalPendiente")}
          valor={euros(totales.pendiente)}
          destacada
        />
        {totales.vencido > 0 ? (
          <Cifra
            rotulo={t("panel.presupuesto.pagos.totalVencido")}
            valor={euros(totales.vencido)}
            error
          />
        ) : null}
      </dl>
    </section>
  );
}

function Cifra({
  rotulo,
  valor,
  destacada,
  error,
}: {
  rotulo: string;
  valor: string;
  destacada?: boolean;
  error?: boolean;
}) {
  return (
    <div>
      <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">{rotulo}</dt>
      <dd
        className={`mt-linea text-titulo-3 tabular-nums ${
          error ? "text-error" : destacada ? "text-tinta" : "text-tinta-suave"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

function Lista({
  pagos,
  gastos,
  puedeEditar,
  editando,
  euros,
}: {
  pagos: Pago[];
  gastos: GastoParaPagar[];
  puedeEditar: boolean;
  editando: string;
  euros: ((valor: number) => string) | null;
}) {
  return (
    <ul className="mt-elemento grid gap-interno">
      {pagos.map((pago) => (
        <li
          key={pago.id}
          id={`pago-${pago.id}`}
          className="rounded-tarjeta border border-borde bg-superficie p-interno"
        >
          {puedeEditar && editando === pago.id ? (
            <Edicion pago={pago} gastos={gastos} />
          ) : (
            <Fila pago={pago} puedeEditar={puedeEditar} euros={euros} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Cómo se llama quien paga, con su nombre cuando es «otros». */
function quienPaga(pago: Pago): string {
  if (!pago.paga) return t("panel.presupuesto.pagos.sinPagador");
  if (pago.paga === "otros" && pago.pagaDetalle) {
    return `${t("panel.presupuesto.pagos.paga")}: ${pago.pagaDetalle}`;
  }
  return `${t("panel.presupuesto.pagos.paga")}: ${t(
    `panel.presupuesto.pagos.pagadores.${pago.paga}` as never,
  )}`;
}

function Fila({
  pago,
  puedeEditar,
  euros,
}: {
  pago: Pago;
  puedeEditar: boolean;
  euros: ((valor: number) => string) | null;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-interno">
      <div>
        <span className="text-cuerpo text-tinta">{pago.concepto}</span>
        <span className="mt-linea block text-pequeno text-tinta-suave">
          {pago.categoria}
          {pago.proveedor ? ` · ${pago.proveedor}` : ""} · {quienPaga(pago)}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-interno">
        <div className="text-right">
          <span className="block text-cuerpo tabular-nums text-tinta">
            {euros ? euros(pago.importe) : ""}
          </span>
          <span className="mt-linea block text-pequeno text-tinta-suave">
            {pago.pagadoEn
              ? `${t("panel.presupuesto.pagos.pagadoEl")} ${formatoDia.format(comoDia(pago.pagadoEn))}`
              : formatoDia.format(comoDia(pago.fechaVencimiento))}
            {/*
              LA PALABRA, NO SÓLO EL COLOR. El recuadro rojo de la sección ya lo
              sugiere, pero quien llega a esta fila desde un lector de pantalla
              no ve recuadros, y quien la lee al sol tampoco.
            */}
            {pago.vencido ? (
              <span className="ml-interno-compacto text-etiqueta uppercase tracking-etiqueta text-error">
                {t("panel.presupuesto.pagos.vencido")}
              </span>
            ) : null}
          </span>
        </div>

        {puedeEditar ? (
          <div className="flex flex-wrap items-baseline gap-interno">
            <form action={marcarPagado}>
              <input type="hidden" name="id" value={pago.id} />
              {/*
                El mismo formulario para marcar y para deshacer: un campo oculto
                dice cuál de las dos. Dos acciones distintas para escribir y
                borrar la misma columna acabarían discrepando en qué más se
                limpia al deshacer.
              */}
              {pago.pagadoEn ? <input type="hidden" name="deshacer" value="si" /> : null}
              <Boton type="submit" jerarquia={pago.pagadoEn ? "terciario" : "secundario"}>
                {pago.pagadoEn
                  ? t("panel.presupuesto.pagos.deshacerPago")
                  : t("panel.presupuesto.pagos.marcarPagado")}
              </Boton>
            </form>

            <Enlace href={`${RUTA_PAGOS}?editar=${pago.id}#pago-${pago.id}`}>
              {t("panel.presupuesto.pagos.editar")}
            </Enlace>

            <form action={borrarPago}>
              <input type="hidden" name="id" value={pago.id} />
              <Boton type="submit" jerarquia="terciario">
                {t("panel.presupuesto.pagos.borrar")}
              </Boton>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Las opciones del desplegable de gastos, con su categoría delante. */
function OpcionesDeGasto({ gastos }: { gastos: GastoParaPagar[] }) {
  return (
    <>
      {gastos.map((gasto) => (
        <option key={gasto.id} value={gasto.id}>
          {gasto.categoria ? `${gasto.categoria} · ` : ""}
          {gasto.concepto}
        </option>
      ))}
    </>
  );
}

/**
 * Las formas de pagar. Desplegable y no texto libre porque la columna es un
 * enumerado: «paypal» escrito a mano no da un campo raro, da un error de la base.
 */
function OpcionesDeMetodo() {
  return (
    <>
      <option value="">{t("panel.presupuesto.pagos.sinMetodo")}</option>
      {METODOS_PAGO.map((metodo) => (
        <option key={metodo} value={metodo}>
          {t(`panel.presupuesto.pagos.metodos.${metodo}` as never)}
        </option>
      ))}
    </>
  );
}

function CamposDePagador({ pago }: { pago?: Pago }) {
  return (
    <>
      <CampoSeleccion
        etiqueta={t("panel.presupuesto.pagos.campoPaga")}
        name="paga"
        defaultValue={pago?.paga ?? ""}
      >
        <option value="">{t("panel.presupuesto.pagos.sinPagador")}</option>
        {PAGADORES.map((pagador) => (
          <option key={pagador} value={pagador}>
            {t(`panel.presupuesto.pagos.pagadores.${pagador}` as never)}
          </option>
        ))}
      </CampoSeleccion>

      <CampoTexto
        etiqueta={t("panel.presupuesto.pagos.campoPagaDetalle")}
        ayuda={t("panel.presupuesto.pagos.campoPagaDetalleAyuda")}
        name="paga_detalle"
        type="text"
        maxLength={120}
        defaultValue={pago?.pagaDetalle ?? ""}
      />
    </>
  );
}

function Edicion({ pago, gastos }: { pago: Pago; gastos: GastoParaPagar[] }) {
  return (
    <>
      <form action={editarPago} className="grid gap-interno sm:grid-cols-2">
        <input type="hidden" name="id" value={pago.id} />

        <CampoSeleccion
          etiqueta={t("panel.presupuesto.pagos.campoGasto")}
          name="gasto_id"
          required
          defaultValue={pago.gastoId}
        >
          <OpcionesDeGasto gastos={gastos} />
        </CampoSeleccion>

        <CampoTexto
          etiqueta={t("panel.presupuesto.pagos.campoImporte")}
          name="importe"
          type="text"
          inputMode="decimal"
          required
          defaultValue={String(pago.importe)}
        />

        <CampoTexto
          etiqueta={t("panel.presupuesto.pagos.campoVencimiento")}
          name="fecha_vencimiento"
          type="date"
          required
          defaultValue={pago.fechaVencimiento}
        />

        <CampoSeleccion
          etiqueta={t("panel.presupuesto.pagos.campoMetodo")}
          name="metodo"
          defaultValue={pago.metodo ?? ""}
        >
          <OpcionesDeMetodo />
        </CampoSeleccion>

        <CamposDePagador pago={pago} />

        <CampoTextoLargo
          etiqueta={t("panel.presupuesto.pagos.campoNotas")}
          name="notas"
          rows={2}
          maxLength={2000}
          defaultValue={pago.notas ?? ""}
        />

        <div className="flex flex-wrap items-baseline gap-interno sm:col-span-2">
          <Boton type="submit" jerarquia="secundario">
            {t("panel.presupuesto.pagos.guardar")}
          </Boton>
          {/*
            Salir sin guardar tiene que estar: sin ella, quien abre la edición por
            curiosidad sólo puede cerrarla guardando lo que hubiera tocado sin
            querer.
          */}
          <Enlace href={`${RUTA_PAGOS}#pago-${pago.id}`}>
            {t("panel.presupuesto.pagos.cancelar")}
          </Enlace>
        </div>
      </form>
    </>
  );
}

function Alta({ gastos }: { gastos: GastoParaPagar[] }) {
  if (gastos.length === 0) {
    return (
      <Cuerpo className="mt-bloque max-w-texto">
        {t("panel.presupuesto.pagos.sinGastos")}
      </Cuerpo>
    );
  }

  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.presupuesto.pagos.nuevaTitulo")}</Titulo3>
      <Etiqueta className="mt-pila block">{t("panel.presupuesto.pagos.nuevaAyuda")}</Etiqueta>

      <form action={crearPago} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <CampoSeleccion
          etiqueta={t("panel.presupuesto.pagos.campoGasto")}
          name="gasto_id"
          required
        >
          <OpcionesDeGasto gastos={gastos} />
        </CampoSeleccion>

        <CampoTexto
          etiqueta={t("panel.presupuesto.pagos.campoImporte")}
          ayuda={t("panel.presupuesto.pagos.campoImporteAyuda")}
          name="importe"
          type="text"
          inputMode="decimal"
          required
        />

        <CampoTexto
          etiqueta={t("panel.presupuesto.pagos.campoVencimiento")}
          ayuda={t("panel.presupuesto.pagos.campoVencimientoAyuda")}
          name="fecha_vencimiento"
          type="date"
          required
        />

        <CampoSeleccion etiqueta={t("panel.presupuesto.pagos.campoMetodo")} name="metodo">
          <OpcionesDeMetodo />
        </CampoSeleccion>

        <CamposDePagador />

        <CampoTextoLargo
          etiqueta={t("panel.presupuesto.pagos.campoNotas")}
          name="notas"
          rows={2}
          maxLength={2000}
        />

        <div className="sm:col-span-2">
          <Boton type="submit">{t("panel.presupuesto.pagos.crear")}</Boton>
        </div>
      </form>
    </section>
  );
}
