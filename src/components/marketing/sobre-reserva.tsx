"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Sello } from "@/components/marketing/sello";
import { TarjetaReserva } from "@/components/marketing/tarjeta-reserva";
import { BotonEnlace } from "@/components/ui/boton";
import { Constelacion } from "@/components/ui/constelacion";
import { Etiqueta } from "@/components/ui/tipografia";
import { CONSTELACION_NOVIOS } from "@/config/constelaciones";
import {
  BUCKET_MEDIOS,
  FASES_APERTURA_SOBRE_MS,
  PARAMETRO_SOBRE_ABIERTO,
  RUTA_CALENDARIO,
} from "@/config/constants";
import { rutaDe } from "@/config/secciones";
import type { Medio } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * EL SOBRE DEL SAVE THE DATE
 *
 * La pieza de la entrega: un sobre cerrado con un sello que late. Al tocarlo,
 * la solapa gira, asoma la foto, asoma la tarjeta, el sobre se va y los dos
 * naipes quedan sobre la mesa con el pie debajo — la nota, «añadir al
 * calendario», «ver la web» y la forma de volver a meterlo todo en el sobre.
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
  fechaTexto,
  anio,
  lugar,
  remite,
  foto,
  urlBase,
  abiertoAlLlegar,
}: {
  nombreNovia: string;
  nombreNovio: string;
  fechaIso: string;
  fechaTexto: string;
  anio: string;
  lugar: string | null;
  /** «Paloma & David · León», lo que va impreso en el dorso del sobre. */
  remite: string;
  /** La foto que sale del sobre con la tarjeta, o `null` si no hay ninguna. */
  foto: Medio | null;
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

  function abrir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (fase !== CERRADO) return;
    limpiar();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFase(ABIERTO);
      return;
    }

    setFase(1);
    const pasos: readonly (readonly [number, Fase])[] = [
      [FASES_APERTURA_SOBRE_MS.foto, 2],
      [FASES_APERTURA_SOBRE_MS.tarjeta, 3],
      [FASES_APERTURA_SOBRE_MS.fuera, ABIERTO],
    ];
    temporizadores.current = pasos.map(([ms, siguiente]) =>
      window.setTimeout(() => setFase(siguiente), ms),
    );
  }

  function cerrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    limpiar();
    setFase(CERRADO);
  }

  const fuente =
    foto && urlBase
      ? `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${foto.ruta}`
      : null;

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
            El sobre: el cuerpo, su trama, el dorso en pico con el brillo y el
            remite, la solapa con la Lira y el sello encima. Abierto, se funde y
            queda inerte: nada de dentro se puede tocar ni enfocar.
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

            <div className="solapa" data-lienzo="solapa">
              <div className="solapa-papel" />
              <div className="solapa-lira" aria-hidden="true">
                <div className="rotate-180">
                  <Constelacion clave={CONSTELACION_NOVIOS} />
                </div>
              </div>
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
              fechaTexto={fechaTexto}
              anio={anio}
              lugar={lugar}
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
        <p className="mx-auto mb-nota-sobre-abajo max-w-nota-sobre font-titulo peso-titulo text-nota-sobre leading-cita text-tinta-suave italic">
          {t("saveTheDate.nota")}
        </p>

        <div className="flex flex-wrap justify-center gap-hueco-boton">
          {/*
            Enlace normal y no `next/link`: el destino no es una página, es un
            fichero que se descarga. Con el enrutador de Next por medio, el
            navegador intentaría navegar a él.
          */}
          <BotonEnlace href={RUTA_CALENDARIO} prefetch={false} download>
            <IconoCalendario />
            {t("saveTheDate.anadirCalendario")}
          </BotonEnlace>
          <BotonEnlace href="/" jerarquia="secundario">
            {t("saveTheDate.verLaWeb")}
          </BotonEnlace>
        </div>

        {/* Sin JavaScript, volver es cargar la página sin `?abierto`. */}
        <form method="get" action={rutaDe("reserva_la_fecha")} onSubmit={cerrar}>
          <button
            type="submit"
            className="mt-volver-sobre min-h-control-compacto cursor-pointer px-hueco-corto font-cuerpo text-etiqueta uppercase tracking-volver text-tinta-tenue transicion-color hover:text-acento"
          >
            {t("saveTheDate.volverAlSobre")}
          </button>
        </form>
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
