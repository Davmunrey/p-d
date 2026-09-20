import type { ErrorDeFila, FilaImportada } from "@/lib/importacion-invitados";

/**
 * EL ESTADO QUE COMPARTEN LOS DOS PASOS DE LA IMPORTACIÓN
 *
 * Vive en su propio fichero y no junto a las acciones por una regla del
 * framework que no perdona: un módulo `"use server"` **sólo puede exportar
 * funciones asíncronas**. Un tipo o una constante ahí dentro compilan sin
 * quejarse y luego revientan al abrir la página, que es la peor forma de
 * enterarse — pasó, y lo cazó el trabajo de CI que levanta Supabase.
 */

export interface EstadoImportacion {
  /** Qué pantalla toca: el formulario de subida o la vista previa. */
  fase: "subir" | "previa";
  filas: FilaImportada[];
  errores: ErrorDeFila[];
  columnasIgnoradas: string[];
  /** Invitaciones que se van a crear, para poder decirlo antes de crearlas. */
  gruposNuevos: string[];
  /** El CSV ya decodificado, que viaja al paso de confirmar. */
  contenido: string;
  /** Un fallo que no es de ninguna fila en concreto. */
  aviso?: string;
  /**
   * De qué análisis viene este estado. Sube uno en cada «Analizar» y el
   * resultado de «Confirmar» copia el del análisis que confirmaba: así se sabe
   * cuál de los dos es el más reciente sin adivinarlo por el contenido.
   */
  serie: number;
}

export const ESTADO_INICIAL: EstadoImportacion = {
  fase: "subir",
  filas: [],
  errores: [],
  columnasIgnoradas: [],
  gruposNuevos: [],
  contenido: "",
  serie: 0,
};

/**
 * CUÁL DE LOS DOS ESTADOS SE PINTA.
 *
 * Son dos `useActionState` independientes —analizar y confirmar— y ninguno
 * borra al otro. Antes la regla era «el de confirmar manda si trae algo»: sólo
 * es verdad hasta que se analiza otra vez. Tras una confirmación fallida —la
 * otra familia dio de alta a alguien entre la previa y el botón—, cualquier
 * análisis nuevo se hacía en el servidor y se tiraba en el navegador: la
 * pantalla seguía enseñando las filas y los errores del intento anterior, sin
 * botón de confirmar, y no había forma de importar nada sin recargar.
 *
 * Se decide por RECENCIA: el de confirmar sólo manda si es del mismo análisis
 * que se está viendo. Un análisis nuevo tiene otra serie, y gana.
 */
export function estadoVigente(
  analisis: EstadoImportacion,
  envio: EstadoImportacion,
): EstadoImportacion {
  const envioEsDeEsteAnalisis = envio.serie === analisis.serie;
  const envioTraeAlgo = envio.fase === "previa" || Boolean(envio.aviso);
  return envioEsDeEsteAnalisis && envioTraeAlgo ? envio : analisis;
}
