/**
 * BODA-100 a BODA-104 · LO QUE COMPARTEN LAS ACCIONES Y LAS PANTALLAS
 *
 * Vive aparte de `acciones.ts` porque un módulo `"use server"` sólo puede
 * exportar funciones asíncronas: un `export type` ahí compila, pasa el lint y
 * revienta al abrir la pantalla. Lo vigila `tests/unidad/acciones-servidor.ts`,
 * y esta separación es la respuesta a esa regla.
 */

/** Cómo le fue a la corrección del recuento. Cada valor tiene su aviso. */
export type EstadoDia =
  "corregido" | "sin-permiso" | "menu-invalido" | "ajuste-invalido" | "error";

const ESTADOS: readonly EstadoDia[] = [
  "corregido",
  "sin-permiso",
  "menu-invalido",
  "ajuste-invalido",
  "error",
];

export function esEstadoDia(valor: string): valor is EstadoDia {
  return (ESTADOS as readonly string[]).includes(valor);
}

/**
 * QUÉ CONTESTA EL SERVIDOR AL MARCAR UN PUNTO DEL GUION.
 *
 * No redirige, y es lo único del panel que no lo hace. El resto de acciones
 * vuelven con `?estado=` porque después de crear algo tiene sentido repintar la
 * pantalla entera; aquí no: marcar un punto es un toque, se hace de pie y con
 * prisa, y una recarga completa entre toque y toque es lo que convierte una
 * lista de control en una pantalla que se pelea contigo.
 *
 * Y hay otra razón, la de verdad: si la respuesta fuera una redirección, no
 * habría forma de distinguir «no había cobertura» de «no tienes permiso». Con
 * un resultado en la mano, el navegador sabe cuál de las dos cosas ha pasado y
 * puede guardarse lo marcado para mandarlo luego.
 */
export interface ResultadoDeMarcar {
  ok: boolean;
  /** Sólo cuando `ok` es falso y el motivo se puede contar. */
  motivo?: "sin-permiso" | "error";
}
