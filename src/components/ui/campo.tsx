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
}

const CLASES_CONTROL =
  "min-h-campo w-full rounded-campo border bg-superficie px-interno text-cuerpo text-tinta transicion-color placeholder:text-tinta-tenue focus:outline-none focus-visible:border-borde-marca";

function EnvolturaCampo({ etiqueta, ayuda, error, children }: Envoltura) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const descripcion = [error ? idError : null, ayuda ? idAyuda : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-interno-compacto">
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
        <span id={idAyuda} className="text-pequeno text-tinta-tenue">
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
  Pick<Envoltura, "etiqueta" | "ayuda" | "error">;

export function CampoTexto({ etiqueta, ayuda, error, ...resto }: PropiedadesTexto) {
  return (
    <EnvolturaCampo etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(propiedades) => (
        <input
          {...propiedades}
          {...resto}
          className={`${CLASES_CONTROL} ${error ? "border-error" : "border-borde"}`}
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
          className={`${CLASES_CONTROL} resize-y py-interno leading-cuerpo ${
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
          className={`${CLASES_CONTROL} ${error ? "border-error" : "border-borde"}`}
        >
          {children}
        </select>
      )}
    </EnvolturaCampo>
  );
}
