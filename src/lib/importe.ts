import { IDIOMA } from "@/config/constants";

/**
 * CÓMO SE ESCRIBE UN IMPORTE
 *
 * Vive suelto porque lo necesitan dos módulos que no se conocen —proveedores y
 * presupuesto— y porque una copia en cada uno acaba siendo dos formas distintas
 * de escribir el mismo número: la lista diciendo «12000 €» y el resumen
 * «12.000,00 €» para el mismo gasto.
 */

/**
 * El importe, en la moneda de la boda.
 *
 * `Intl.NumberFormat` y no una plantilla: el separador de millar, el decimal y
 * el sitio del símbolo son cosa del idioma, no nuestra. En castellano el euro
 * va detrás y el punto separa millares — al revés que en inglés.
 *
 * LA MONEDA SE PASA, NO SE SUPONE. Vive en `configuracion_boda.moneda` y por
 * eso llega desde la pantalla, que es quien ha leído la configuración. Fijar
 * «EUR» aquí sería exactamente el hardcode que prohíbe la regla 1, aunque hoy
 * acertara.
 *
 * OJO CON LAS CUATRO CIFRAS, que es donde se equivoca todo el mundo: 2000 € se
 * escribe «2000,00 €», sin punto. El separador de millar aparece a partir de
 * cinco cifras —«12.000,00 €»—, y no es un capricho de la librería: la RAE deja
 * los números de cuatro cifras sin separador, y `es-ES` lo cumple.
 *
 * Importa porque casi todo lo que se compara en una boda cae justo ahí, entre
 * mil y diez mil. Dos tests se han caído ya escribiendo «2.000,00» a mano
 * contra una pantalla que ponía «2000,00»; los dos daban por buena la regla
 * inglesa. Un importe esperado no se teclea: se pide aquí.
 */
export function formateadorDeImporte(moneda: string): (importe: number) => string {
  const formato = new Intl.NumberFormat(IDIOMA, {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 2,
  });
  return (importe: number) => formato.format(importe);
}

/**
 * Un céntimo, escrito como lo escribe una persona: `12.000,50`, `12000.50`,
 * `12.000,50 €`. Nada de eso es un número todavía.
 */
const IMPORTE_ESCRITO = /^(\d+(\.\d{1,2})?|\.\d{1,2})$/;

/**
 * UN IMPORTE TECLEADO → UN NÚMERO. Tres respuestas, no dos.
 *
 * - `null` — el campo venía vacío. No hay importe, que no es lo mismo que cero.
 * - un número — se ha entendido.
 * - `undefined` — hay algo escrito y no es un importe. La pantalla lo convierte
 *   en un mensaje.
 *
 * Devolver `null` para lo ilegible sería el peor de los tres: borraría en
 * silencio el importe que alguien acaba de teclear mal.
 *
 * NO SE REDONDEA, SE RECHAZA. La columna es `numeric(12,2)` y antes esto hacía
 * `Math.round(n * 100) / 100`, que convertía «8600,555» en 8.600,56 sin decir
 * nada. Un tercer decimal en una pantalla de dinero es un dedo que ha resbalado,
 * y la respuesta a un dedo que resbala es enseñarlo, no elegir por él.
 *
 * Y CON EL PUNTO DE LOS MILLARES MANDA EL CASTELLANO: «1.250» son mil doscientos
 * cincuenta, no uno con veinticinco. Se quita sólo el punto que va seguido de
 * exactamente tres cifras, así que «12.50» sigue siendo doce con cincuenta.
 */
export function leerImporte(bruto: string): number | null | undefined {
  const escrito = bruto.trim();
  if (!escrito) return null;

  // El euro y los espacios se caen: los importes se pegan desde un presupuesto
  // en PDF y vienen con símbolo, y eso no es un error de quien pega.
  const limpio = escrito
    .replace(/[€\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  if (!IMPORTE_ESCRITO.test(limpio)) return undefined;

  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : undefined;
}
