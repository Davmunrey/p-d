/**
 * Cómo le fue a escribir el guion. Cada valor tiene su aviso en la pantalla.
 *
 * Vive aparte de `acciones.ts` porque un módulo `"use server"` sólo puede
 * exportar funciones asíncronas.
 */
export type EstadoGuion =
  | "creado"
  | "editado"
  | "borrado"
  | "hora"
  | "titulo"
  | "largo"
  | "orden"
  | "no-existe"
  | "sin-permiso"
  | "error";
