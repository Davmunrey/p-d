import { IDIOMA } from "@/config/constants";
import type { BaseServicio, EstadoProveedor, TipoDocumento } from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";

/**
 * CÓMO SE LLAMA CADA COSA DEL MÓDULO.
 *
 * El formateo de importes se fue a `lib/importe.ts` en cuanto el presupuesto lo
 * necesitó también: dos copias del mismo `Intl.NumberFormat` son dos formas de
 * escribir el mismo número esperando a divergir.
 *
 * Lo que queda aquí es la traducción de los enumerados de la base y el peso de
 * un fichero. Ninguna de las dos escribe un literal: el enumerado indexa el
 * subárbol de copys y el peso es una plantilla con su número dentro.
 */

/** El estado del embudo, en castellano. Los copys mandan, el enumerado no. */
export function nombreDelEstado(estado: EstadoProveedor): string {
  return t(`panel.proveedores.estados.${estado}` as "panel.proveedores.estados.investigando");
}

/** Qué clase de papel es: presupuesto, contrato, factura u otro. */
export function nombreDelTipoDocumento(tipo: TipoDocumento): string {
  return t(
    `panel.proveedores.tiposDocumento.${tipo}` as "panel.proveedores.tiposDocumento.contrato",
  );
}

/** A quién multiplica un servicio por invitado. */
export function nombreDeLaBase(base: BaseServicio): string {
  return t(
    `panel.proveedores.basesServicio.${base}` as "panel.proveedores.basesServicio.todos",
  );
}

/** Un mega, en bytes. Storage habla en bytes; las personas, en megas. */
const BYTES_POR_MEGA = 1024 * 1024;
const BYTES_POR_KILO = 1024;

const CIFRA = new Intl.NumberFormat(IDIOMA, { maximumFractionDigits: 1 });

/**
 * El peso de un adjunto, escrito como lo escribiría una persona.
 *
 * CAMBIA DE UNIDAD EN EL MEGA, y no es cosmética: casi todos los contratos
 * escaneados pesan cientos de kilobytes, y «0,2 MB» junto a «0,4 MB» no
 * distingue nada — parecen el mismo fichero. En kilobytes sí se ve cuál es el
 * escaneo bueno y cuál la foto borrosa del móvil.
 *
 * `null` cuando la fila no lo trae: la columna admite vacío porque hay filas
 * anteriores a que se guardara, y un «0 kB» sería mentira.
 */
export function pesoDelDocumento(bytes: number | null): string | null {
  if (bytes === null) return null;

  return bytes >= BYTES_POR_MEGA
    ? t("panel.proveedores.pesoMegas", { cuantos: CIFRA.format(bytes / BYTES_POR_MEGA) })
    : t("panel.proveedores.pesoKilos", { cuantos: CIFRA.format(bytes / BYTES_POR_KILO) });
}
