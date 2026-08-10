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
 */

export type JerarquiaBoton = "primario" | "secundario" | "terciario";

const BASE =
  "inline-flex items-center justify-center gap-interno-compacto text-etiqueta uppercase tracking-boton transicion-color disabled:pointer-events-none disabled:opacity-50";

const JERARQUIAS: Record<JerarquiaBoton, string> = {
  primario:
    "min-h-control rounded-boton bg-accion px-elemento text-tinta-sobre-accion hover:bg-accion-hover",
  secundario:
    "min-h-control rounded-boton border border-borde-fuerte px-elemento text-tinta-marca hover:border-borde-marca hover:bg-superficie-hundida",
  terciario:
    "min-h-control-compacto border-b border-borde-fuerte px-interno-compacto text-marca hover:border-borde-marca hover:text-tinta",
};

interface PropiedadesComunes {
  jerarquia?: JerarquiaBoton;
  children: ReactNode;
  className?: string;
}

type PropiedadesBoton = PropiedadesComunes &
  Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

type PropiedadesEnlace = PropiedadesComunes &
  Omit<ComponentPropsWithoutRef<typeof Link>, "className" | "children">;

export function Boton({
  jerarquia = "primario",
  className = "",
  children,
  type = "button",
  ...resto
}: PropiedadesBoton) {
  return (
    <button type={type} className={`${BASE} ${JERARQUIAS[jerarquia]} ${className}`} {...resto}>
      {children}
    </button>
  );
}

/** Mismo aspecto que `Boton`, pero navega. Un enlace nunca debe ser un botón. */
export function BotonEnlace({
  jerarquia = "primario",
  className = "",
  children,
  ...resto
}: PropiedadesEnlace) {
  return (
    <Link className={`${BASE} ${JERARQUIAS[jerarquia]} ${className}`} {...resto}>
      {children}
    </Link>
  );
}
