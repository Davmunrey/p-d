import Image from "next/image";
import type { CSSProperties } from "react";

import { Cita, Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { BUCKET_MEDIOS } from "@/config/constants";
import {
  CONSTELACION_NOVIOS,
  constelacionPorClave,
  ESCALA_HALO,
  GROSOR_TRAZO,
} from "@/config/constelaciones";
import type { HitoHistoria } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/** Lado del lienzo de las constelaciones (ver `Constelacion`). */
const LIENZO = 100;

/** El nombre de la línea de tiempo de un hito: `--hito-0`, `--hito-1`… */
const nombreDeHito = (indice: number) => `--hito-${indice}`;

/** Una variable CSS en `style`, que React tipa como propiedades conocidas. */
function variable(nombre: string, valor: string): CSSProperties {
  return { [nombre]: valor } as CSSProperties;
}

/**
 * «NUESTRA HISTORIA», COMO UNA ESCENA
 *
 * La historia de los novios se cuenta con su constelación. A un lado, fija
 * mientras se baja, la Lira apagada; al otro, los hitos de la base de datos
 * pasando uno a uno. Cada hito que llega enciende su estrella —con un destello
 * que se queda como halo— y el trazo que la une con la anterior se dibuja a
 * continuación. Cuando pasa el último, la Lira está entera y aparece la frase
 * que lo cierra: cada momento fue una estrella, y juntas dibujan la suya.
 *
 * QUÉ HITO ENCIENDE CADA ESTRELLA. La estrella k la enciende el hito k; si hay
 * menos hitos que estrellas, las que sobran las enciende el último —la Lira
 * siempre se completa—, y si hay más, los que sobran ya no encienden ninguna.
 * Un trazo se dibuja con el hito que enciende la última de sus dos estrellas.
 *
 * Todo es CSS ligado al scroll (`motion.css`). Sin líneas de tiempo de scroll,
 * o con movimiento reducido, la Lira está entera desde el principio y los
 * hitos se leen como una lista, que es lo que son.
 *
 * El escenario es decoración (`aria-hidden`): para un lector de pantalla la
 * historia es la lista ordenada de hitos y la frase del cierre.
 */
export function EscenaHistoria({
  hitos,
  urlBase,
}: {
  hitos: HitoHistoria[];
  urlBase: string | undefined;
}) {
  const lira = constelacionPorClave(CONSTELACION_NOVIOS);
  const ultimo = hitos.length - 1;
  const hitoDeEstrella = (estrella: number) => Math.min(estrella, ultimo);
  const ambito = variable("--ambito-hitos", hitos.map((_, i) => nombreDeHito(i)).join(", "));

  return (
    <div className="escena-historia mt-bloque grid gap-elemento md:grid-cols-2" style={ambito}>
      {/*
        EL ESCENARIO, FIJO MIENTRAS SE BAJA. En escritorio ocupa su columna;
        en un móvil va arriba, debajo de la barra, velado para que los hitos
        pasen por debajo sin mezclarse con las estrellas.
      */}
      <div
        aria-hidden
        className="sticky top-cabecera flex h-escenario-historia-movil items-center justify-center max-md:velada max-md:capa-lateral md:h-escenario-historia"
      >
        <div className="relative size-constelacion-historia">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="animacion-cielo-claro cielo-claro pointer-events-none absolute -inset-sangrado-cielo" />
          </div>

          {lira ? (
            <div className="absolute inset-aire-constelacion">
              <svg
                viewBox={`0 0 ${LIENZO} ${LIENZO}`}
                className="block h-full w-full overflow-visible"
                fill="none"
              >
                {lira.lineas.map(([desde, hasta]) => {
                  const [x1, y1] = lira.estrellas[desde];
                  const [x2, y2] = lira.estrellas[hasta];
                  const hito = Math.max(hitoDeEstrella(desde), hitoDeEstrella(hasta));
                  return (
                    <line
                      key={`${desde}-${hasta}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      pathLength={1}
                      className="trazo-historia stroke-constelacion-trazo"
                      strokeWidth={GROSOR_TRAZO}
                      strokeLinecap="round"
                      style={variable("--linea-de-tiempo", nombreDeHito(hito))}
                    />
                  );
                })}

                {lira.estrellas.map(([x, y, radio], estrella) => {
                  const tiempo = variable(
                    "--linea-de-tiempo",
                    nombreDeHito(hitoDeEstrella(estrella)),
                  );
                  return (
                    <g key={`${x}-${y}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={radio * ESCALA_HALO}
                        className="halo-historia fill-acento"
                        style={tiempo}
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={radio}
                        className="estrella-historia fill-constelacion-estrella"
                        style={tiempo}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <ol>
          {hitos.map((hito, indice) => (
            <li
              key={hito.id}
              className="hito-en-escena flex min-h-hito-escena-movil items-center md:min-h-hito-escena"
              style={variable("--nombre-hito", nombreDeHito(indice))}
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

        {/* El cierre llega con el último hito, cuando la Lira ya está entera. */}
        <div
          className="cierre-historia pb-elemento"
          style={variable("--linea-de-tiempo", nombreDeHito(ultimo))}
        >
          <Cita>{t("historia.cierre")}</Cita>
        </div>
      </div>
    </div>
  );
}
