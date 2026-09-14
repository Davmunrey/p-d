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
      className={`font-titulo peso-titulo text-display leading-display tracking-display ${className}`}
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
      className={`font-titulo peso-titulo text-titulo-1 leading-titulo tracking-titulo ${className}`}
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
    <Etiqueta
      id={id}
      className={`font-titulo peso-titulo-menor text-titulo-2 leading-titulo-corto ${className}`}
    >
      {children}
    </Etiqueta>
  );
}

/**
 * Tres tamaños, y no es capricho: el `h3` de la entrega mide 27 px fijos en
 * una tarjeta (hotel, consejo), pero es fluido en las listas de horas, y
 * distinto en cada una —23–30 en el programa del día, 21–27 en la víspera—
 * porque la víspera es un extra y se lee un punto más pequeña.
 *
 * El peso es el «menor» (400): en la entrega sólo el display y los titulares
 * de sección van en 300. Y va en el componente, no en la etiqueta HTML, para
 * que un `Titulo3 como="p"` pese lo mismo que un `h3`.
 */
export function Titulo3({
  id,
  children,
  como: Etiqueta = "h3",
  tamano = "fijo",
  className = "",
}: PropiedadesTitulo & { tamano?: "fijo" | "hito" | "hito-menor" }) {
  const escalon = {
    fijo: "text-titulo-3",
    hito: "text-hito",
    "hito-menor": "text-hito-menor",
  }[tamano];

  return (
    <Etiqueta
      id={id}
      className={`font-titulo peso-titulo-menor ${escalon} leading-hito ${className}`}
    >
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
export function Conector({
  children,
  tamano = "conector",
}: {
  children: ReactNode;
  /**
   * El escalón. `conector` es la «y» de la portada, fluida; `naipe` la de la
   * tarjeta del Save the Date, que se mide contra el alto del naipe; y `sello`
   * el «&» del sello, que hereda el color de las iniciales en vez del acento.
   */
  tamano?: "conector" | "naipe" | "sello";
}) {
  const escalon = {
    conector: "text-conector leading-conector text-acento",
    naipe: "text-naipe-conector leading-compacto text-acento",
    sello: "sello-ampersand text-sello-ampersand leading-compacto text-current",
  }[tamano];

  return <span className={`font-conector ${escalon}`}>{children}</span>;
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
  className = "",
}: {
  children: ReactNode;
  realzada?: boolean;
  /** Para el reveal que la entrega da a una versalita concreta (regalos). */
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-interno-compacto text-etiqueta uppercase tracking-seccion ${
        realzada ? "text-acento" : "text-tinta-suave"
      } ${className}`}
    >
      {realzada ? (
        <span aria-hidden className="size-linea rotate-45 bg-current opacity-80" />
      ) : null}
      {children}
    </span>
  );
}

/**
 * Versalita espaciada: el rótulo que precede a cada sección, el de un dato, el
 * título de una tarjeta.
 *
 * LLEVA LA FAMILIA Y EL PESO DEL CUERPO ESCRITOS, aunque parezca redundante.
 * Cuando una versalita se pinta como `h3` —el modo de una ruta en «Cómo
 * llegar», los títulos de las tarjetas del dress code—, la regla base de
 * `globals.css` le impone la serif y el peso 300 de los titulares, y la
 * versalita salía en Cormorant sin que nadie lo hubiera pedido. En la entrega
 * toda versalita es Jost; aquí se garantiza.
 *
 * Los ajustes son los que la entrega usa y ninguno más: el escalón de 12 px
 * para el modo de ruta y la versalita de la portada; el espaciado de sección
 * (.4em) para «Cuenta atrás»; el tono de marca para los títulos de tarjeta del
 * dress code; y el acento para «Guardad el día», la única versalita en bronce
 * del Save the Date.
 */
export function Etiqueta({
  id,
  children,
  como: Componente = "span",
  tamano = "etiqueta",
  espaciado = "etiqueta",
  tono = "suave",
  className = "",
}: {
  id?: string;
  children: ReactNode;
  /** Etiqueta HTML. Un `h3` sigue siendo un `h3` para el lector de pantalla. */
  como?: ElementType;
  tamano?: "etiqueta" | "boton";
  espaciado?: "etiqueta" | "seccion" | "boton" | "marcado";
  tono?: "suave" | "tinta" | "marca" | "acento";
  className?: string;
}) {
  const clases = [
    "block font-cuerpo peso-cuerpo uppercase",
    tamano === "boton" ? "text-boton" : "text-etiqueta",
    {
      etiqueta: "tracking-etiqueta",
      seccion: "tracking-seccion",
      boton: "tracking-boton",
      marcado: "tracking-marcado",
    }[espaciado],
    {
      suave: "text-tinta-suave",
      tinta: "text-tinta",
      marca: "text-marca",
      acento: "text-acento",
    }[tono],
    className,
  ].join(" ");

  return (
    <Componente id={id} className={clases}>
      {children}
    </Componente>
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
