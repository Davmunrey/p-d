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
}

export const ESTADO_INICIAL: EstadoImportacion = {
  fase: "subir",
  filas: [],
  errores: [],
  columnasIgnoradas: [],
  gruposNuevos: [],
  contenido: "",
};
