import { IDIOMA } from "@/config/constants";
import type { EstadoProveedor } from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";

/**
 * CÓMO SE ESCRIBE UN IMPORTE Y CÓMO SE LLAMA UN ESTADO
 *
 * Aparte de las pantallas porque lo usan las dos —la lista y la ficha— y
 * porque son las dos cosas que, con una copia en cada sitio, acaban
 * divergiendo: la lista diciendo «8600 €» y la ficha «8.600,00 €» para el
 * mismo proveedor.
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

/** El estado del embudo, en castellano. Los copys mandan, el enumerado no. */
export function nombreDelEstado(estado: EstadoProveedor): string {
  return t(`panel.proveedores.estados.${estado}` as "panel.proveedores.estados.investigando");
}
