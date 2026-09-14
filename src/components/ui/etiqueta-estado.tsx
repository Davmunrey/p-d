import type { ReactNode } from "react";

/**
 * ETIQUETA DE ESTADO
 *
 * La píldora del catálogo: una palabra que dice en qué punto está algo —
 * «Confirmado», «Pendiente», «Habrá autobús»—. La entrega da cuatro colores
 * (neutra, marca, contorno y confirmado) y este componente los pinta.
 *
 * EXISTE PORQUE ESTABA REPETIDA VEINTE VECES. Antes, cada pantalla escribía su
 * propia píldora a mano y ninguna era igual: unas con `px-interno`, otras con
 * `px-interno-compacto`, unas en versalita y otras no. Un sistema de diseño que
 * hay que recordar de memoria no es un sistema, y la prueba está en que se
 * habían separado solas sin que nadie lo decidiera.
 *
 * VA EN CAJA BAJA Y SIN ESPACIADO, que es lo que hace la entrega y lo
 * contrario de lo que hacen los botones. No es un descuido del estudio: un
 * botón se lee como una orden y por eso va en versalita; una etiqueta se lee
 * como un dato. Ponerla en versalita la convertiría en algo que se puede
 * pulsar, y no lo es. La excepción es el tamaño `versalita`, que es el que el
 * panel llevaba ya —ahí las etiquetas conviven con tablas y necesitan pesar
 * menos que el contenido de la fila.
 *
 * DOS COLORES MÁS DE LOS QUE TRAE EL CATÁLOGO. La entrega diseña la web
 * pública, donde no hay nada que pueda ir mal; el panel sí tiene avisos y
 * errores —un pago vencido, un documento que falta— y pintarlos con la píldora
 * neutra sería esconder justo lo que hay que ver. `aviso` y `error` usan los
 * semánticos de estado que ya existen, así que siguen siendo el mismo sistema.
 *
 * CINCO TAMAÑOS, Y NINGUNO INVENTADO AQUÍ. Cada uno es la medida que una pieza
 * ya auditada tiene en su entrega: la del catálogo, la de los avisos del
 * programa, la de las fichas de la playlist y las dos del panel. Están juntos
 * en este fichero precisamente para que se vean los cinco de un vistazo: si
 * algún día sobran dos, se quitan aquí y no hay que ir a buscarlos por veinte
 * pantallas.
 */

export type VarianteEtiqueta =
  | "neutra"
  | "marca"
  | "contorno"
  | "exito"
  | "aviso"
  | "error"
  | "aviso-marcada"
  | "error-marcada"
  | "superficie";

export type TamanoEtiqueta =
  "normal" | "aviso" | "chip" | "versalita" | "versalita-compacta" | "compacta";

/*
  SIN `leading-compacto`, y no es un olvido. La entrega no le declara
  interlineado a la píldora: la deja heredar el 1,6 de la página, y ese 1,6 es
  parte de su altura —13,5 px de letra por 1,6, más los nueve arriba y abajo—.
  Apretarlo a 1 daría una píldora más baja que la del catálogo y, en los sitios
  donde el texto es libre y largo (las alergias de un invitado, el título de
  una canción), dos líneas pegadas la una a la otra.
*/
const BASE = "inline-flex items-center gap-interno-compacto rounded-etiqueta";

const VARIANTES: Record<VarianteEtiqueta, string> = {
  neutra: "bg-superficie-tenue text-tinta-marca",
  marca: "bg-accion text-etiqueta-marca-tinta",
  contorno: "border border-borde-fuerte text-tinta-suave",
  exito: "bg-exito-fondo text-exito-tinta",
  aviso: "bg-aviso-fondo text-aviso-tinta",
  error: "bg-error-fondo text-error-tinta",

  /*
    LAS DOS «MARCADAS» EXISTEN POR CONTRASTE, no por gusto. `--error-tinta`
    sobre `--error-fondo` da 4,12:1 y `--aviso-tinta` sobre el suyo 2,9:1: los
    dos por debajo del 4,5:1 que AA pide para texto pequeño, y las etiquetas más
    urgentes de todo el panel —«Vencida», «Vence hoy»— van justo en el tamaño
    más pequeño que hay. Estas dos escriben en `--tinta` (16:1) y llevan el
    color del estado al BORDE, donde un 3:1 basta porque es una mancha y no una
    letra. Se lee igual de rápido y se lee de verdad.
  */
  "aviso-marcada": "border border-aviso bg-aviso-fondo text-tinta",
  "error-marcada": "border border-error bg-error-fondo text-tinta",

  /*
    LA NEUTRA AL REVÉS, para las píldoras que viven DENTRO de una tarjeta que ya
    es `--superficie-tenue`. Allí la neutra desaparece —sería el mismo gris
    sobre el mismo gris— y lo que hace falta es lo contrario: subir a blanco
    para despegarse. Es la misma idea que el tono «amplia» de la tarjeta.
  */
  superficie: "bg-superficie text-tinta",
};

const TAMANOS: Record<TamanoEtiqueta, string> = {
  normal: "px-pildora-x py-pildora-y text-etiqueta-estado",
  aviso: "px-pila py-chip-y text-pequeno tracking-aviso",
  chip: "px-chip-x py-chip-y text-chip",
  versalita: "px-interno py-linea text-diminuto uppercase tracking-etiqueta",
  "versalita-compacta":
    "px-interno-compacto py-linea text-diminuto uppercase tracking-etiqueta",
  compacta: "px-interno-compacto py-linea text-pequeno",
};

interface Propiedades {
  variante?: VarianteEtiqueta;
  tamano?: TamanoEtiqueta;
  /** Una etiqueta dentro de una lista es un `li`; suelta, un `span`. */
  como?: "span" | "li" | "dd";
  children: ReactNode;
  /** Para colocarla en una fila o separarla: el hueco lo decide quien la usa. */
  className?: string;
}

export function EtiquetaEstado({
  variante = "neutra",
  tamano = "normal",
  como: Caja = "span",
  className = "",
  children,
}: Propiedades) {
  return (
    <Caja className={`${BASE} ${TAMANOS[tamano]} ${VARIANTES[variante]} ${className}`}>
      {children}
    </Caja>
  );
}
