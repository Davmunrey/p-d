import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AccionArriba } from "@/components/panel/accion-arriba";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { BotonEnlace } from "@/components/ui/boton";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  LARGOS_DE_CAMPO,
  IDIOMA,
  RUTA_ACCESO,
  RUTA_PAGOS,
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
import { formateadorDeImporte, importeParaCampo } from "@/lib/importe";
import { accesoActual } from "@/lib/sesion";

import { borrarPago, crearPago, editarPago, marcarPagado } from "./acciones";
import { AvisoPagos } from "./aviso";
import { ANCLA_ALTA_PAGO, anclaDePago, DESDE_EL_ALTA } from "./estado";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.presupuesto.pagos.titulo") };

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

/**
 * «Octubre de 2026», con la mayúscula sólo en la primera letra. El `capitalize`
 * de CSS ponía una en cada palabra —«Octubre De 2026»—, que en castellano está
 * mal: la preposición va en minúscula.
 */
function mayusculaInicial(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase(IDIOMA) + texto.slice(1);
}

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

  /*
    EL AVISO VA DONDE SE HIZO LA ACCIÓN: en el pago que se tocó o en el alta,
    que está al final. Arriba sólo si no se sabe, o si el pago ya no está.
  */
  const delPago = soloTexto(consulta.pago) || editando;
  const enUnPago = pagos.some((pago) => pago.id === delPago) ? delPago : "";
  // Preguntar si se borra algo que ya no está sería preguntar al vacío.
  const yaNoEsta = estado === "confirmar-borrado" && Boolean(delPago) && !enUnPago;
  const aviso = <AvisoPagos estado={yaNoEsta ? "no-existe" : estado} queda={queda} />;
  const enElAlta =
    soloTexto(consulta.desde) === DESDE_EL_ALTA.desde && puedeEditar && gastos.length > 0;
  const confirmando = estado === "confirmar-borrado" ? enUnPago : "";
  const contexto = { gastos, puedeEditar, editando, euros, enUnPago, aviso, confirmando };

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.presupuesto.pagos.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.presupuesto.pagos.descripcion")}</Cuerpo>
      </header>

      {/* Sin gastos, en el sitio del alta va la frase que pide apuntar uno:
          el botón no saltaría a ninguna parte. */}
      {puedeEditar && gastos.length > 0 ? (
        <AccionArriba ancla={ANCLA_ALTA_PAGO}>
          {t("panel.presupuesto.pagos.nuevaTitulo")}
        </AccionArriba>
      ) : null}

      {enUnPago || enElAlta ? null : aviso}

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
              <Lista pagos={vencidos} {...contexto} />
            </section>
          ) : null}

          {[...porMes(proximos)].map(([mes, delMes]) => (
            <section key={mes} className="mt-bloque">
              <Titulo3 como="h2" className="border-b border-borde pb-linea">
                {mayusculaInicial(formatoMes.format(comoDia(`${mes}-01`)))}
              </Titulo3>
              <Lista pagos={delMes} {...contexto} />
            </section>
          ))}

          {pagados.length > 0 ? (
            <section className="mt-bloque">
              <Titulo3 como="h2" className="border-b border-borde pb-linea">
                {t("panel.presupuesto.pagos.pagadosTitulo")}
              </Titulo3>
              <Lista pagos={pagados} {...contexto} />
            </section>
          ) : null}
        </>
      )}

      {puedeEditar ? <Alta gastos={gastos} aviso={enElAlta ? aviso : null} /> : null}
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
  enUnPago,
  aviso,
  confirmando,
}: {
  pagos: Pago[];
  gastos: GastoParaPagar[];
  puedeEditar: boolean;
  editando: string;
  euros: ((valor: number) => string) | null;
  /** El pago al que vuelve la última acción: su aviso se pinta en él. */
  enUnPago: string;
  aviso: ReactNode;
  /** El pago cuyo borrado se está preguntando. */
  confirmando: string;
}) {
  return (
    <ul className="mt-elemento grid gap-interno">
      {pagos.map((pago) => (
        <li
          key={pago.id}
          id={anclaDePago(pago.id)}
          className="scroll-mt-elemento rounded-tarjeta border border-borde bg-superficie p-interno"
        >
          {puedeEditar && editando === pago.id ? (
            <Edicion pago={pago} gastos={gastos} />
          ) : (
            <Fila
              pago={pago}
              puedeEditar={puedeEditar}
              euros={euros}
              confirmando={confirmando === pago.id}
            />
          )}
          {enUnPago === pago.id ? aviso : null}
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
  confirmando,
}: {
  pago: Pago;
  puedeEditar: boolean;
  euros: ((valor: number) => string) | null;
  confirmando: boolean;
}) {
  return (
    <>
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
                <BotonEnvio jerarquia={pago.pagadoEn ? "terciario" : "secundario"}>
                  {pago.pagadoEn
                    ? t("panel.presupuesto.pagos.deshacerPago")
                    : t("panel.presupuesto.pagos.marcarPagado")}
                </BotonEnvio>
              </form>

              <BotonEnlace
                href={`${RUTA_PAGOS}?editar=${pago.id}#pago-${pago.id}`}
                jerarquia="terciario"
              >
                {t("panel.presupuesto.pagos.editar")}
              </BotonEnlace>

              <form action={borrarPago}>
                <input type="hidden" name="id" value={pago.id} />
                {/*
                El segundo paso del borrado: el mismo formulario, ahora con la
                confirmación dentro. No hay dos caminos que puedan discrepar.
              */}
                {confirmando ? <input type="hidden" name="confirmar" value="si" /> : null}
                <BotonEnvio jerarquia={confirmando ? "secundario" : "terciario"}>
                  {confirmando
                    ? t("panel.presupuesto.pagos.confirmarBorrado")
                    : t("panel.presupuesto.pagos.borrar")}
                </BotonEnvio>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      {/*
      LA PREGUNTA VA EN EL PAGO, JUNTO AL BOTÓN QUE LA CONTESTA, y con su
      salida: quien pulsó «Borrar» sin querer tiene que poder irse sin tocarlo.
    */}
      {puedeEditar && confirmando ? (
        <p
          role="alert"
          className="mt-elemento flex flex-wrap items-baseline gap-x-interno gap-y-linea rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {t("panel.presupuesto.pagos.avisoConfirmarBorrado")}
          <Enlace href={`${RUTA_PAGOS}#${anclaDePago(pago.id)}`}>
            {t("panel.presupuesto.pagos.noBorrar")}
          </Enlace>
        </p>
      ) : null}
    </>
  );
}

/**
 * LAS OPCIONES DEL DESPLEGABLE DE GASTOS, AGRUPADAS POR SU CATEGORÍA.
 *
 * Venían por orden de concepto con la categoría delante —«Fotografía · …,
 * Banquete · …, Fotografía · …»—, y lo primero que se lee no era lo que
 * ordenaba. Cada categoría es un `optgroup` y dentro van por concepto.
 */
function OpcionesDeGasto({ gastos }: { gastos: GastoParaPagar[] }) {
  const porCategoria = new Map<string, GastoParaPagar[]>();
  const ordenados = [...gastos].sort(
    (uno, otro) =>
      uno.categoria.localeCompare(otro.categoria, IDIOMA) ||
      uno.concepto.localeCompare(otro.concepto, IDIOMA),
  );
  for (const gasto of ordenados) {
    porCategoria.set(gasto.categoria, [...(porCategoria.get(gasto.categoria) ?? []), gasto]);
  }

  return (
    <>
      {[...porCategoria].map(([categoria, suyos]) => (
        <optgroup
          key={categoria}
          label={categoria || t("panel.presupuesto.pagos.sinCategoria")}
        >
          {suyos.map((gasto) => (
            <option key={gasto.id} value={gasto.id}>
              {gasto.concepto}
            </option>
          ))}
        </optgroup>
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
        maxLength={LARGOS_DE_CAMPO["pagos.paga_detalle"]}
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
          defaultValue={importeParaCampo(pago.importe)}
        />

        <CampoTexto
          etiqueta={t("panel.presupuesto.pagos.campoVencimiento")}
          name="fecha_vencimiento"
          type="date"
          required
          defaultValue={pago.fechaVencimiento}
        />

        <CampoTexto
          etiqueta={t("panel.presupuesto.pagos.campoPagadoEn")}
          ayuda={t("panel.presupuesto.pagos.campoPagadoEnAyuda")}
          name="pagado_en"
          type="date"
          defaultValue={pago.pagadoEn ?? ""}
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
          maxLength={LARGOS_DE_CAMPO["pagos.notas"]}
          defaultValue={pago.notas ?? ""}
        />

        <div className="flex flex-wrap items-baseline gap-interno sm:col-span-2">
          <BotonEnvio jerarquia="secundario">{t("panel.presupuesto.pagos.guardar")}</BotonEnvio>
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

function Alta({ gastos, aviso }: { gastos: GastoParaPagar[]; aviso: ReactNode }) {
  if (gastos.length === 0) {
    return (
      <Cuerpo className="mt-bloque max-w-texto">
        {t("panel.presupuesto.pagos.sinGastos")}
      </Cuerpo>
    );
  }

  return (
    <section
      id={ANCLA_ALTA_PAGO}
      className="mt-bloque scroll-mt-elemento rounded-tarjeta border border-borde p-interno"
    >
      <Titulo3 como="h2">{t("panel.presupuesto.pagos.nuevaTitulo")}</Titulo3>
      <Etiqueta className="mt-pila block">{t("panel.presupuesto.pagos.nuevaAyuda")}</Etiqueta>

      {aviso}

      <form action={crearPago} className="mt-elemento grid gap-interno sm:grid-cols-2">
        {/*
          SIN NINGÚN GASTO ELEGIDO DE ANTEMANO. El primero de la lista venía
          marcado, y un pago apuntado sin tocar este campo se colgaba de un
          gasto que nadie había elegido.
        */}
        <CampoSeleccion
          etiqueta={t("panel.presupuesto.pagos.campoGasto")}
          name="gasto_id"
          required
          defaultValue=""
        >
          <option value="">{t("panel.presupuesto.pagos.elegirGasto")}</option>
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

        <CampoTexto
          etiqueta={t("panel.presupuesto.pagos.campoPagadoEnAlta")}
          ayuda={t("panel.presupuesto.pagos.campoPagadoEnAltaAyuda")}
          name="pagado_en"
          type="date"
        />

        <CampoSeleccion etiqueta={t("panel.presupuesto.pagos.campoMetodo")} name="metodo">
          <OpcionesDeMetodo />
        </CampoSeleccion>

        <CamposDePagador />

        <CampoTextoLargo
          etiqueta={t("panel.presupuesto.pagos.campoNotas")}
          name="notas"
          rows={2}
          maxLength={LARGOS_DE_CAMPO["pagos.notas"]}
        />

        <div className="sm:col-span-2">
          <BotonEnvio>{t("panel.presupuesto.pagos.crear")}</BotonEnvio>
        </div>
      </form>
    </section>
  );
}
