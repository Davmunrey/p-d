import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useId } from "react";

/**
 * CAMPOS DE FORMULARIO
 *
 * El RSVP es el formulario más importante del proyecto: lo rellenan invitados
 * desde el móvil, a menudo mayores, a veces con prisa. Las decisiones que hay
 * aquí no son estéticas:
 *
 * - La etiqueta es un `<label>` de verdad, asociado por id. Un placeholder no
 *   es una etiqueta: desaparece al escribir y los lectores de pantalla no
 *   siempre lo anuncian.
 * - El texto del campo mide 16 px como mínimo. Por debajo, Safari en iOS hace
 *   zoom automático al enfocar y descoloca la página entera.
 * - El error se asocia con `aria-describedby` y se marca con `aria-invalid`,
 *   para que se anuncie al enfocar y no solo se vea en rojo.
 * - El color nunca es el único indicador: el error lleva texto.
 */

interface Envoltura {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: (propiedades: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
  /** Para colocar el campo en una fila: el ancho lo decide quien lo usa. */
  className?: string;
  /**
   * La etiqueta se queda para el lector de pantalla y sale de la vista. Sólo
   * cuando la fila ya dice de qué es el campo —«María García» y a su lado el
   * desplegable de mesa—: repetir «Mesa de María García» encima de cada uno
   * doblaba la altura de la lista sin decir nada que no se viera ya.
   */
  etiquetaOculta?: boolean;
}

/**
 * FUERA `focus:outline-none`, Y ES EL ARREGLO MÁS IMPORTANTE DE ESTE FICHERO.
 *
 * Esa clase anulaba el `:focus-visible` global —el aro de bronce de dos
 * píxeles que lleva toda la página— y dejaba al campo con un cambio de borde
 * como único indicador de foco. Un borde que pasa de gris a azul no basta:
 * quien navega con el teclado no tiene forma de saber dónde está si el único
 * aviso es un color que cambia un punto.
 *
 * Ahora conviven los dos, que es lo que pide la entrega y lo que pide la
 * accesibilidad: por fuera el aro de bronce, con su separación, y pegado al
 * borde el anillo marino de tres píxeles del catálogo. El primero se ve desde
 * el otro lado de la habitación; el segundo es el que hace que el campo parezca
 * encendido.
 *
 * Y UN CAMPO DESHABILITADO SE VE DESHABILITADO: hundido, sin borde y con la
 * tinta suave, como el botón con `accion-desactivada`. Se pintaba igual que uno
 * editable, y un lector en Ajustes tocaba veintidós cajas blancas sin que
 * saliera el teclado ni nada que dijera por qué.
 */
const CLASES_CONTROL =
  "w-full border bg-superficie text-cuerpo text-tinta transicion-color placeholder:text-tinta-tenue focus-visible:border-marca focus-visible:shadow-anillo-campo disabled:cursor-not-allowed disabled:border-transparent disabled:bg-superficie-hundida disabled:text-tinta-suave";

/**
 * Dos formas, y sólo dos: la caja de siempre y la píldora que la entrega usa
 * en la playlist —54 px de alto, redonda, con más aire a los lados— para que
 * el campo y el botón formen una fila de dos píldoras iguales.
 */
const FORMAS = {
  caja: "min-h-campo rounded-campo px-interno",
  pildora: "min-h-control-grande rounded-boton px-pila",
} as const;

function EnvolturaCampo({
  etiqueta,
  ayuda,
  error,
  className = "",
  etiquetaOculta = false,
  children,
}: Envoltura) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  /*
    EL ERROR OCUPA EL SITIO DE LA AYUDA. Salían las dos a la vez, una debajo de
    otra —«para avisaros de cambios» y «revisad el correo»—, y lo que había que
    leer quedaba en segundo lugar. Con error, el campo dice sólo lo que falla;
    al corregirlo vuelve la ayuda.
  */
  const descripcion = error ? idError : ayuda ? idAyuda : "";

  return (
    /*
      `content-start`: en una rejilla de dos columnas, el campo que no lleva
      ayuda se estira hasta la altura del que sí, y sin esto el hueco se
      repartía entre la etiqueta y la caja — la caja bajaba y la fila salía
      torcida. Así todo se queda arriba y lo que sobra, debajo.
    */
    <div className={`grid content-start gap-interno-compacto ${className}`}>
      <label
        htmlFor={id}
        className={
          etiquetaOculta
            ? "sr-only"
            : `text-etiqueta uppercase tracking-etiqueta ${error ? "text-error" : "text-tinta-suave"}`
        }
      >
        {etiqueta}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": descripcion || undefined,
      })}

      {error ? (
        <span id={idError} role="alert" className="text-pequeno text-error">
          {error}
        </span>
      ) : ayuda ? (
        <span id={idAyuda} className="text-pequeno text-tinta-suave">
          {ayuda}
        </span>
      ) : null}
    </div>
  );
}

type PropiedadesTexto = Omit<ComponentPropsWithoutRef<"input">, "id" | "className"> &
  Pick<Envoltura, "etiqueta" | "ayuda" | "error" | "className" | "etiquetaOculta"> & {
    forma?: keyof typeof FORMAS;
  };

export function CampoTexto({
  etiqueta,
  ayuda,
  error,
  className,
  etiquetaOculta,
  forma = "caja",
  ...resto
}: PropiedadesTexto) {
  return (
    <EnvolturaCampo
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      className={className}
      etiquetaOculta={etiquetaOculta}
    >
      {(propiedades) => (
        <input
          {...propiedades}
          {...resto}
          className={`${CLASES_CONTROL} ${FORMAS[forma]} ${error ? "border-error" : "border-borde"}`}
        />
      )}
    </EnvolturaCampo>
  );
}

type PropiedadesArea = Omit<ComponentPropsWithoutRef<"textarea">, "id" | "className"> &
  Pick<Envoltura, "etiqueta" | "ayuda" | "error">;

export function CampoTextoLargo({ etiqueta, ayuda, error, ...resto }: PropiedadesArea) {
  return (
    <EnvolturaCampo etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(propiedades) => (
        <textarea
          {...propiedades}
          {...resto}
          className={`${CLASES_CONTROL} ${FORMAS.caja} resize-y py-interno leading-cuerpo ${
            error ? "border-error" : "border-borde"
          }`}
        />
      )}
    </EnvolturaCampo>
  );
}

type PropiedadesSeleccion = Omit<ComponentPropsWithoutRef<"select">, "id" | "className"> &
  Pick<Envoltura, "etiqueta" | "ayuda" | "error" | "className" | "etiquetaOculta">;

export function CampoSeleccion({
  etiqueta,
  ayuda,
  error,
  className,
  etiquetaOculta,
  children,
  ...resto
}: PropiedadesSeleccion) {
  return (
    <EnvolturaCampo
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      className={className}
      etiquetaOculta={etiquetaOculta}
    >
      {(propiedades) => (
        <select
          {...propiedades}
          {...resto}
          className={`${CLASES_CONTROL} ${FORMAS.caja} ${error ? "border-error" : "border-borde"}`}
        >
          {children}
        </select>
      )}
    </EnvolturaCampo>
  );
}
