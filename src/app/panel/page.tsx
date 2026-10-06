import type { Metadata } from "next";
import { AvisoDesvios } from "@/components/panel/aviso-desvios";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  DIAS_VENCE_PRONTO,
  IDIOMA,
  LIMITE_PROXIMOS_PORTADA,
  RUTA_INVITADOS,
  RUTA_PAGOS,
  RUTA_PRESUPUESTO,
  RUTA_TAREAS,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import { obtenerPagos, type Pago } from "@/lib/bbdd/pagos";
import {
  desviosDe,
  obtenerResumenPresupuesto,
  totalesDelPresupuesto,
  type ResumenCategoria,
} from "@/lib/bbdd/presupuesto";
import { obtenerResumen, type ResumenBoda } from "@/lib/bbdd/resumen";
import { ESTADO_HECHA, estaVencida, obtenerTareas, type Tarea } from "@/lib/bbdd/tareas";
import { t } from "@/lib/copy";
import { formateadorDeImporte } from "@/lib/importe";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.resumen.titulo") };

/**
 * BODA-43 · RESUMEN — la portada del panel
 *
 * Lo primero que se ve al entrar, así que contesta de un vistazo a las tres
 * preguntas del ticket: cuánta gente ha contestado, cuánto llevamos gastado y
 * qué se nos echa encima.
 *
 * LAS DOS ÚLTIMAS FALTABAN. La portada se quedó en invitados, logística y
 * cocina, y para saber cuánto quedaba por pagar o qué tarea vencía el jueves
 * había que abrir dos módulos. Ahora están aquí, con un enlace a cada uno.
 *
 * LOS NÚMEROS SON DE VERDAD. Salen de `v_estadisticas_invitados` y
 * `v_menus_confirmados`, dos vistas que llevaban desde el primer día en la base
 * sin que nadie las consultara. Antes esta pantalla decía «aquí irán los
 * números de la boda», que es exactamente el tipo de promesa que la regla 3 no
 * permite dejar en pie.
 *
 * NO SE CACHEA: cambia cada vez que alguien contesta, y un panel que enseña
 * cifras de hace una hora es peor que uno que no las enseña.
 *
 * El acceso ya lo ha comprobado el layout: aquí no se repite.
 */
export const dynamic = "force-dynamic";

const formatoNumero = new Intl.NumberFormat(IDIOMA);

/** Días que faltan, contados por fecha y no restando milisegundos. */
/** La lectura de la configuración falló: distinto de que no haya. */
const SIN_LEER = "sin-leer" as const;

function diasHasta(fecha: Date): number {
  const enZona = (instante: Date) =>
    new Date(
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: ZONA_HORARIA,
      }).format(instante),
    );

  const hoy = enZona(new Date());
  const dia = enZona(fecha);
  return Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
}

export default async function PaginaResumen() {
  const [configuracion, resumen, presupuesto, moneda, pagos, tareas] = await Promise.all([
    /*
      «NO SE PUDO LEER» NO ES «NO HAY». La fecha es obligatoria en la base, así
      que un `null` aquí sólo podía ser una lectura fallida, y la portada decía
      «Sin fecha todavía» de una boda que la tiene.
    */
    obtenerConfiguracion().catch(() => SIN_LEER),
    obtenerResumen(),
    obtenerResumenPresupuesto(),
    obtenerMonedaBoda(),
    obtenerPagos(),
    obtenerTareas(),
  ]);

  const desvios = desviosDe(presupuesto);
  const euros = moneda ? formateadorDeImporte(moneda) : null;

  const dias =
    configuracion && configuracion !== SIN_LEER
      ? diasHasta(configuracion.fechaCeremonia)
      : null;

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.resumen.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.resumen.descripcion")}</Cuerpo>
        <p className="mt-pila font-titulo text-titulo-3 text-tinta-marca">
          {configuracion === SIN_LEER
            ? t("panel.resumen.fechaSinLeer")
            : dias === null
              ? t("panel.resumen.sinFecha")
              : dias === 1
                ? t("panel.resumen.faltaUno")
                : dias > 0
                  ? t("panel.resumen.faltan", { dias: formatoNumero.format(dias) })
                  : dias === 0
                    ? t("panel.resumen.esHoy")
                    : t("panel.resumen.yaFue")}
        </p>
      </header>

      {/*
        EL AVISO VA ANTES QUE LAS CIFRAS, y no al final con lo demás. Todo lo
        que hay debajo es información —cuántos vienen, cuántos faltan—; esto es
        lo único de la pantalla sobre lo que hay que hacer algo, y ponerlo tras
        cuatro bloques de números es enterrarlo.
      */}
      <AvisoDesvios desvios={desvios} />

      {/*
        Y LO QUE VENCE, JUSTO DETRÁS: es lo otro de la portada que pide hacer
        algo. Los números van después.
      */}
      <Proximo pagos={pagos} tareas={tareas} euros={euros} />

      {resumen.invitados.personas === 0 ? (
        <>
          <section>
            <Cuerpo className="max-w-texto">{t("panel.resumen.sinInvitados")}</Cuerpo>
            <EnlaceSuave href={RUTA_INVITADOS} className="mt-pila">
              {t("panel.resumen.irAInvitados")}
            </EnlaceSuave>
          </section>
          <Presupuesto resumen={presupuesto} euros={euros} />
        </>
      ) : (
        <>
          <Bloque
            titulo={t("panel.resumen.bloqueInvitados")}
            pie={t("panel.resumen.respuesta", {
              contestados: formatoNumero.format(contestados(resumen)),
              personas: formatoNumero.format(resumen.invitados.personas),
              porcentaje: formatoPorcentaje.format(
                contestados(resumen) / resumen.invitados.personas,
              ),
            })}
          >
            <Cifra rotulo={t("panel.resumen.personas")} valor={resumen.invitados.personas} />
            <Cifra
              rotulo={t("panel.resumen.confirmados")}
              valor={resumen.invitados.confirmados}
              destacada
            />
            <Cifra
              rotulo={t("panel.resumen.pendientes")}
              valor={resumen.invitados.pendientes}
            />
            <Cifra
              rotulo={t("panel.resumen.rechazados")}
              valor={resumen.invitados.rechazados}
            />
          </Bloque>

          <Presupuesto resumen={presupuesto} euros={euros} />

          <Bloque titulo={t("panel.resumen.bloqueLogistica")}>
            {/*
              Adultos y niños se cuentan por `es_nino` y no por el tipo de menú:
              un menor puede llevar menú sin gluten, y contarlo por ahí
              descuadraría tronas, autobús y espacio infantil a la vez.
            */}
            <Cifra
              rotulo={t("panel.resumen.adultos")}
              valor={resumen.invitados.adultosConfirmados}
            />
            <Cifra
              rotulo={t("panel.resumen.ninos")}
              valor={resumen.invitados.ninosConfirmados}
            />
            <Cifra
              rotulo={t("panel.resumen.autobus")}
              valor={resumen.invitados.plazasAutobus}
            />
            {/*
              NO HAY CIFRA DE ALOJAMIENTO, a propósito. El RSVP no lo pregunta,
              así que la base guarda `false` para todo el que viene y la cifra
              salía «0» como si fuera una respuesta. Volverá el día que el
              formulario pregunte: un dato que nadie ha dado no se enseña.
            */}
          </Bloque>

          <Menus menus={resumen.menus} />
        </>
      )}
    </div>
  );
}

/** Quien ya ha dicho algo, sí o no: lo que falta por saber es el resto. */
function contestados(resumen: ResumenBoda): number {
  return resumen.invitados.confirmados + resumen.invitados.rechazados;
}

/*
  HACIA ABAJO, NUNCA HACIA ARRIBA: con 199 de 200, redondeando decía «el
  100 %» justo cuando los novios miran si falta alguien.
*/
const formatoPorcentaje = new Intl.NumberFormat(IDIOMA, {
  style: "percent",
  maximumFractionDigits: 0,
  roundingMode: "floor",
});

function Bloque({
  titulo,
  pie,
  children,
}: {
  titulo: string;
  /** Una frase bajo las cifras, para lo que no es una cifra suelta. */
  pie?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <Titulo3 como="h2">{titulo}</Titulo3>
      {/*
        DOS POR FILA DESDE EL MÓVIL. Son números cortos: uno por fila convertía
        el resumen en diez tarjetas apiladas, cada una a todo lo ancho para
        enseñar dos cifras.
      */}
      <dl className="mt-pila grid grid-cols-2 gap-interno lg:grid-cols-4">{children}</dl>
      {pie ? <Cuerpo className="mt-pila text-pequeno text-tinta-suave">{pie}</Cuerpo> : null}
    </section>
  );
}

/**
 * Una cifra con su rótulo. `dt`/`dd` y no dos `div`: es una lista de
 * definiciones —término y valor—, y así un lector de pantalla los lee
 * emparejados en lugar de recitar ocho números sueltos.
 */
function Cifra({
  rotulo,
  valor,
  destacada = false,
}: {
  rotulo: string;
  /** Un número se escribe aquí; un importe llega ya escrito, con su moneda. */
  valor: number | string;
  destacada?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-tarjeta border border-borde p-interno">
      <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">{rotulo}</dt>
      {/*
        SIN `tabular-nums`, Y ES A PROPÓSITO. En la letra de títulos las cifras
        tabulares son las de estilo antiguo —el 1 como una I versalita, el 3 y
        el 9 colgando bajo la línea—, y «139» parecía «I 39». Las de por defecto
        ya son de caja alta, y en una cifra suelta no hay columna que alinear.
        `mt-auto`: si el rótulo ocupa dos líneas, la cifra se queda abajo, a la
        altura de las de al lado.
      */}
      <dd
        className={`mt-auto pt-linea font-titulo ${
          typeof valor === "string" ? "text-titulo-3" : "text-titulo-2"
        } ${destacada ? "text-tinta-marca" : "text-tinta"}`}
      >
        {typeof valor === "string" ? valor : formatoNumero.format(valor)}
      </dd>
    </div>
  );
}

function Menus({ menus }: { menus: ResumenBoda["menus"] }) {
  return (
    <section>
      <Titulo3 como="h2">{t("panel.resumen.bloqueCocina")}</Titulo3>
      {menus.length === 0 ? (
        <Cuerpo className="mt-pila max-w-texto">{t("panel.resumen.sinMenus")}</Cuerpo>
      ) : (
        <dl className="mt-pila grid grid-cols-2 gap-interno lg:grid-cols-3">
          {menus.map((menu) => (
            <div key={menu.tipoMenu} className="rounded-tarjeta border border-borde p-interno">
              <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
                {t(`panel.menus.${menu.tipoMenu}` as "panel.menus.estandar")}
              </dt>
              {/*
                La nota de alergias vive DENTRO del dd, no como tercer hijo del
                grupo: un <dl> solo admite pares dt/dd (axe: definition-list), y
                además las alergias son parte de la definición del menú, no un
                dato suelto.
              */}
              <dd className="mt-linea">
                <span className="block font-titulo text-titulo-2 text-tinta">
                  {formatoNumero.format(menu.personas)}
                </span>
                {menu.conAlergias > 0 ? (
                  <Etiqueta className="mt-linea">
                    {t("panel.resumen.conAlergias", {
                      cuantas: formatoNumero.format(menu.conAlergias),
                    })}
                  </Etiqueta>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * CUÁNTO LLEVAMOS GASTADO, con las mismas cuatro cifras —y el mismo ayudante—
 * que la fila del total del presupuesto: si las dos pantallas sumaran cada una
 * a su manera, acabarían discrepando para la misma boda.
 *
 * SIN MONEDA NO HAY IMPORTES, como en el presupuesto: un «21.400» a secas
 * invita a leerlo en euros. Y sin categorías se dice que no hay presupuesto,
 * con el camino para empezarlo, en vez de cuatro ceros que parecen una boda
 * gratis.
 */
function Presupuesto({
  resumen,
  euros,
}: {
  resumen: ResumenCategoria[];
  euros: ((importe: number) => string) | null;
}) {
  /*
    Sin moneda no se pueden escribir los importes, pero el bloque no desaparece:
    callado, quedaba el aviso de «Ojo al presupuesto» encima y ninguna cifra ni
    enlace debajo. Se dice, y se deja la puerta al presupuesto.
  */
  if (!euros) {
    return (
      <section>
        <Titulo3 como="h2">{t("panel.resumen.bloquePresupuesto")}</Titulo3>
        <Cuerpo className="mt-pila max-w-texto">{t("panel.resumen.importesSinLeer")}</Cuerpo>
        <EnlaceSuave href={RUTA_PRESUPUESTO} className="mt-pila">
          {t("panel.resumen.desvios.verPresupuesto")}
        </EnlaceSuave>
      </section>
    );
  }

  if (resumen.length === 0) {
    return (
      <section>
        <Titulo3 como="h2">{t("panel.resumen.bloquePresupuesto")}</Titulo3>
        <Cuerpo className="mt-pila max-w-texto">{t("panel.resumen.sinPresupuesto")}</Cuerpo>
        <EnlaceSuave href={RUTA_PRESUPUESTO} className="mt-pila">
          {t("panel.resumen.desvios.verPresupuesto")}
        </EnlaceSuave>
      </section>
    );
  }

  const totales = totalesDelPresupuesto(resumen);
  return (
    <section>
      <Titulo3 como="h2">{t("panel.resumen.bloquePresupuesto")}</Titulo3>
      <dl className="mt-pila grid grid-cols-2 gap-interno lg:grid-cols-4">
        <Cifra rotulo={t("panel.resumen.previsto")} valor={euros(totales.previsto)} />
        <Cifra rotulo={t("panel.resumen.vaCostando")} valor={euros(totales.vaCostando)} />
        <Cifra rotulo={t("panel.resumen.pagado")} valor={euros(totales.pagado)} />
        <Cifra
          rotulo={t("panel.resumen.quedaPorPagar")}
          valor={euros(totales.quedaPorPagar)}
          destacada
        />
      </dl>
      <EnlaceSuave href={RUTA_PRESUPUESTO} className="mt-pila">
        {t("panel.resumen.desvios.verPresupuesto")}
      </EnlaceSuave>
    </section>
  );
}

/*
  Una fecha `YYYY-MM-DD` es un día del calendario, no un instante: se fija a
  mediodía UTC para que ningún huso de Europa la mueva al día de al lado.
*/
const formatoDia = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  timeZone: ZONA_HORARIA,
});
const elDia = (fecha: string) => formatoDia.format(new Date(`${fecha}T12:00:00Z`));

/**
 * QUÉ SE OS ECHA ENCIMA: los próximos pagos sin hacer y las tareas que vencen
 * esta semana —o que ya vencieron, que son las primeras—.
 *
 * Unas pocas de cada, con lo que sobra contado: es una lista para mirar de un
 * vistazo, y el calendario entero está a un enlace. Lo vencido va marcado con
 * palabra y no sólo con color.
 */
function Proximo({
  pagos,
  tareas,
  euros,
}: {
  pagos: Pago[];
  tareas: Tarea[];
  euros: ((importe: number) => string) | null;
}) {
  // Ya vienen del más próximo al más lejano, con los vencidos delante.
  const pendientes = pagos.filter((pago) => pago.pagadoEn === null);
  const deLaSemana = tareas
    .filter((tarea) => tarea.estado !== ESTADO_HECHA && tarea.diasParaVencer !== null)
    .filter((tarea) => tarea.diasParaVencer! <= DIAS_VENCE_PRONTO)
    .sort((a, b) => a.diasParaVencer! - b.diasParaVencer!);

  return (
    <section>
      <Titulo3 como="h2">{t("panel.resumen.bloqueProximo")}</Titulo3>
      <div className="mt-pila grid gap-elemento lg:grid-cols-2">
        <Lista
          titulo={t("panel.resumen.proximosPagos")}
          vacia={t("panel.resumen.sinPagos")}
          sobran={pendientes.length - LIMITE_PROXIMOS_PORTADA}
          enlace={{ href: RUTA_PAGOS, rotulo: t("panel.presupuesto.verPagos") }}
        >
          {pendientes.slice(0, LIMITE_PROXIMOS_PORTADA).map((pago) => (
            <li key={pago.id} className="grid gap-linea py-interno-compacto">
              <span className="flex flex-wrap items-baseline justify-between gap-interno-compacto">
                <span className="text-cuerpo text-tinta">{pago.concepto}</span>
                {euros ? (
                  <span className="text-cuerpo tabular-nums text-tinta">
                    {euros(pago.importe)}
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-baseline gap-interno-compacto text-pequeno text-tinta-suave">
                {elDia(pago.fechaVencimiento)}
                {pago.vencido ? (
                  <EtiquetaEstado variante="error-marcada" tamano="versalita-compacta">
                    {t("panel.presupuesto.pagos.vencido")}
                  </EtiquetaEstado>
                ) : null}
              </span>
            </li>
          ))}
        </Lista>

        <Lista
          titulo={t("panel.resumen.tareasSemana")}
          vacia={t("panel.resumen.sinTareas", { dias: DIAS_VENCE_PRONTO })}
          sobran={deLaSemana.length - LIMITE_PROXIMOS_PORTADA}
          enlace={{ href: RUTA_TAREAS, rotulo: t("panel.resumen.verTareas") }}
        >
          {deLaSemana.slice(0, LIMITE_PROXIMOS_PORTADA).map((tarea) => (
            <li key={tarea.id} className="grid gap-linea py-interno-compacto">
              <span className="text-cuerpo text-tinta">{tarea.titulo}</span>
              <span className="flex flex-wrap items-baseline gap-interno-compacto text-pequeno text-tinta-suave">
                {t("panel.tareas.para", { fecha: elDia(tarea.fechaLimite!) })}
                {estaVencida(tarea) ? (
                  <EtiquetaEstado variante="error-marcada" tamano="versalita-compacta">
                    {t("panel.tareas.vencida")}
                  </EtiquetaEstado>
                ) : tarea.diasParaVencer === 0 ? (
                  <EtiquetaEstado variante="aviso-marcada" tamano="versalita-compacta">
                    {t("panel.tareas.venceHoy")}
                  </EtiquetaEstado>
                ) : null}
              </span>
            </li>
          ))}
        </Lista>
      </div>
    </section>
  );
}

function Lista({
  titulo,
  vacia,
  sobran,
  enlace,
  children,
}: {
  titulo: string;
  vacia: string;
  /** Cuántas quedan fuera de la lista; cero o menos es que caben todas. */
  sobran: number;
  enlace: { href: string; rotulo: string };
  children: React.ReactNode[];
}) {
  return (
    <div className="rounded-tarjeta border border-borde p-interno">
      <h3 className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">{titulo}</h3>
      {children.length === 0 ? (
        <Cuerpo className="mt-linea text-pequeno text-tinta-suave">{vacia}</Cuerpo>
      ) : (
        <ul aria-label={titulo} className="mt-linea divide-y divide-borde">
          {children}
        </ul>
      )}
      {sobran > 0 ? (
        <Cuerpo className="mt-linea text-pequeno text-tinta-suave">
          {t("panel.resumen.yMas", { cuantos: formatoNumero.format(sobran) })}
        </Cuerpo>
      ) : null}
      <EnlaceSuave href={enlace.href} className="mt-pila">
        {enlace.rotulo}
      </EnlaceSuave>
    </div>
  );
}
