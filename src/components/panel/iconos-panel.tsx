import type { ReactNode } from "react";

/**
 * LOS ICONOS DE LA NAVEGACIÓN DEL PANEL
 *
 * Dibujados aquí, con el mismo trazo y la misma rejilla de 24, y no sacados de
 * una librería ni sustituidos por caracteres: una flecha de texto o un emoji
 * cambian de forma con cada tipografía y cada sistema, y en una barra de cinco
 * destinos lo que se compara es justo eso, la forma.
 *
 * Son siempre decorativos: van junto a su rótulo, que es lo que lee un lector
 * de pantalla. El color lo pone quien los usa con `currentColor`.
 */

export type ClaveIcono =
  "resumen" | "invitados" | "tareas" | "dia" | "mas" | "externo" | "cerrar";

const TRAZOS: Record<ClaveIcono, ReactNode> = {
  // Una casa: la portada del panel, desde donde se llega a todo.
  resumen: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  // Dos personas, una delante de otra: una invitación es un grupo.
  invitados: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 6.2a2.8 2.8 0 1 1 0 5.6" />
      <path d="M17 14.4a5 5 0 0 1 3.5 5.1" />
    </>
  ),
  // Una lista con sus marcas.
  tareas: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path d="m3.5 6.5 1.5 1.5 2.5-3M3.5 12l1.5 1.5 2.5-3M3.5 17.5 5 19l2.5-3" />
    </>
  ),
  // Dos anillos.
  dia: (
    <>
      <circle cx="9" cy="13.5" r="5" />
      <circle cx="15" cy="13.5" r="5" />
      <path d="m10.5 5 1.5-2 1.5 2-1.5 1.5z" />
    </>
  ),
  // Tres líneas: el menú entero.
  mas: <path d="M4 7h16M4 12h16M4 17h16" />,
  // Sale de la caja: se abre en otra pestaña.
  externo: (
    <>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  cerrar: <path d="m6 6 12 12M18 6 6 18" />,
};

export function IconoPanel({
  icono,
  className = "",
}: {
  icono: ClaveIcono;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {TRAZOS[icono]}
    </svg>
  );
}
