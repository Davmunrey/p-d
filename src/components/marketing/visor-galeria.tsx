"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { Boton } from "@/components/ui/boton";
import { t } from "@/lib/copy";

/**
 * BODA-25 · EL VISOR DE LA GALERÍA (el lightbox)
 *
 * LA ÚNICA PIEZA DE LA GALERÍA QUE NECESITA JAVASCRIPT, y por eso es la única
 * que lo lleva. La rejilla se pinta en el servidor y llega aquí como
 * `children`: este componente no vuelve a dibujar ni una miniatura, sólo
 * escucha. Así, la parte pesada de la sección —treinta fotos con su `srcset`—
 * no viaja también en la carga de cliente.
 *
 * SIN JAVASCRIPT LA GALERÍA SIGUE FUNCIONANDO, y esa es la decisión de fondo:
 * cada miniatura es un `<a>` al fichero de Storage, así que pulsar una la abre
 * a tamaño completo en la propia pestaña. Es peor experiencia —no hay flechas
 * ni se vuelve con Esc— pero se ven todas las fotos, que es lo que la sección
 * promete. Con JavaScript, ese mismo enlace abre el visor y la navegación del
 * navegador no llega a ocurrir.
 *
 * SE USA `<dialog>` NATIVO, no un `div` con `role="dialog"`. El navegador ya
 * sabe hacer lo difícil: atrapar el foco dentro mientras está abierto, dejar
 * inerte el resto de la página y cerrarse con Esc. Reimplementar eso a mano es
 * el camino corto a una trampa de foco rota, que para quien navega con teclado
 * significa quedarse encerrado en una página de la que no puede salir.
 *
 * EL FOCO VUELVE A LA MINIATURA QUE SE ESTABA MIRANDO. El navegador lo devuelve
 * solo al elemento que lo tenía antes de abrir, pero eso no basta en dos casos
 * que pasan constantemente: en Safari un enlace no recibe el foco al pulsarlo
 * con el ratón, y quien ha navegado con las flechas hasta la quinta foto espera
 * salir por la quinta, no por la primera. Así que se devuelve a mano.
 */

/** Lo que el visor necesita de una foto. La URL ya viene compuesta. */
export interface FotoDelVisor {
  id: string;
  /** URL pública completa del fichero en Storage. */
  fuente: string;
  textoAlternativo: string;
  ancho: number;
  alto: number;
  marcadorBorroso: string | null;
}

export function VisorGaleria({
  fotos,
  children,
}: {
  fotos: FotoDelVisor[];
  children: ReactNode;
}) {
  const rejilla = useRef<HTMLDivElement>(null);
  const dialogo = useRef<HTMLDialogElement>(null);

  /** Qué foto se está mirando. `null` con el visor cerrado. */
  const [indice, setIndice] = useState<number | null>(null);

  /**
   * Las miniaturas, en el orden del documento — que es el mismo en el que se
   * pintaron. Se buscan cuando hacen falta en vez de guardarlas en un `ref` por
   * foto: no las dibuja este componente, así que no hay dónde colgar el `ref`.
   */
  const miniaturas = () =>
    Array.from(rejilla.current?.querySelectorAll<HTMLElement>("a[data-indice]") ?? []);

  const alPulsarLaRejilla = (evento: MouseEvent<HTMLDivElement>) => {
    /*
      SE RESPETA LO QUE PIDE EL NAVEGADOR. Ctrl/⌘, mayúsculas, Alt o el botón
      central son maneras de decir «ábremela aparte»: quedarse con ese clic para
      enseñar el visor es romper una expectativa del navegador, no mejorarla.
    */
    if (evento.button !== 0) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;

    const enlace = (evento.target as HTMLElement).closest<HTMLElement>("a[data-indice]");
    if (!enlace) return;

    const elegido = Number(enlace.dataset.indice);
    if (!Number.isInteger(elegido) || elegido < 0 || elegido >= fotos.length) return;

    // Hay visor: el enlace al fichero se queda de reserva para quien no tenga
    // JavaScript.
    evento.preventDefault();
    setIndice(elegido);
    dialogo.current?.showModal();
  };

  /**
   * Adelante o atrás, dando la vuelta por los extremos.
   *
   * Se da la vuelta a propósito: en un visor a pantalla completa no hay ningún
   * indicio de que se haya llegado al final, así que una flecha que deja de
   * responder se lee como que algo se ha roto.
   */
  const mover = (paso: number) =>
    setIndice((actual) =>
      actual === null ? actual : (actual + paso + fotos.length) % fotos.length,
    );

  const alTeclearEnElVisor = (evento: KeyboardEvent<HTMLDialogElement>) => {
    // Esc lo gestiona el propio `<dialog>`. Aquí sólo las flechas.
    if (fotos.length < 2) return;
    if (evento.key === "ArrowRight") {
      evento.preventDefault();
      mover(1);
    } else if (evento.key === "ArrowLeft") {
      evento.preventDefault();
      mover(-1);
    }
  };

  const alCerrar = () => {
    if (indice !== null) miniaturas()[indice]?.focus();
    setIndice(null);
  };

  const foto = indice === null ? null : (fotos[indice] ?? null);

  return (
    <>
      {/* La rejilla, pintada en el servidor. Este envoltorio sólo escucha. */}
      <div ref={rejilla} onClick={alPulsarLaRejilla}>
        {children}
      </div>

      {/*
        `data-seccion="inversa"` y no un color escrito aquí: es el mismo
        mecanismo con el que la cuenta atrás y el RSVP se pintan en marino, así
        que el visor hereda su superficie, su tinta y su foco sin repetir ni un
        token — y los botones de dentro se adaptan solos.
      */}
      <dialog
        ref={dialogo}
        data-seccion="inversa"
        aria-label={t("galeria.visorEtiqueta")}
        onClose={alCerrar}
        onKeyDown={alTeclearEnElVisor}
        className="fixed inset-0 h-dvh max-h-dvh w-full max-w-full backdrop:bg-velo-fuerte"
      >
        {foto ? (
          /*
            Aparece en lugar de plantarse de golpe. Es la animación del sistema
            —duración y curva salen de los tokens— y se apaga sola con
            `prefers-reduced-motion`, como todas. Sólo corre al abrir: al pasar
            de foto este contenedor no se desmonta, así que la galería no
            parpadea con cada flecha.
          */
          <div className="animacion-aparecer flex h-full flex-col gap-interno p-interno">
            <div className="flex items-center justify-between gap-interno">
              {/*
                Con las flechas la imagen cambia sin que se mueva el foco: sin
                este aviso, quien no ve la pantalla no se entera de que ha
                pasado algo. `polite` para que espere su turno.
              */}
              <p
                aria-live="polite"
                className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
              >
                {t("galeria.contador", {
                  actual: (indice ?? 0) + 1,
                  total: fotos.length,
                })}
              </p>

              <Boton jerarquia="secundario" onClick={() => dialogo.current?.close()}>
                {t("galeria.cerrar")}
              </Boton>
            </div>

            <figure className="flex min-h-0 flex-1 flex-col gap-interno">
              {/*
                El hueco se posiciona y la foto se estira dentro con
                `object-contain`: así una vertical y una apaisada ocupan lo que
                pueden sin deformarse ni desbordar la pantalla.
              */}
              <div className="relative min-h-0 flex-1">
                <Image
                  // La clave hace que React monte otra imagen al cambiar de
                  // foto en vez de reutilizar el mismo elemento: sin ella se ve
                  // la anterior un instante con el tamaño de la nueva.
                  key={foto.id}
                  src={foto.fuente}
                  alt={foto.textoAlternativo}
                  width={foto.ancho}
                  height={foto.alto}
                  sizes="100vw"
                  className="absolute inset-0 h-full w-full object-contain"
                  placeholder={foto.marcadorBorroso ? "blur" : "empty"}
                  blurDataURL={foto.marcadorBorroso ?? undefined}
                />
              </div>

              <figcaption className="text-center text-pequeno text-tinta-suave">
                {foto.textoAlternativo}
              </figcaption>
            </figure>

            {/*
              Con una sola foto no hay a dónde ir: dos botones que se limitarían
              a repetirla serían un adorno que además hay que tabular.
            */}
            {fotos.length > 1 ? (
              <div className="flex justify-center gap-interno">
                <Boton jerarquia="secundario" onClick={() => mover(-1)}>
                  {t("galeria.anterior")}
                </Boton>
                <Boton jerarquia="secundario" onClick={() => mover(1)}>
                  {t("galeria.siguiente")}
                </Boton>
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
