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
 */
const CLASES_CONTROL =
  "w-full border bg-superficie text-cuerpo text-tinta transicion-color placeholder:text-tinta-tenue focus-visible:border-marca focus-visible:shadow-anillo-campo";

/**
 * Dos formas, y sólo dos: la caja de siempre y la píldora que la entrega usa
 * en la playlist —54 px de alto, redonda, con más aire a los lados— para que
 * el campo y el botón formen una fila de dos píldoras iguales.
 */
const FORMAS = {
  caja: "min-h-campo rounded-campo px-interno",
  pildora: "min-h-control-grande rounded-boton px-pila",
} as const;

function EnvolturaCampo({ etiqueta, ayuda, error, className = "", children }: Envoltura) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const descripcion = [error ? idError : null, ayuda ? idAyuda : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`grid gap-interno-compacto ${className}`}>
      <label
        htmlFor={id}
        className={`text-etiqueta uppercase tracking-etiqueta ${
          error ? "text-error" : "text-tinta-suave"
        }`}
      >
        {etiqueta}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": descripcion || undefined,
      })}

      {ayuda ? (
        <span id={idAyuda} className="text-pequeno text-tinta-suave">
          {ayuda}
        </span>
      ) : null}

      {error ? (
        <span id={idError} role="alert" className="text-pequeno text-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type PropiedadesTexto = Omit<ComponentPropsWithoutRef<"input">, "id" | "className"> &
  Pick<Envoltura, "etiqueta" | "ayuda" | "error" | "className"> & {
    forma?: keyof typeof FORMAS;
  };

export function CampoTexto({
  etiqueta,
  ayuda,
  error,
  className,
  forma = "caja",
  ...resto
}: PropiedadesTexto) {
  return (
    <EnvolturaCampo etiqueta={etiqueta} ayuda={ayuda} error={error} className={className}>
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
  Pick<Envoltura, "etiqueta" | "ayuda" | "error">;

export function CampoSeleccion({
  etiqueta,
  ayuda,
  error,
  children,
  ...resto
}: PropiedadesSeleccion) {
  return (
    <EnvolturaCampo etiqueta={etiqueta} ayuda={ayuda} error={error}>
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
