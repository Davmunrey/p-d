"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { EstrellasDelRetrato } from "@/components/marketing/estrellas-del-retrato";
import { Sello } from "@/components/marketing/sello";
import { TarjetaReserva } from "@/components/marketing/tarjeta-reserva";
import { BotonEnlace } from "@/components/ui/boton";
import { Etiqueta } from "@/components/ui/tipografia";
import { EVENTO_FUGAZ, RETRATO_EN_LA_SOLAPA } from "@/config/cielo";
import {
  BUCKET_MEDIOS,
  FASES_APERTURA_SOBRE_MS,
  PARAMETRO_SOBRE_ABIERTO,
  RUTA_CALENDARIO,
} from "@/config/constants";
import { rutaDe } from "@/config/secciones";
import type { Medio, Retrato } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * EL SOBRE DEL SAVE THE DATE
 *
 * Un sobre de noche, bajo el cielo de la landing, con el lacre de bronce que
 * late y el retrato de estrellas de Paloma, Hati y David en la solapa. Al
 * tocarlo, la solapa gira, cruza una estrella fugaz, la tarjeta sale con una
 * luz detrás y el retrato se dibuja en ella estrella a estrella; el sobre se
 * va y debajo quedan «añadir al calendario» y la forma de volver a meterlo
 * todo en el sobre.
 *
 * DE AQUÍ NO SE SALTA A LA WEB: ni «ver la web» ni nota que mande a ella. El
 * Save the Date va a quien todavía no tiene invitación, y la web es lo que
 * llega con ella (lo pidieron los novios).
 *
 * CINCO FASES Y TRES TEMPORIZADORES. La fase 0 es el sobre cerrado; la 1
 * empieza al tocar el sello; las tres siguientes las marcan los tiempos de
 * `FASES_APERTURA_SOBRE_MS`. Todo lo que se ve en cada fase lo decide el CSS
 * de `sobre.css` a partir de cuatro atributos de datos: aquí sólo se cuenta.
 * Volver a cerrarlo limpia los temporizadores que queden, para que un sobre
 * cerrado a medio abrir no se abra solo un segundo después.
 *
 * SE ABRE SIN JAVASCRIPT. El sello es el botón de un formulario GET que
 * añade `?abierto` a la URL, y el servidor pinta entonces el sobre ya abierto.
 * Con JavaScript el envío se intercepta y la apertura es la animada; sin él
 * —o antes de hidratar, en la conexión del pueblo— la pulsación recarga la
 * página con la tarjeta a la vista. Nunca un botón que no hace nada.
 *
 * CON MOVIMIENTO REDUCIDO no hay coreografía: al tocar el sello se salta a la
 * última fase. Las transiciones ya las anula el CSS; lo que no puede anular
 * son los dos segundos de espera, y para quien ha pedido menos movimiento dos
 * segundos mirando un sobre quieto no son menos movimiento, son espera.
 *
 * EL FOCO SIGUE A LA PIEZA: al abrir del todo pasa a la tarjeta, que es lo que
 * hay que leer; al cerrar vuelve al sello. Lo que no se ve va `inert`: los
 * botones del pie plegado y la tarjeta guardada no se alcanzan con el tabulador.
 */

type Fase = 0 | 1 | 2 | 3 | 4;

const CERRADO: Fase = 0;
const ABIERTO: Fase = 4;

/** Cuánto ocupa la foto en pantalla: el naipe mide como mucho unos 330 px. */
const MEDIDAS_FOTO = "(min-width: 48rem) 21rem, 60vw";

export function SobreReserva({
  nombreNovia,
  nombreNovio,
  fechaIso,
  diaDeLaSemana,
  fechaEnPuntos,
  fechaLeida,
  lugar,
  remite,
  foto,
  retrato,
  urlBase,
  abiertoAlLlegar,
}: {
  nombreNovia: string;
  nombreNovio: string;
  fechaIso: string;
  diaDeLaSemana: string;
  fechaEnPuntos: string;
  fechaLeida: string;
  lugar: string | null;
  /** «Paloma & David · León», lo que va impreso en el dorso del sobre. */
  remite: string;
  /** La foto que sale del sobre con la tarjeta, o `null` si no hay ninguna. */
  foto: Medio | null;
  /** El retrato de estrellas de la solapa y de la tarjeta, o `null` si no hay. */
  retrato: Retrato | null;
  urlBase: string | undefined;
  /** El servidor ya lo pinta abierto: llegó con `?abierto` en la URL. */
  abiertoAlLlegar: boolean;
}) {
  const [fase, setFase] = useState<Fase>(abiertoAlLlegar ? ABIERTO : CERRADO);
  const temporizadores = useRef<number[]>([]);
  const faseAnterior = useRef(fase);
  const pieza = useRef<HTMLDivElement>(null);
  const sello = useRef<HTMLButtonElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);

  const limpiar = () => {
    for (const id of temporizadores.current) window.clearTimeout(id);
    temporizadores.current = [];
  };

  // Marca que el componente ya responde: los tests esperan a esto antes de
  // tocar el sello, para probar la apertura animada y no la recarga.
  useEffect(() => {
    pieza.current?.setAttribute("data-hidratado", "");
    return limpiar;
  }, []);

  useEffect(() => {
    const anterior = faseAnterior.current;
    faseAnterior.current = fase;
    if (anterior === fase) return;

    if (fase === ABIERTO) tarjeta.current?.focus({ preventScroll: true });
    else if (fase === CERRADO) sello.current?.focus({ preventScroll: true });
  }, [fase]);

  const fuente =
    foto && urlBase
      ? `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${foto.ruta}`
      : null;

  function abrir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (fase !== CERRADO) return;
    limpiar();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFase(ABIERTO);
      return;
    }

    setFase(1);
    /*
      SIN FOTO NO HAY ESPERA. El hueco entre que asoma la foto y asoma la
      tarjeta es para la foto; sin ella se quedaba medio segundo de sobre
      abierto sin que saliera nada. La tarjeta adelanta ese tiempo, pero el
      sobre se va a su hora: ese rato de más es la tarjeta asomando por la
      boca del sobre con la luz detrás, que es el momento de la pieza.
    */
    const { foto: tFoto, tarjeta: tTarjeta, fuera: tFuera } = FASES_APERTURA_SOBRE_MS;
    const adelanto = fuente ? 0 : tTarjeta - tFoto;
    const pasos: readonly (readonly [number, Fase])[] = [
      [tFoto, 2],
      [tTarjeta - adelanto, 3],
      [tFuera, ABIERTO],
    ];
    temporizadores.current = pasos.map(([ms, siguiente]) =>
      window.setTimeout(() => {
        setFase(siguiente);
        // La fugaz cruza justo cuando sale la tarjeta.
        if (siguiente === 3) window.dispatchEvent(new Event(EVENTO_FUGAZ));
      }, ms),
    );
  }

  function cerrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    limpiar();
    setFase(CERRADO);
  }

  // El escenario se sacude mientras la solapa gira y hasta que asoma la tarjeta.
  const sacudida = fase >= 1 && fase < 3;

  return (
    <div
      ref={pieza}
      className="pieza-sobre my-auto flex w-full flex-col items-center"
      data-abierto={fase >= 1 ? "" : undefined}
      data-foto={fase >= 2 ? "" : undefined}
      data-tarjeta={fase >= 3 ? "" : undefined}
      data-fuera={fase >= ABIERTO ? "" : undefined}
      data-sin-foto={fuente ? undefined : ""}
    >
      {/* «Guardad el día» entre dos rayas, y una tercera que se traza debajo. */}
      <div className="animacion-bajar-pausado relative text-center">
        <div className="flex items-center justify-center gap-interno">
          <span aria-hidden="true" className="w-raya-cabecera border-t border-borde-filete" />
          <Etiqueta espaciado="marcado" tono="acento">
            {t("saveTheDate.cabecera")}
          </Etiqueta>
          <span aria-hidden="true" className="w-raya-cabecera border-t border-borde-filete" />
        </div>
        <div
          aria-hidden="true"
          className="raya-cabecera animacion-trazar-vertical-pausado mx-auto mt-interno"
        />
      </div>

      <div className="escenario animacion-escalar-escenario">
        <div className={`h-full w-full ${sacudida ? "animacion-sacudir" : ""}`}>
          {/*
            La luz que sale con la tarjeta: un charco cálido en el cielo, detrás
            de ella, que se enciende cuando asoma y se queda mientras se lee.
          */}
          <div aria-hidden="true" className="luz-del-naipe" />

          {/*
            El sobre: el cuerpo, su trama, el dorso en pico con el brillo y el
            remite, la solapa con el retrato de estrellas y el sello encima.
            Abierto, se funde y queda inerte: nada de dentro se puede tocar ni
            enfocar.
          */}
          <div className="sobre" inert={fase !== CERRADO}>
            <div className="sobre-cuerpo" />
            <div className="sobre-trama" />
            <div className="sobre-dorso" />
            <div className="sobre-brillo" />
            <div className="sobre-remite">
              <span className="font-cuerpo text-remite uppercase tracking-remite text-tinta-remite">
                {remite}
              </span>
            </div>

            <div className="solapa">
              <div className="solapa-papel" />
              {/*
                EL RETRATO, DE PIE Y A MEDIA LUZ: impreso en la solapa como un
                grabado, en la parte ancha del pico, encima del lacre. Titila
                como en el cielo de la landing; se dibuja entero de verdad
                cuando sale en la tarjeta.
              */}
              {retrato ? (
                <div className="solapa-retrato" aria-hidden="true">
                  <EstrellasDelRetrato
                    retrato={retrato}
                    medidas={RETRATO_EN_LA_SOLAPA}
                    idHalo="halo-retrato-solapa"
                    encuadre="xMidYMin meet"
                    className="block w-auto overflow-visible"
                  />
                </div>
              ) : null}
            </div>

            <form method="get" onSubmit={abrir} className="sello-hueco">
              <input type="hidden" name={PARAMETRO_SOBRE_ABIERTO} value="1" />
              <Sello ref={sello} nombreNovia={nombreNovia} nombreNovio={nombreNovio} />
            </form>
          </div>

          {/*
            La foto, si hay una publicada en la sección `reserva_la_fecha`. Sin
            foto no se pinta un naipe vacío: la tarjeta sale sola y centrada.
          */}
          {fuente ? (
            <div className="naipe naipe-foto" aria-hidden={fase < 2 ? true : undefined}>
              <div className="tarjeta-foto flex h-full w-full flex-col p-naipe-foto">
                <div className="relative flex-1 overflow-hidden bg-hueco-foto-naipe">
                  <Image
                    src={fuente}
                    alt={foto!.textoAlternativo}
                    fill
                    sizes={MEDIDAS_FOTO}
                    className="object-cover"
                    placeholder={foto!.marcadorBorroso ? "blur" : "empty"}
                    blurDataURL={foto!.marcadorBorroso ?? undefined}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div ref={tarjeta} tabIndex={-1} className="naipe naipe-tarjeta" inert={fase < 3}>
            <TarjetaReserva
              nombreNovia={nombreNovia}
              nombreNovio={nombreNovio}
              fechaIso={fechaIso}
              diaDeLaSemana={diaDeLaSemana}
              fechaEnPuntos={fechaEnPuntos}
              fechaLeida={fechaLeida}
              lugar={lugar}
              retrato={retrato}
            />
          </div>
        </div>
      </div>

      <p
        className="pista-sobre animacion-flotar-arriba relative text-center"
        aria-hidden={fase !== CERRADO ? true : undefined}
      >
        <span className="font-cuerpo text-pista-sobre uppercase tracking-pista text-tinta-pista">
          {t("saveTheDate.pista")}
        </span>
      </p>

      <div className="pie-sobre relative text-center" inert={fase < ABIERTO}>
        <div className="pie-sobre-dentro">
          <div className="pie-sobre-contenido">
            <div className="flex justify-center">
              {/*
                Enlace normal y no `next/link`: el destino no es una página, es
                un fichero que se descarga. Con el enrutador de Next por medio,
                el navegador intentaría navegar a él.
              */}
              <BotonEnlace href={RUTA_CALENDARIO} prefetch={false} download>
                <IconoCalendario />
                {t("saveTheDate.anadirCalendario")}
              </BotonEnlace>
            </div>

            {/* Sin JavaScript, volver es cargar la página sin `?abierto`. */}
            <form method="get" action={rutaDe("reserva_la_fecha")} onSubmit={cerrar}>
              <button
                type="submit"
                className="mt-volver-sobre min-h-control-compacto cursor-pointer px-hueco-corto font-cuerpo text-etiqueta uppercase tracking-volver text-tinta-suave transicion-color hover:text-acento"
              >
                {t("saveTheDate.volverAlSobre")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/** El calendario de catorce píxeles que la entrega pone delante del botón. */
function IconoCalendario() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      className="size-icono shrink-0"
    >
      <rect x="1.5" y="3" width="13" height="11.5" rx="1.5" />
      <path d="M1.5 6.5h13M5 1.5v3M11 1.5v3" />
    </svg>
  );
}
