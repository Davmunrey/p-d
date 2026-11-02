"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { CieloEstrellado } from "@/components/marketing/cielo-estrellado";
import { Cita, Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import {
  CAMINO_HISTORIA,
  DENSIDAD_VENTANA_HISTORIA,
  LINEA_DE_LA_HORA,
  SEMILLAS_CIELO,
} from "@/config/cielo";
import { BUCKET_MEDIOS } from "@/config/constants";
import { GROSOR_TRAZO } from "@/config/constelaciones";
import type { HitoHistoria } from "@/lib/bbdd/landing";
import { caminoDeEstrellas } from "@/lib/camino";
import { t } from "@/lib/copy";

/** Lado del lienzo del camino: proporciones en un cuadrado de 100. */
const LIENZO = 100;

/** El degradado del halo. Hay una sola escena por página: el id no choca. */
const ID_HALO = "halo-del-camino";

const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

/**
 * Si la escena puede apagarse para encenderse: en el navegador y con
 * movimiento. En el servidor no —todo encendido—, y así sin JavaScript la
 * historia se ve entera.
 */
function suscribirMovimiento(avisar: () => void) {
  const consulta = window.matchMedia(SIN_MOVIMIENTO);
  consulta.addEventListener("change", avisar);
  return () => consulta.removeEventListener("change", avisar);
}
const conMovimiento = () => !window.matchMedia(SIN_MOVIMIENTO).matches;
const enElServidor = () => false;

/**
 * «NUESTRA HISTORIA», COMO UNA ESCENA
 *
 * A un lado, fija mientras se baja, una ventana al cielo de noche; al otro,
 * los hitos de la base de datos pasando uno a uno. Cada hito, al llegar a
 * media pantalla, enciende su estrella —un destello que se queda como halo—
 * y el hilo que la une con la anterior se dibuja. No forman ninguna figura:
 * es un camino que cruza el cielo, de la primera estrella a la última. Con el
 * último hito aparece la frase que lo cierra.
 *
 * LO ENCIENDE UN `IntersectionObserver`, igual en todos los navegadores, y el
 * cambio es una transición de CSS (`motion.css`). Una estrella encendida no se
 * apaga al volver a subir: lo vivido, vivido está.
 *
 * SIN JAVASCRIPT, O CON MOVIMIENTO REDUCIDO, TODO ESTÁ ENCENDIDO: la escena
 * sólo se «apaga» para encenderse cuando está viva (`data-escena="viva"`). El
 * escenario es decoración (`aria-hidden`); para un lector de pantalla la
 * historia es la lista ordenada de hitos y la frase del cierre.
 */
export function EscenaHistoria({
  hitos,
  urlBase,
}: {
  hitos: HitoHistoria[];
  urlBase: string | undefined;
}) {
  const lista = useRef<HTMLOListElement>(null);
  const viva = useSyncExternalStore(suscribirMovimiento, conMovimiento, enElServidor);
  const [alcanzado, setAlcanzado] = useState(-1);
  const camino = caminoDeEstrellas(hitos.length, SEMILLAS_CIELO.historia);
  const ultimo = hitos.length - 1;

  useEffect(() => {
    if (!viva) return;
    const elementos = [...(lista.current?.children ?? [])];
    const vigia = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          const indice = elementos.indexOf(entrada.target);
          setAlcanzado((antes) => Math.max(antes, indice));
        }
      },
      { rootMargin: LINEA_DE_LA_HORA },
    );
    elementos.forEach((elemento) => vigia.observe(elemento));
    return () => vigia.disconnect();
  }, [viva]);

  const encendida = (indice: number) => (indice <= alcanzado ? "" : undefined);

  return (
    <div
      data-escena={viva ? "viva" : undefined}
      className="mt-bloque grid gap-elemento md:grid-cols-2"
    >
      {/*
        EL ESCENARIO, FIJO MIENTRAS SE BAJA. En escritorio ocupa su columna;
        en un móvil va arriba, debajo de la barra, con un velo que se
        desvanece hacia abajo para que los hitos pasen por debajo sin
        mezclarse con las estrellas.
      */}
      <div
        aria-hidden
        className="sticky top-cabecera flex h-escenario-historia-movil items-center justify-center max-md:velo-escenario max-md:capa-lateral md:h-escenario-historia"
      >
        {/*
          UNA VENTANA A LA NOCHE: es de día en la página, y la historia se
          cuenta con estrellas. Bloque inverso para que las estrellas y el hilo
          tomen los colores de noche de la marca.
        */}
        <div
          data-seccion="inversa"
          className="fondo-noche-alta relative isolate size-constelacion-historia overflow-hidden rounded-full"
        >
          <CieloEstrellado
            semilla={SEMILLAS_CIELO.historia}
            densidad={DENSIDAD_VENTANA_HISTORIA}
            className="capa-cielo absolute inset-0 size-full"
          />
          <svg
            viewBox={`0 0 ${LIENZO} ${LIENZO}`}
            className="absolute inset-0 block size-full overflow-visible text-acento"
            fill="none"
          >
            {/* El halo es luz que se apaga hacia fuera, del color del acento. */}
            <defs>
              <radialGradient id={ID_HALO}>
                <stop offset="0" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>
            {camino.slice(1).map(([x2, y2], i) => {
              const [x1, y1] = camino[i];
              return (
                <line
                  key={`hilo-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  pathLength={1}
                  data-encendida={encendida(i + 1)}
                  className="trazo-del-camino stroke-constelacion-trazo"
                  strokeWidth={GROSOR_TRAZO}
                  strokeLinecap="round"
                />
              );
            })}
            {camino.map(([x, y], i) => (
              <g key={`estrella-${i}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={CAMINO_HISTORIA.radio * CAMINO_HISTORIA.halo}
                  data-encendida={encendida(i)}
                  fill={`url(#${ID_HALO})`}
                  className="halo-del-camino"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={CAMINO_HISTORIA.radio}
                  data-encendida={encendida(i)}
                  className="estrella-del-camino fill-constelacion-estrella"
                />
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div>
        <ol ref={lista}>
          {hitos.map((hito) => (
            <li
              key={hito.id}
              className="flex min-h-hito-escena-movil items-center md:min-h-hito-escena"
            >
              <div className="animacion-subir-al-ver w-full">
                {hito.foto && urlBase ? (
                  <div className="relative mb-elemento aspect-hito overflow-hidden rounded-imagen bg-superficie-hundida">
                    <Image
                      src={`${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${hito.foto.ruta}`}
                      alt={hito.foto.textoAlternativo}
                      fill
                      // Media pantalla en escritorio, entera en un móvil.
                      sizes="(min-width: 48rem) 50vw, 100vw"
                      className="object-cover"
                      placeholder={hito.foto.marcadorBorroso ? "blur" : "empty"}
                      blurDataURL={hito.foto.marcadorBorroso ?? undefined}
                    />
                  </div>
                ) : null}

                {/* A tamaño de capítulo: cada hito es una escena, no una línea de lista. */}
                {hito.fechaTexto ? <Etiqueta tono="acento">{hito.fechaTexto}</Etiqueta> : null}
                <Titulo2 como="h3" className="mt-pila">
                  {hito.titulo}
                </Titulo2>
                {hito.descripcion ? (
                  <Cuerpo className="mt-linea max-w-texto">{hito.descripcion}</Cuerpo>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        {/* El cierre llega con el último hito, cuando el camino está entero. */}
        <div className="cierre-historia pb-elemento" data-encendida={encendida(ultimo)}>
          <Cita>{t("historia.cierre")}</Cita>
        </div>
      </div>
    </div>
  );
}
