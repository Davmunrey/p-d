import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * BOTÓN
 *
 * Tres jerarquías, como manda el sistema de marca: primario (relleno marino),
 * secundario (contorno) y terciario (texto subrayado). Nada más — un cuarto
 * estilo sería ruido.
 *
 * El relleno del primario sale de `--accion`, no de `--acento`: el acento es
 * el bronce, y un botón entero de bronce convertiría el único color cálido del
 * sistema en el elemento más ruidoso de la página.
 *
 * Solo usa tokens semánticos: en un bloque `[data-seccion="inversa"]` los
 * mismos colores se reasignan y el botón se adapta sin tocar una clase.
 *
 * Altura mínima de 52 px: el objetivo táctil cómodo en móvil, que es donde la
 * mayoría de invitados va a abrir esto desde WhatsApp.
 *
 * El rótulo va a `--texto-boton` (12 px) y no a la versalita de 11: es el
 * escalón que la entrega da a los cuatro botones de la Landing y al catálogo,
 * un punto por encima de los rótulos de sección para que un botón se lea como
 * lo que es. Y al pasar el ratón el borde del secundario y del terciario se
 * oscurece hasta la marca, no se aclara: la entrega hace lo primero.
 */

export type JerarquiaBoton = "primario" | "secundario" | "terciario";

const BASE =
  "inline-flex items-center justify-center gap-interno-compacto text-boton uppercase tracking-boton transicion-color disabled:pointer-events-none disabled:opacity-50";

const JERARQUIAS: Record<JerarquiaBoton, string> = {
  primario: "rounded-boton bg-accion px-elemento text-tinta-sobre-accion hover:bg-accion-hover",
  secundario:
    "rounded-boton border border-borde-fuerte px-elemento text-tinta-marca hover:border-marca hover:bg-superficie-hundida",
  terciario:
    "border-b border-borde-fuerte px-interno-compacto text-marca hover:border-marca hover:text-tinta",
};

/**
 * La altura va aparte de la jerarquía porque no siempre van juntas: el
 * terciario es siempre compacto (44, el mínimo táctil), y el primario y el
 * secundario miden 52 salvo en la playlist, donde la entrega los sube a 54
 * para que hagan fila con el campo.
 */
export type TamanoBoton = "normal" | "grande";

const ALTURAS = {
  normal: "min-h-control",
  grande: "min-h-control-grande",
  compacto: "min-h-control-compacto",
} as const;

function alturaDe(jerarquia: JerarquiaBoton, tamano: TamanoBoton) {
  return ALTURAS[jerarquia === "terciario" ? "compacto" : tamano];
}

interface PropiedadesComunes {
  jerarquia?: JerarquiaBoton;
  tamano?: TamanoBoton;
  children: ReactNode;
  className?: string;
}

type PropiedadesBoton = PropiedadesComunes &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

type PropiedadesEnlace = PropiedadesComunes &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children">;

export function Boton({
  jerarquia = "primario",
  tamano = "normal",
  className = "",
  children,
  type = "button",
  ...resto
}: PropiedadesBoton) {
  return (
    <button
      type={type}
      className={`${BASE} ${alturaDe(jerarquia, tamano)} ${JERARQUIAS[jerarquia]} ${className}`}
      {...resto}
    >
      {children}
    </button>
  );
}

/** Mismo aspecto que `Boton`, pero navega. Un enlace nunca debe ser un botón. */
export function BotonEnlace({
  jerarquia = "primario",
  tamano = "normal",
  className = "",
  children,
  ...resto
}: PropiedadesEnlace) {
  return (
    <Link
      className={`${BASE} ${alturaDe(jerarquia, tamano)} ${JERARQUIAS[jerarquia]} ${className}`}
      {...resto}
    >
      {children}
    </Link>
  );
}
