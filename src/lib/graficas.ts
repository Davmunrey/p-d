import { IDIOMA, ZONA_HORARIA } from "@/config/constants";

/**
 * BODA-63 (#49) · LAS CUENTAS DE LAS GRÁFICAS
 *
 * Aparte de las pantallas y sin tocar la base: entra lo que ya leyó el módulo
 * de presupuesto y salen listas listas para dibujar. Está suelto por dos
 * razones, y la segunda es la de peso:
 *
 * 1 · Se puede probar. Un porcentaje mal calculado dentro de un `<svg>` no lo
 *     caza ningún test razonable; aquí es una función que se llama con tres
 *     números y se comprueba el resultado.
 *
 * 2 · LA GRÁFICA Y SU TABLA SALEN DE LO MISMO. El ticket pide que toda gráfica
 *     lleve su tabla equivalente, y «equivalente» es la palabra: si la barra la
 *     calculara el `<svg>` y la tabla se escribiera aparte, un día dirían cosas
 *     distintas y quien usa lector de pantalla leería la que está mal.
 */

/** Una categoría en el reparto: cuánto se lleva y qué parte del total es. */
export interface ParteDelGasto {
  categoria: string;
  importe: number;
  /** De 0 a 100. Con un total de cero, cero — no `NaN`. */
  porcentaje: number;
}

/**
 * El reparto del gasto por categoría, de la que más se lleva a la que menos.
 *
 * ORDENADO POR IMPORTE Y NO POR EL ORDEN DEL PRESUPUESTO. Son dos preguntas
 * distintas: la pantalla del presupuesto lista las categorías como se
 * organizan, y aquí se pregunta «¿en qué se nos va el dinero?», que se contesta
 * mirando la barra más larga.
 *
 * LAS CATEGORÍAS A CERO NO SALEN. Una barra de longitud cero con su rótulo
 * ocupa el mismo sitio que una de verdad y no dice nada; lo que hace es alargar
 * la gráfica hasta que hay que desplazarse para ver las que sí importan.
 */
export function repartoPorCategoria(
  categorias: { categoria: string; real: number }[],
): ParteDelGasto[] {
  const total = categorias.reduce((suma, fila) => suma + fila.real, 0);

  return categorias
    .filter((fila) => fila.real > 0)
    .map((fila) => ({
      categoria: fila.categoria,
      importe: fila.real,
      // Sin total no hay porcentaje que valga: dividir daría `NaN` y el `<svg>`
      // pintaría una barra de anchura «NaN», que es un fallo mudo.
      porcentaje: total > 0 ? (fila.real / total) * 100 : 0,
    }))
    .sort((a, b) => b.importe - a.importe);
}

export interface MesDelGasto {
  /** `2026-03`, que es lo que ordena. */
  clave: string;
  /** `marzo de 2026`, que es lo que se lee. */
  etiqueta: string;
  /** Lo pagado ese mes. */
  importe: number;
  /** Lo pagado desde el principio hasta el final de ese mes. */
  acumulado: number;
}

const formatoMes = new Intl.DateTimeFormat(IDIOMA, {
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

/**
 * La evolución de lo gastado, mes a mes y acumulada.
 *
 * SÓLO LO PAGADO DE VERDAD. Un gasto estimado no tiene fecha en la que ocurrió:
 * tiene una fecha en la que vence, que es otra cosa. La curva de «cuánto
 * llevamos gastado» se dibuja con dinero que ha salido de la cuenta, y eso es
 * `pagado_en`.
 *
 * LOS MESES SIN NINGÚN PAGO NO SE RELLENAN. Es una decisión y tiene su contra:
 * la línea se dibuja entre dos puntos separados por tres meses como si hubiera
 * subido despacio, cuando en realidad no se movió y luego dio un salto. A
 * cambio, no hay que inventar meses que no existen en los datos — y como lo que
 * se enseña son barras acumuladas y no una línea recta entre puntos, el hueco
 * se ve por lo que es: la barra no crece.
 *
 * EL MES SE CALCULA EN LA ZONA DE LA BODA. Un pago del 1 de marzo a las 00:30
 * en Madrid es del 28 de febrero en UTC, y con el corte de mes justo ahí la
 * cifra salta de una barra a otra.
 */
export function evolucionMensual(
  pagos: { importe: number; pagadoEn: string | null }[],
): MesDelGasto[] {
  const porMes = new Map<string, number>();

  for (const pago of pagos) {
    if (!pago.pagadoEn) continue;

    const fecha = new Date(pago.pagadoEn);
    if (Number.isNaN(fecha.getTime())) continue;

    /*
      `en-CA` da `2026-03-04`, que es la única forma corta que ordena bien como
      texto. Se recorta a `2026-03` y ése es el mes, ya en la zona de la boda.
    */
    const clave = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: ZONA_HORARIA,
    })
      .format(fecha)
      .slice(0, 7);

    porMes.set(clave, (porMes.get(clave) ?? 0) + pago.importe);
  }

  let acumulado = 0;

  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, importe]) => {
      acumulado += importe;
      return {
        clave,
        // El día 15 y no el 1: al mediodía, ningún cambio de hora ni ninguna
        // zona horaria puede empujar la fecha al mes de al lado.
        etiqueta: formatoMes.format(new Date(`${clave}-15T12:00:00Z`)),
        importe,
        acumulado,
      };
    });
}

/**
 * Cuánto ocupa una barra, de 0 a 1, respecto a la mayor de su gráfica.
 *
 * SE ESCALA CONTRA EL MÁXIMO Y NO CONTRA EL TOTAL, porque lo que se compara son
 * las barras entre sí. Escalar contra el total dejaría todas diminutas en
 * cuanto hubiera muchas categorías, que es justo cuando hace falta compararlas.
 */
export function proporcion(valor: number, maximo: number): number {
  if (maximo <= 0) return 0;
  // Se recorta a 1: un real por encima del máximo de su propia gráfica no
  // puede existir, pero si existiera saldría dibujado fuera del lienzo.
  return Math.min(Math.max(valor / maximo, 0), 1);
}
