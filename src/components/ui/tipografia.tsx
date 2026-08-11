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
  /** Necesario para que una sección pueda referenciarlo con aria-labelledby. */
  id?: string;
}

export function Display({
  id,
  children,
  como: Etiqueta = "h1",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta
      id={id}
      className={`font-titulo text-display leading-display tracking-display ${className}`}
    >
      {children}
    </Etiqueta>
  );
}

export function Titulo1({
  id,
  children,
  como: Etiqueta = "h1",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta
      id={id}
      className={`font-titulo text-titulo-1 leading-titulo tracking-titulo ${className}`}
    >
      {children}
    </Etiqueta>
  );
}

export function Titulo2({
  id,
  children,
  como: Etiqueta = "h2",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta id={id} className={`font-titulo text-titulo-2 leading-titulo-corto ${className}`}>
      {children}
    </Etiqueta>
  );
}

export function Titulo3({
  id,
  children,
  como: Etiqueta = "h3",
  className = "",
}: PropiedadesTitulo) {
  return (
    <Etiqueta id={id} className={`font-titulo text-titulo-3 leading-titulo-corto ${className}`}>
      {children}
    </Etiqueta>
  );
}

/**
 * EL CONECTOR «y»
 *
 * La única aparición de Italianno en toda la pieza, y va en el acento. La
 * entrega es tajante con esto —«sólo el conector y el ampersand», una vez por
 * pieza— y tiene razón: es una letra con tanta personalidad que repetida deja
 * de ser un respiro y se convierte en ruido.
 *
 * Va como `<span aria-hidden>` con el texto real en `sr-only` porque un lector
 * de pantalla lee «Paloma y David» de corrido, y esa «y» no es decoración
 * tipográfica para quien escucha: es la conjunción.
 */
export function Conector({ children }: { children: ReactNode }) {
  return (
    <span className="font-conector text-conector leading-conector text-acento">{children}</span>
  );
}

/**
 * LA VERSALITA QUE ABRE UNA SECCIÓN
 *
 * Tiene dos formas, y cuál se usa no es una preferencia: es lo que la sección
 * significa dentro de la página.
 *
 * La **sobria** —tinta tenue, sin adorno— abre lo que hay que leer sí o sí: el
 * programa, el alojamiento, cómo llegar, la confirmación. Ahí la versalita
 * rotula un dato («Sábado 26 de junio», «Finca La Sierra») y estorbaría que
 * llamase la atención sobre sí misma.
 *
 * La **realzada** —bronce y un rombo delante, un cuadrado de 4 px girado 45°—
 * abre lo que se ofrece: la playlist, la historia. Son secciones que nadie
 * necesita para llegar a la boda, y el adorno es la manera de decir «esto es
 * un extra» sin escribirlo.
 *
 * Mezclarlas al azar rompe justamente eso: si el bronce sale en todas, deja de
 * significar nada. Por eso el realce es una decisión explícita en cada sección
 * y no el valor por defecto.
 *
 * El rombo es `aria-hidden`: para quien escucha la página no significa nada, y
 * anunciarlo sería un ruido por cada sección.
 */
export function EtiquetaSeccion({
  children,
  realzada = false,
}: {
  children: ReactNode;
  realzada?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-interno-compacto text-etiqueta uppercase tracking-seccion ${
        realzada ? "text-acento" : "text-tinta-suave"
      }`}
    >
      {realzada ? (
        <span aria-hidden className="size-linea rotate-45 bg-current opacity-80" />
      ) : null}
      {children}
    </span>
  );
}

/** Versalita espaciada: el rótulo que precede a cada sección. */
export function Etiqueta({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      id={id}
      className={`block text-etiqueta uppercase tracking-etiqueta text-tinta-suave ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Cursiva serif: las frases que respiran, nunca para información esencial.
 *
 * Va en el acento, como manda la escala tipográfica de la entrega
 * (`--texto-cita · color acento`). Es de los pocos sitios donde el bronce
 * aparece, y por eso la cita se lee como una voz distinta y no como un párrafo
 * más en cursiva.
 */
export function Cita({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`font-titulo text-cita italic leading-cita text-acento ${className}`}>
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
