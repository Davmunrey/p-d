import type { ElementType, ReactNode } from "react";

/**
 * TIPOGRAFÍA
 *
 * En un diseño editorial la tipografía ES el diseño, así que la escala se
 * encapsula aquí en lugar de repartir clases por todas las secciones.
 *
 * La etiqueta HTML y el tamaño van por separado a propósito: el orden de los
 * encabezados debe seguir la jerarquía del documento (un `h2` después de un
 * `h1`, sin saltarse niveles) aunque visualmente convenga otro tamaño. Mezclar
 * ambas cosas es la causa más común de webs que se navegan fatal con lector de
 * pantalla.
 */

interface PropiedadesTitulo {
  children: ReactNode;
  /** Etiqueta HTML. Define la jerarquía del documento, no el tamaño. */
  como?: ElementType;
  className?: string;
}

export function Display({
  children,
  como: Etiqueta = "h1",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta
      className={`font-titulo text-display leading-display tracking-display ${className}`}
    >
      {children}
    </Etiqueta>
  );
}

export function Titulo1({
  children,
  como: Etiqueta = "h1",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta className={`font-titulo text-titulo-1 leading-titulo ${className}`}>
      {children}
    </Etiqueta>
  );
}

export function Titulo2({
  children,
  como: Etiqueta = "h2",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta className={`font-titulo text-titulo-2 leading-titulo-corto ${className}`}>
      {children}
    </Etiqueta>
  );
}

export function Titulo3({
  children,
  como: Etiqueta = "h3",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta className={`font-titulo text-titulo-3 leading-titulo-corto ${className}`}>
      {children}
    </Etiqueta>
  );
}

/** Versalita espaciada: el rótulo que precede a cada sección. */
export function Etiqueta({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`block text-etiqueta uppercase tracking-etiqueta text-tinta-tenue ${className}`}
    >
      {children}
    </span>
  );
}

/** Cursiva serif: las frases que respiran, nunca para información esencial. */
export function Cita({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`font-titulo text-cita italic leading-cita text-tinta-suave ${className}`}>
      {children}
    </p>
  );
}

export function Cuerpo({
  children,
  grande = false,
  className = "",
}: {
  children: ReactNode;
  grande?: boolean;
  className?: string;
}) {
  return (
    <p
      className={`${grande ? "text-cuerpo-grande" : "text-cuerpo"} leading-cuerpo text-tinta-suave ${className}`}
    >
      {children}
    </p>
  );
}
