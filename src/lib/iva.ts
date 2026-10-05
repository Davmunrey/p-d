import { PORCENTAJE_IVA } from "@/config/constants";

/**
 * BODA-73 · PONER TRES PRESUPUESTOS EN LA MISMA BASE
 *
 * La mitad de los sustos de una boda son este booleano. Tres fotógrafos, tres
 * cifras, y uno la da sin IVA: comparadas a pelo, la suya parece la barata y es
 * la cara. Antes de ordenar nada hay que saber qué significa cada número.
 *
 * TRES RESPUESTAS Y NO DOS, que es lo que hace este módulo distinto de una
 * multiplicación suelta:
 *
 *   · lleva el IVA dentro  → se sabe la cifra con IVA y se puede sacar la otra;
 *   · no lo lleva          → al revés;
 *   · EL PRESUPUESTO NO LO DICE → no se sabe ninguna de las dos, y eso es un
 *     resultado, no un hueco que rellenar. Suponer «será sin IVA» acierta la
 *     mitad de las veces y la otra mitad se equivoca en un 21 %, que en un
 *     catering son dos mil euros y una discusión.
 *
 * Va suelto y no dentro de la pantalla porque es aritmética con un criterio
 * dentro —qué se puede afirmar y qué no—, y eso se prueba con unitarios en
 * lugar de montando una comparativa entera por cada caso.
 */

/** Lo que se puede afirmar de una cifra. `null` es «esto no se sabe». */
export interface BasesDelPresupuesto {
  sinIva: number | null;
  conIva: number | null;
  /** `true` cuando el presupuesto no dice qué incluye: la pantalla lo avisa. */
  indeterminado: boolean;
}

/** El multiplicador, una vez y con nombre: 21 % → 1,21. */
const FACTOR = 1 + PORCENTAJE_IVA / 100;

/**
 * Las dos caras de un importe presupuestado.
 *
 * NO SE REDONDEA AQUÍ. El redondeo es cosa de cómo se escribe el número, y de
 * eso ya se encarga `formateadorDeImporte` con los dos decimales de la moneda.
 * Redondear además en este paso metería un céntimo de error propio en una cifra
 * que después se vuelve a redondear para pintarla.
 */
export function basesDelPresupuesto(
  importe: number | null,
  ivaIncluido: boolean | null,
): BasesDelPresupuesto {
  if (importe === null) return { sinIva: null, conIva: null, indeterminado: false };

  if (ivaIncluido === null) return { sinIva: null, conIva: null, indeterminado: true };

  return ivaIncluido
    ? { sinIva: importe / FACTOR, conIva: importe, indeterminado: false }
    : { sinIva: importe, conIva: importe * FACTOR, indeterminado: false };
}

/**
 * EN QUÉ ORDEN SE PONEN VARIOS PRESUPUESTOS: de más barato a más caro, SOBRE
 * LA MISMA BASE.
 *
 * La comparativa ordenaba por la cifra cruda, y eso es justo lo que este
 * módulo existe para evitar: 2.000 € sin IVA (2.420 € con él) salía antes que
 * 2.300 € con IVA (1.900,83 € sin él), y el «más barato» de la izquierda era
 * el caro.
 *
 * Detrás de los comparables van los que no dicen si llevan IVA —no se pueden
 * poner en fila con los demás, entre ellos por su cifra— y al final los que no
 * han dado precio. Entre iguales se respeta el orden en que llegan.
 */
export function ordenarPorPrecioComparable<
  T extends { importePresupuestado: number | null; ivaIncluido: boolean | null },
>(presupuestos: readonly T[]): T[] {
  const tramo = (presupuesto: T): [number, number] => {
    const bases = basesDelPresupuesto(
      presupuesto.importePresupuestado,
      presupuesto.ivaIncluido,
    );
    if (bases.sinIva !== null) return [0, bases.sinIva];
    if (bases.indeterminado) return [1, presupuesto.importePresupuestado ?? 0];
    return [2, 0];
  };

  return presupuestos
    .map((presupuesto, indice) => ({ presupuesto, indice, clave: tramo(presupuesto) }))
    .sort(
      (uno, otro) =>
        uno.clave[0] - otro.clave[0] ||
        uno.clave[1] - otro.clave[1] ||
        uno.indice - otro.indice,
    )
    .map(({ presupuesto }) => presupuesto);
}
