"use client";

import { useEffect, useRef } from "react";

import {
  AMPLITUD_TITILEO,
  BRILLO_HALO,
  CAPAS_CIELO,
  DENSIDAD_PIXELES_MAXIMA,
  DURACION_ENCENDIDO_MS,
  ESCALA_HALO_ESTRELLA,
  FOTOGRAMAS_CIELO,
  FUGACES,
  MAXIMO_ESTRELLAS_POR_CAPA,
  PERIODO_TITILEO_MS,
  PROPORCION_ESTRELLAS_CALIDAS,
  SEMILLAS_CIELO,
  VIA_LACTEA,
} from "@/config/cielo";
import { entre, generador } from "@/lib/azar";

/**
 * UN FIRMAMENTO ENTERO, EN UN LIENZO
 *
 * Tres profundidades de estrellas que titilan, una Vía Láctea, estrellas
 * fugaces de vez en cuando y un paralaje al bajar: lo de cerca se mueve más
 * que lo del fondo. Cientos de puntos que cambian treinta veces por segundo
 * no caben en el DOM sin que el móvil lo note, así que van en un `<canvas>`.
 *
 * LO QUE NO HACE, a propósito:
 *  - No pinta nada fuera de pantalla: con la pestaña oculta o el lienzo fuera
 *    de la vista, el bucle se para.
 *  - No se mueve con movimiento reducido: se pinta una vez, entero, quieto.
 *  - No lleva colores: los lee de los tokens `--cielo-*` del propio lienzo, y
 *    por eso un bloque que los reasigne cambia el cielo sin tocar esto.
 *  - No es contenido: `aria-hidden`, y sin él la página se lee igual.
 *
 * El estado se publica en `data-cielo` —`vivo`, `quieto` o `pausado`— y el
 * número de estrellas pintadas en `data-estrellas`: es lo que miran los tests.
 */

interface Estrella {
  /** Posición, en proporción del lienzo (0–1). */
  u: number;
  v: number;
  radio: number;
  brillo: number;
  calida: boolean;
  /** 0 si no titila; si titila, su periodo en milisegundos. */
  periodo: number;
  fase: number;
}

interface Colores {
  estrella: string;
  calida: string;
  via: string;
  viaFinal: string;
  fugaz: string;
}

interface Fugaz {
  inicio: number;
  x: number;
  y: number;
  angulo: number;
}

/** Distancia de un punto (en proporciones) al eje de la Vía Láctea. */
function distanciaAlaVia(u: number, v: number): number {
  const [x1, y1] = VIA_LACTEA.desde;
  const [x2, y2] = VIA_LACTEA.hasta;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.abs(dy * u - dx * v + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
}

/**
 * Las estrellas de cada capa, en proporciones. Se generan TODAS las que caben
 * en el tope y se pintan las primeras que pida la superficie: así, al girar el
 * móvil o cambiar el tamaño de la ventana, las que ya estaban siguen en su
 * sitio y sólo aparecen o se van las del final de la lista.
 */
function sembrar(semilla: number, conVia: boolean): Estrella[][] {
  const azar = generador(semilla);
  return CAPAS_CIELO.map((capa) => {
    const estrellas: Estrella[] = [];
    while (estrellas.length < MAXIMO_ESTRELLAS_POR_CAPA) {
      const u = azar();
      const v = azar();
      /*
        LA VÍA LÁCTEA SE HACE DESCARTANDO, no añadiendo: fuera de la franja,
        una parte de las candidatas del fondo se tira. El resultado tiene la
        misma cuenta total y más densidad dentro de la franja.
      */
      if (conVia && capa.clave === "lejos") {
        const dentro = distanciaAlaVia(u, v) < VIA_LACTEA.anchura / 2;
        if (!dentro && azar() > 1 / VIA_LACTEA.refuerzo) continue;
      }
      const titila = azar() < capa.titilan;
      estrellas.push({
        u,
        v,
        radio: entre(azar, capa.radio),
        brillo: entre(azar, capa.brillo),
        calida: capa.clave !== "lejos" && azar() < PROPORCION_ESTRELLAS_CALIDAS,
        periodo: titila ? entre(azar, PERIODO_TITILEO_MS) : 0,
        fase: azar() * Math.PI * 2,
      });
    }
    return estrellas;
  });
}

function leerColores(lienzo: HTMLElement): Colores {
  const estilo = getComputedStyle(lienzo);
  const token = (nombre: string) => estilo.getPropertyValue(nombre).trim();
  return {
    estrella: token("--cielo-estrella"),
    calida: token("--cielo-estrella-calida"),
    via: token("--cielo-via-lactea"),
    viaFinal: token("--cielo-via-lactea-final"),
    fugaz: token("--cielo-fugaz"),
  };
}

export function CieloEstrellado({
  semilla = SEMILLAS_CIELO.portada,
  viaLactea = false,
  fugaces = false,
  densidad = 1,
  className = "",
}: {
  semilla?: number;
  /** La franja de la Vía Láctea: para los cielos grandes, no para una ventana. */
  viaLactea?: boolean;
  /** Estrellas fugaces de vez en cuando. */
  fugaces?: boolean;
  /** Cuántas veces la densidad de `CAPAS_CIELO`: para lienzos pequeños. */
  densidad?: number;
  className?: string;
}) {
  const referencia = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const lienzo = referencia.current;
    const contexto = lienzo?.getContext("2d");
    if (!lienzo || !contexto) return;

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const capas = sembrar(semilla, viaLactea);
    const colores = leerColores(lienzo);
    const azar = generador(semilla ^ 0x9e3779b9);
    /*
      EL CIELO SE ENCIENDE CUANDO SE VE, no al cargar: el del final está a
      quince pantallas de la portada, y encenderlo al cargar sería encenderlo
      para nadie. `nacimiento` es el primer instante en pantalla.
    */
    let nacimiento = 0;

    let ancho = 0;
    let alto = 0;
    let cuantas: number[] = [];
    let enPantalla = false;
    let peticion = 0;
    let ultimo = 0;
    let fugaz: Fugaz | null = null;
    let proximaFugaz = Infinity;

    function medir() {
      const caja = lienzo!.getBoundingClientRect();
      const densidad = Math.min(window.devicePixelRatio || 1, DENSIDAD_PIXELES_MAXIMA);
      ancho = caja.width;
      alto = caja.height;
      lienzo!.width = Math.round(ancho * densidad);
      lienzo!.height = Math.round(alto * densidad);
      contexto!.setTransform(densidad, 0, 0, densidad, 0, 0);
      const megapixeles = (ancho * alto) / 1_000_000;
      cuantas = CAPAS_CIELO.map((capa) =>
        Math.min(MAXIMO_ESTRELLAS_POR_CAPA, Math.round(capa.densidad * densidad * megapixeles)),
      );
      lienzo!.dataset.estrellas = String(cuantas.reduce((a, b) => a + b, 0));
    }

    function pintarVia() {
      const [x1, y1] = VIA_LACTEA.desde;
      const [x2, y2] = VIA_LACTEA.hasta;
      // Un degradado perpendicular a la franja: luz en el eje, nada a los lados.
      const mx = ((x1 + x2) / 2) * ancho;
      const my = ((y1 + y2) / 2) * alto;
      const nx = -(y2 - y1) * alto;
      const ny = (x2 - x1) * ancho;
      const largo = Math.hypot(nx, ny);
      const media = (VIA_LACTEA.anchura / 2) * Math.hypot(ancho, alto);
      const ux = (nx / largo) * media;
      const uy = (ny / largo) * media;
      const luz = contexto!.createLinearGradient(mx - ux, my - uy, mx + ux, my + uy);
      luz.addColorStop(0, colores.viaFinal);
      luz.addColorStop(0.5, colores.via);
      luz.addColorStop(1, colores.viaFinal);
      contexto!.fillStyle = luz;
      contexto!.fillRect(0, 0, ancho, alto);
    }

    function pintarFugaz(ahora: number) {
      if (!fugaz) return;
      const avance = (ahora - fugaz.inicio) / FUGACES.duracionMs;
      if (avance >= 1) {
        fugaz = null;
        return;
      }
      const largo = FUGACES.estela * ancho;
      const recorrido = largo * 2.2 * avance;
      const coseno = Math.cos(fugaz.angulo);
      const seno = Math.sin(fugaz.angulo);
      const cabezaX = fugaz.x + coseno * recorrido;
      const cabezaY = fugaz.y + seno * recorrido;
      const colaX = cabezaX - coseno * largo;
      const colaY = cabezaY - seno * largo;
      // Entra y se apaga: brilla en el medio del recorrido.
      const intensidad = Math.sin(Math.PI * avance);
      const estela = contexto!.createLinearGradient(colaX, colaY, cabezaX, cabezaY);
      estela.addColorStop(0, "transparent");
      estela.addColorStop(1, colores.fugaz);
      contexto!.globalAlpha = intensidad;
      contexto!.strokeStyle = estela;
      contexto!.lineWidth = FUGACES.grosor;
      contexto!.lineCap = "round";
      contexto!.beginPath();
      contexto!.moveTo(colaX, colaY);
      contexto!.lineTo(cabezaX, cabezaY);
      contexto!.stroke();
    }

    function pintar(ahora: number) {
      contexto!.clearRect(0, 0, ancho, alto);
      contexto!.globalAlpha = 1;
      if (viaLactea) pintarVia();

      // Lo que se ha bajado desde que el lienzo empezó en lo alto de la pantalla.
      const bajado = quieto ? 0 : -lienzo!.getBoundingClientRect().top;
      const vivido = quieto ? Infinity : nacimiento ? ahora - nacimiento : 0;

      CAPAS_CIELO.forEach((capa, indice) => {
        const encendido = Math.min(
          1,
          Math.max(0, (vivido - capa.retardo) / DURACION_ENCENDIDO_MS),
        );
        if (encendido === 0) return;
        const desplazamiento = bajado * capa.paralaje;
        const lista = capas[indice];
        for (let i = 0; i < cuantas[indice]; i += 1) {
          const estrella = lista[i];
          const x = estrella.u * ancho;
          // Se envuelve en vertical: lo que sube por arriba vuelve por abajo.
          const y = (((estrella.v * alto - desplazamiento) % alto) + alto) % alto;
          const titileo =
            estrella.periodo && !quieto
              ? 1 -
                AMPLITUD_TITILEO *
                  (0.5 +
                    0.5 * Math.sin((ahora / estrella.periodo) * Math.PI * 2 + estrella.fase))
              : 1;
          const alfa = estrella.brillo * titileo * encendido;
          contexto!.fillStyle = estrella.calida ? colores.calida : colores.estrella;
          if (capa.clave === "cerca") {
            // El halo es luz que se apaga hacia fuera, no un disco.
            const radioHalo = estrella.radio * ESCALA_HALO_ESTRELLA;
            const halo = contexto!.createRadialGradient(x, y, 0, x, y, radioHalo);
            halo.addColorStop(0, estrella.calida ? colores.calida : colores.estrella);
            halo.addColorStop(1, "transparent");
            contexto!.fillStyle = halo;
            contexto!.globalAlpha = alfa * BRILLO_HALO;
            contexto!.beginPath();
            contexto!.arc(x, y, radioHalo, 0, Math.PI * 2);
            contexto!.fill();
            contexto!.fillStyle = estrella.calida ? colores.calida : colores.estrella;
          }
          contexto!.globalAlpha = alfa;
          contexto!.beginPath();
          contexto!.arc(x, y, estrella.radio, 0, Math.PI * 2);
          contexto!.fill();
        }
      });

      if (fugaces && !quieto) {
        if (!fugaz && ahora >= proximaFugaz) {
          fugaz = {
            inicio: ahora,
            x: entre(azar, [0.05, 0.55]) * ancho,
            y: entre(azar, [0.04, 0.4]) * alto,
            angulo: (entre(azar, FUGACES.angulo) * Math.PI) / 180,
          };
          proximaFugaz = ahora + FUGACES.duracionMs + entre(azar, FUGACES.intervaloMs);
        }
        pintarFugaz(ahora);
      }
      contexto!.globalAlpha = 1;
    }

    function bucle(ahora: number) {
      peticion = requestAnimationFrame(bucle);
      if (ahora - ultimo < 1000 / FOTOGRAMAS_CIELO) return;
      ultimo = ahora;
      pintar(ahora);
    }

    function decidir() {
      cancelAnimationFrame(peticion);
      if (quieto) {
        lienzo!.dataset.cielo = "quieto";
        pintar(performance.now());
        return;
      }
      if (enPantalla && document.visibilityState === "visible") {
        lienzo!.dataset.cielo = "vivo";
        peticion = requestAnimationFrame(bucle);
      } else {
        lienzo!.dataset.cielo = "pausado";
      }
    }

    medir();
    pintar(performance.now());

    const vigia = new IntersectionObserver(([entrada]) => {
      enPantalla = entrada.isIntersecting;
      if (enPantalla && !nacimiento) {
        nacimiento = performance.now();
        proximaFugaz = nacimiento + FUGACES.primeraMs;
      }
      decidir();
    });
    vigia.observe(lienzo);

    const tamano = new ResizeObserver(() => {
      medir();
      pintar(performance.now());
    });
    tamano.observe(lienzo);

    document.addEventListener("visibilitychange", decidir);
    decidir();

    return () => {
      cancelAnimationFrame(peticion);
      vigia.disconnect();
      tamano.disconnect();
      document.removeEventListener("visibilitychange", decidir);
    };
  }, [semilla, viaLactea, fugaces, densidad]);

  return (
    <canvas
      ref={referencia}
      aria-hidden
      data-cielo-estrellado=""
      className={`pointer-events-none block ${className}`}
    />
  );
}
