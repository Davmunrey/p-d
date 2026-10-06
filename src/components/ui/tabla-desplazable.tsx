import { useId, type ReactNode } from "react";

/**
 * UNA TABLA DE CIFRAS QUE EN EL MÓVIL SE DESPLAZA, CON SU RÓTULO FUERA.
 *
 * El rótulo iba como `<caption>` dentro del contenedor que se desplaza: se
 * centraba sobre los 500 px de la tabla y en un móvil se leía «LA MISMA
 * INFORMACIÓN, EN UNA». Ahora va encima, alineado, y nombra a la tabla y a la
 * región que se desplaza.
 *
 * LA REGIÓN SE ALCANZA CON EL TABULADOR. Una tabla sin enlaces ni campos no
 * tiene nada que reciba el foco, y sin foco no hay forma de desplazarla con el
 * teclado: la columna de la derecha se quedaría fuera para quien no usa ratón.
 */
export function TablaDesplazable({
  rotulo,
  children,
}: {
  rotulo: ReactNode;
  /** El `thead` y el `tbody` de la tabla. */
  children: ReactNode;
}) {
  const id = useId();

  return (
    <div className="mt-elemento">
      <p id={id} className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
        {rotulo}
      </p>
      <div
        role="region"
        aria-labelledby={id}
        tabIndex={0}
        className="tabla-desplazable mt-interno-compacto rounded-campo"
      >
        <table aria-labelledby={id} className="w-full border-collapse text-left">
          {children}
        </table>
      </div>
    </div>
  );
}
