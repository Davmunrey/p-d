import { IDIOMA } from "@/config/constants";

/**
 * CÓMO SE ESCRIBE UN IMPORTE
 *
 * Vive suelto porque lo necesitan dos módulos que no se conocen —proveedores y
 * presupuesto— y porque una copia en cada uno acaba siendo dos formas distintas
 * de escribir el mismo número: la lista diciendo «8600 €» y el resumen
 * «8.600,00 €» para el mismo gasto.
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
 */
export function formateadorDeImporte(moneda: string): (importe: number) => string {
  const formato = new Intl.NumberFormat(IDIOMA, {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: 2,
  });
  return (importe: number) => formato.format(importe);
}
