import type { EstadoProveedor } from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";

/**
 * CÓMO SE LLAMA CADA FASE DEL EMBUDO.
 *
 * El formateo de importes se fue a `lib/importe.ts` en cuanto el presupuesto lo
 * necesitó también: dos copias del mismo `Intl.NumberFormat` son dos formas de
 * escribir el mismo número esperando a divergir.
 */

/** El estado del embudo, en castellano. Los copys mandan, el enumerado no. */
export function nombreDelEstado(estado: EstadoProveedor): string {
  return t(`panel.proveedores.estados.${estado}` as "panel.proveedores.estados.investigando");
}
