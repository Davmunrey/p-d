import type { ReactNode } from "react";

/**
 * TARJETA
 *
 * La ficha con la que el sistema presenta un sitio —un hotel, un mirador, una
 * parada—: una imagen apaisada arriba, una versalita con el dato corto, el
 * nombre en serif y una línea de texto. Hasta ahora la pintaba a mano la
 * sección de alojamiento, que era la única pantalla que tenía tarjetas.
 *
 * LA IMAGEN LLEGA MONTADA DESDE FUERA. Este componente no sabe de Supabase ni
 * de `next/image`: recibe el bloque ya hecho y sólo le pone la caja con su
 * proporción de 4:3. Si supiera de dónde salen las fotos, la ficha del
 * catálogo —que no tiene ninguna— tendría que fingir una.
 *
 * DOS TAMAÑOS, Y LOS DOS SALEN DE UNA ENTREGA. El estudio dibuja la tarjeta
 * dos veces y no igual: en el catálogo de marca va ajustada —22 px de relleno,
 * título de 25, sobre el gris del papel— y en la Landing va amplia —26 de
 * relleno, título de 27, en blanco— porque allí vive dentro de un bloque
 * hundido y tiene que subir para despegarse. No es una escala abierta: son las
 * dos que existen, y el día que el estudio dibuje una tercera se añade aquí.
 *
 * EL PIE NO ESTÁ EN NINGUNA DE LAS DOS ENTREGAS. La ficha del catálogo acaba
 * en el párrafo, y la tarifa y el enlace de reserva son cosa de la Landing. Se
 * deja como hueco opcional, con el filete y el `mt-auto` que hacen falta para
 * que dos tarjetas de distinta altura en la misma fila alineen su última
 * línea: sin eso, el precio de un hotel con descripción larga queda diez
 * píxeles más abajo que el de su vecino y la rejilla se ve torcida.
 */

type TamanoTarjeta = "normal" | "amplia";

const TAMANOS: Record<
  TamanoTarjeta,
  { caja: string; cuerpo: string; meta: string; titulo: string }
> = {
  normal: {
    caja: "bg-fondo",
    cuerpo: "p-tarjeta-cuerpo",
    meta: "text-meta tracking-meta",
    titulo: "text-titulo-tarjeta",
  },
  amplia: {
    caja: "bg-superficie",
    cuerpo: "p-tarjeta",
    meta: "text-etiqueta tracking-etiqueta",
    titulo: "text-titulo-3",
  },
};

interface Propiedades {
  /** La versalita corta de arriba: «A 18 min · con bus». */
  meta?: ReactNode;
  titulo: ReactNode;
  texto?: ReactNode;
  /** El bloque de imagen ya montado. Se le pone la caja 4:3 y el recorte. */
  imagen?: ReactNode;
  /** La fila de abajo, separada por un filete: tarifa, enlace, lo que haga falta. */
  pie?: ReactNode;
  /** Una tarjeta dentro de una lista es un `li`; suelta, un `article`. */
  como?: "article" | "li" | "div";
  /** El nivel del titular lo manda la pantalla, no el componente. */
  nivelTitulo?: "h2" | "h3" | "h4";
  tamano?: TamanoTarjeta;
  className?: string;
}

export function Tarjeta({
  meta,
  titulo,
  texto,
  imagen,
  pie,
  como: Caja = "article",
  nivelTitulo: Titulo = "h3",
  tamano = "normal",
  className = "",
}: Propiedades) {
  const forma = TAMANOS[tamano];

  return (
    <Caja
      className={`flex flex-col overflow-hidden rounded-tarjeta border border-borde ${forma.caja} ${className}`}
    >
      {imagen ? (
        <div className="relative aspect-foto-tarjeta bg-superficie-hundida">{imagen}</div>
      ) : null}

      <div className={`flex flex-1 flex-col ${forma.cuerpo}`}>
        {meta ? (
          <span className={`${forma.meta} uppercase text-tinta-tenue`}>{meta}</span>
        ) : null}

        <Titulo
          className={`font-titulo peso-titulo-menor ${forma.titulo} leading-hito text-tinta ${
            meta ? "mt-hueco-corto" : ""
          }`}
        >
          {titulo}
        </Titulo>

        {texto ? (
          <p className="mt-hueco-corto flex-1 text-cuerpo leading-cuerpo text-tinta-suave">
            {texto}
          </p>
        ) : null}

        {pie ? (
          <div className="mt-auto pt-pila">
            <div className="flex items-baseline justify-between gap-interno border-t border-borde-tenue pt-interno">
              {pie}
            </div>
          </div>
        ) : null}
      </div>
    </Caja>
  );
}
