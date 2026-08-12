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
