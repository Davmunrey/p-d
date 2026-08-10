import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-62 · LOS PAGOS Y SUS VENCIMIENTOS
 *
 * LO QUE SE OLVIDA NO ES EL IMPORTE, ES LA FECHA. Los proveedores de boda
 * cobran a plazos —señal, un pago intermedio y el resto la semana antes— y el
 * importe total de la partida no dice nada de cuándo hay que tenerlo. Por eso
 * `pagos` existe aparte y por eso la pantalla de este módulo es un calendario y
 * no una lista.
 *
 * «VENCIDO» LO DICE LA BASE, en `v_pagos`, comparando con SU fecha. Calcularlo
 * en el navegador es preguntárselo a un reloj que puede estar mal puesto o en
 * otro huso: un pago que aparece vencido un día antes —o un día después— no
 * sirve para lo único que tiene que servir.
 *
 * LOS IMPORTES SON `numeric` DE PRINCIPIO A FIN. PostgREST los serializa como
 * cadena a propósito, para no perder precisión antes de que nadie los mire, y
 * aquí se convierten una sola vez y en el borde.
 */

export const PAGADORES = ["novia", "novio", "ambos", "otros"] as const;

export type Pagador = (typeof PAGADORES)[number];

export function esPagador(valor: string): valor is Pagador {
  return (PAGADORES as readonly string[]).includes(valor);
}

/**
 * Las formas de pagar, tal y como las declara el enumerado `metodo_pago`.
 *
 * Se escriben aquí porque un desplegable las necesita en el navegador y la base
 * no las manda solas. Que se salgan de la lista lo impide el tipo: escribir
 * «paypal» no da un campo raro, da un error de la base. Por eso el desplegable
 * es un desplegable y no un campo de texto — un texto libre contra una columna
 * de enumerado sólo puede fallar.
 */
export const METODOS_PAGO = [
  "transferencia",
  "tarjeta",
  "efectivo",
  "bizum",
  "domiciliacion",
  "otro",
] as const;

export type MetodoPago = (typeof METODOS_PAGO)[number];

export function esMetodoPago(valor: string): valor is MetodoPago {
  return (METODOS_PAGO as readonly string[]).includes(valor);
}

export interface Pago {
  id: string;
  gastoId: string;
  concepto: string;
  categoriaId: string;
  categoria: string;
  proveedor: string | null;
  importe: number;
  fechaVencimiento: string;
  /** `null` mientras está pendiente. Su presencia es lo que lo marca hecho. */
  pagadoEn: string | null;
  metodo: string | null;
  /** `null` es «todavía no se ha decidido», que es un estado de verdad. */
  paga: Pagador | null;
  pagaDetalle: string | null;
  notas: string | null;
  vencido: boolean;
}

function aImporte(valor: string | number | null): number {
  if (valor === null) return 0;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

interface FilaPago {
  id: string;
  partida_id: string;
  concepto: string;
  categoria_id: string;
  categoria: string;
  proveedor: string | null;
  importe: string | number;
  fecha_vencimiento: string;
  pagado_en: string | null;
  metodo: string | null;
  paga: string | null;
  paga_detalle: string | null;
  notas: string | null;
  vencido: boolean;
}

const CAMPOS =
  "id, partida_id, concepto, categoria_id, categoria, proveedor, importe, fecha_vencimiento, pagado_en, metodo, paga, paga_detalle, notas, vencido";

function aPago(fila: FilaPago): Pago {
  return {
    id: fila.id,
    gastoId: fila.partida_id,
    concepto: fila.concepto,
    categoriaId: fila.categoria_id,
    categoria: fila.categoria,
    proveedor: fila.proveedor,
    importe: aImporte(fila.importe),
    fechaVencimiento: fila.fecha_vencimiento,
    pagadoEn: fila.pagado_en,
    metodo: fila.metodo,
    paga: fila.paga && esPagador(fila.paga) ? fila.paga : null,
    pagaDetalle: fila.paga_detalle,
    notas: fila.notas,
    vencido: fila.vencido,
  };
}

/**
 * Todos los pagos, del más próximo al más lejano.
 *
 * SE PIDEN LOS PAGADOS TAMBIÉN, y no sólo lo que falta: sin ellos no se puede
 * deshacer un «pagado» marcado por error, y ese error se comete —se marca la
 * fila de al lado— justo el día que se están apuntando cinco seguidos.
 */
export async function obtenerPagos(): Promise<Pago[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_pagos")
    .select(CAMPOS)
    .order("fecha_vencimiento");

  if (error) {
    console.error("No se pudieron leer los pagos:", error);
    return [];
  }

  return ((data as unknown as FilaPago[] | null) ?? []).map(aPago);
}

/**
 * LO QUE QUEDA POR PAGAR DE UN GASTO.
 *
 * El tope es el acordado cuando lo hay y el estimado mientras no — el mismo
 * criterio con el que `v_resumen_presupuesto` calcula la desviación y con el que
 * el trigger `pagos_dentro_del_gasto` decide si un pago cabe. Tres sitios y un
 * solo criterio: en cuanto sean dos, la pantalla dirá que caben 200 € y la base
 * los rechazará.
 *
 * SE DEVUELVE `null` CUANDO NO HAY TOPE. Un gasto sin estimar todavía admite su
 * señal —se paga antes de saber el total— y ahí «lo que queda» no es cero, es
 * una pregunta sin respuesta. Cero significaría «no cabe nada», que es lo
 * contrario.
 */
export interface GastoParaPagar {
  id: string;
  concepto: string;
  categoria: string;
  tope: number | null;
  apuntado: number;
  /** `null` si el gasto no tiene tope contra el que comparar. */
  queda: number | null;
}

interface FilaGastoPagable {
  id: string;
  concepto: string;
  importe_estimado: string | number;
  importe_real: string | number | null;
  categorias_presupuesto: { nombre: string } | null;
  pagos: { importe: string | number }[] | null;
}

/**
 * Los gastos con lo que llevan pagado, para el desplegable del alta y para
 * poder avisar antes de guardar.
 *
 * Los pagos vienen embebidos en la misma consulta: pedirlos gasto a gasto son
 * cuarenta viajes para pintar un desplegable.
 */
export async function obtenerGastosParaPagar(): Promise<GastoParaPagar[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("partidas_presupuesto")
    .select(
      "id, concepto, importe_estimado, importe_real, categorias_presupuesto(nombre), pagos(importe)",
    )
    .order("concepto");

  if (error) {
    console.error("No se pudieron leer los gastos para pagar:", error);
    return [];
  }

  return ((data as unknown as FilaGastoPagable[] | null) ?? []).map((fila) => {
    const real = fila.importe_real === null ? null : aImporte(fila.importe_real);
    const bruto = real ?? aImporte(fila.importe_estimado);
    const tope = bruto > 0 ? bruto : null;
    const apuntado = (fila.pagos ?? []).reduce(
      (suma, pago) => suma + aImporte(pago.importe),
      0,
    );

    return {
      id: fila.id,
      concepto: fila.concepto,
      categoria: fila.categorias_presupuesto?.nombre ?? "",
      tope,
      apuntado,
      // Redondeado al céntimo: `apuntado` es una suma de coma flotante y
      // «399,99999999999994 €» en un aviso de dinero no lo lee nadie.
      queda: tope === null ? null : Math.round((tope - apuntado) * 100) / 100,
    };
  });
}

/** Lo pagado y lo que falta, para la cabecera de la pantalla. */
export interface TotalesPagos {
  pagado: number;
  pendiente: number;
  vencido: number;
}

export function totalesDe(pagos: Pago[]): TotalesPagos {
  return pagos.reduce(
    (suma, pago) => ({
      pagado: suma.pagado + (pago.pagadoEn ? pago.importe : 0),
      pendiente: suma.pendiente + (pago.pagadoEn ? 0 : pago.importe),
      vencido: suma.vencido + (pago.vencido ? pago.importe : 0),
    }),
    { pagado: 0, pendiente: 0, vencido: 0 },
  );
}

/**
 * Los pagos pendientes repartidos por mes, en orden.
 *
 * ES UN CALENDARIO Y NO UNA LISTA porque la pregunta es «¿qué me viene encima
 * este mes?». Una lista de treinta vencimientos seguidos obliga a leer fechas
 * una a una para contestarla.
 *
 * La clave es `AAAA-MM` y sale de recortar la fecha, no de construir un `Date`:
 * `new Date("2027-06-12")` se interpreta en UTC y en España, en junio, eso
 * devuelve el mes anterior para los días 1 a primera hora. Un pago que salta de
 * mes en el calendario es exactamente el fallo que este módulo existe para
 * evitar.
 */
export function porMes(pagos: Pago[]): Map<string, Pago[]> {
  const meses = new Map<string, Pago[]>();
  for (const pago of pagos) {
    const mes = pago.fechaVencimiento.slice(0, 7);
    const suyos = meses.get(mes);
    if (suyos) suyos.push(pago);
    else meses.set(mes, [pago]);
  }
  return meses;
}
