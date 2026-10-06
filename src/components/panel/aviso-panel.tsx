import type { ReactNode } from "react";

/**
 * EL AVISO DE UNA PANTALLA DEL PANEL: «guardado», «no se ha podido…».
 *
 * Una caja con fondo, verde si salió bien y rosa si no. Ajustes y Mi cuenta lo
 * pintaban como una línea de texto suelta, y en el móvil «Ajustes guardados»
 * se leía como una nota al pie de la descripción y no como la confirmación.
 *
 * El que sale bien es `status` y el que sale mal, `alert`: el primero no debe
 * interrumpir lo que esté leyendo un lector de pantalla, y el segundo sí.
 */
export function AvisoPanel({
  error,
  children,
  className = "",
}: {
  error: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-campo p-interno text-pequeno ${
        error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      } ${className}`}
    >
      {children}
    </p>
  );
}
