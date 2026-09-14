import type { ReactNode } from "react";

/**
 * AVISO
 *
 * La caja del catálogo que cuenta un dato que conviene tener a mano: «Plazo:
 * las confirmaciones se cierran el 1 de mayo». Un rótulo corto en negrita y el
 * texto detrás, en la misma línea.
 *
 * EL RÓTULO VA DENTRO DEL MISMO PÁRRAFO, no encima. Es lo que hace la entrega
 * y no es cosmético: sacarlo a su propia línea lo convierte en un titular, y
 * entonces la caja pide un hueco arriba y otro abajo, y deja de ser una nota
 * al paso para ser una sección. La entrega la quiere del tamaño de una frase.
 *
 * `text-wrap: pretty` evita que la última línea se quede con una palabra
 * suelta. En una caja de dos o tres líneas, una viuda se ve entera.
 *
 * NO LLEVA `role="alert"` NI `role="status"`, y es a propósito. Esto no
 * interrumpe a nadie: es texto que ya estaba en la página cuando se cargó.
 * Un `role` de anuncio aquí haría que el lector de pantalla cortase lo que
 * estuviera leyendo para contar una fecha que no ha cambiado. Para lo que sí
 * interrumpe —un error de formulario, el resultado de guardar— están el
 * `role="alert"` del campo y los avisos del panel.
 */

interface Propiedades {
  /** El rótulo en negrita que abre la frase. Opcional: sin él es sólo texto. */
  titulo?: string;
  children: ReactNode;
  className?: string;
}

export function Aviso({ titulo, className = "", children }: Propiedades) {
  return (
    <p
      className={`rounded-campo bg-nota-fondo px-aviso-x py-aviso-y text-aviso text-nota-tinta text-pretty ${className}`}
    >
      {titulo ? (
        <strong className="font-destacado text-nota-tinta-fuerte">{titulo}</strong>
      ) : null}
      {titulo ? " " : null}
      {children}
    </p>
  );
}
