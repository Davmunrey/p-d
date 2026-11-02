"use client";

import { useEffect, useRef } from "react";

import {
  AMPLITUD_TITILEO,
  APAGADO_AL_AMANECER,
  BRILLO_HALO,
  CAPAS_CIELO,
  DENSIDAD_PIXELES_MAXIMA,
  DURACION_ENCENDIDO_MS,
  ESCALA_HALO_ESTRELLA,
  FOTOGRAMAS_CIELO,
  FUGACES,
  GIRO_CIELO,
  MAXIMO_ESTRELLAS_POR_CAPA,
  PERIODO_TITILEO_MS,
  PROPORCION_ESTRELLAS_CALIDAS,
  SEMILLA_CIELO,
  VIA_LACTEA,
} from "@/config/cielo";
import { entre, generador } from "@/lib/azar";

/**
 * UN FIRMAMENTO ENTERO, EN UN LIENZO, QUE GIRA CON LA NOCHE
 *
 * Tres profundidades de estrellas que titilan, una Vía Láctea y estrellas
 * fugaces de vez en cuando. Cientos de puntos que cambian treinta veces por
 * segundo no caben en el DOM sin que el móvil lo note, así que van en un
 * `<canvas>`.
 *
 * EL CIELO GIRA MIENTRAS SE BAJA, alrededor de un polo que queda por encima de
 * la pantalla: las estrellas cruzan en arco y la Vía Láctea se va de lado, así
 * que la portada y el final de la noche no tienen el mismo cielo encima. Y SE
 * APAGA AL AMANECER: cuanto más cerca está la franja del amanecer
 * (`[data-amanecer]`), menos brillan, y por debajo de ella no queda ninguna.
 *
 * Va dentro del tramo de la noche (`[data-tramo]`), pegado arriba: lo que ha
 * girado se mide por lo que se ha bajado dentro de ese tramo.
 *
 * LO QUE NO HACE, a propósito:
 *  - No pinta nada fuera de pantalla: con la pestaña oculta o el lienzo fuera
 *    de la vista, el bucle se para.
 *  - No se mueve con movimiento reducido: ni titila ni gira. Sólo se vuelve a
 *    pintar al bajar, para irse apagando al llegar el amanecer.
 *  - No lleva colores: los lee de los tokens `--cielo-*` del propio lienzo.
 *  - No es contenido: `aria-hidden`, y sin él la página se lee igual.
 *
 * El estado se publica en `data-cielo` —`vivo`, `quieto` o `pausado`—, las
 * estrellas sembradas en `data-estrellas` y cuánto ha girado, en grados, en
 * `data-giro`: es lo que miran los tests.
 */

/** Una estrella del cielo, en coordenadas del polo: radio (0–1) y ángulo. */
interface Estrella {
  radio: number;
  angulo: number;
  tamano: number;
  brillo: number;
  calida: boolean;
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

const VUELTA = Math.PI * 2;
const RADIANES_POR_GRADO = Math.PI / 180;

/** La normal de la Vía Láctea y su distancia al polo, en radios del cielo. */
const [VIA_DX, VIA_DY] = VIA_LACTEA.direccion;
const VIA_LARGO = Math.hypot(VIA_DX, VIA_DY);
const VIA_NORMAL = [-VIA_DY / VIA_LARGO, VIA_DX / VIA_LARGO] as const;
const VIA_DISTANCIA =
  VIA_LACTEA.centro[0] * VIA_NORMAL[0] + VIA_LACTEA.centro[1] * VIA_NORMAL[1];

/** Lo lejos que queda un punto (en radios del cielo) del eje de la Vía Láctea. */
function distanciaALaVia(x: number, y: number): number {
  return Math.abs(x * VIA_NORMAL[0] + y * VIA_NORMAL[1] - VIA_DISTANCIA);
}

/**
 * Siembra el círculo entero que barre la pantalla al girar, capa a capa y
 * siempre en el mismo orden: si caben menos, se pintan las primeras, y el
 * cielo no se reordena al cambiar de tamaño. El radio va con raíz cuadrada
 * para que la densidad sea igual en todo el círculo y no se amontonen en el
 * polo.
 */
function sembrar(semilla: number, conVia: boolean): Estrella[][] {
  const azar = generador(semilla);
  return CAPAS_CIELO.map((capa) => {
    const estrellas: Estrella[] = [];
    while (estrellas.length < MAXIMO_ESTRELLAS_POR_CAPA) {
      const radio = Math.sqrt(azar());
      const angulo = azar() * VUELTA;
      /*
        LA VÍA LÁCTEA SE HACE DESCARTANDO, no añadiendo: fuera de la franja,
        una parte de las candidatas del fondo se tira. El resultado tiene la
        misma cuenta total y más densidad dentro de la franja.
      */
      if (conVia && capa.clave === "lejos") {
        const x = radio * Math.cos(angulo);
        const y = radio * Math.sin(angulo);
        const dentro = distanciaALaVia(x, y) < VIA_LACTEA.anchura / 2;
        if (!dentro && azar() > 1 / VIA_LACTEA.refuerzo) continue;
      }
      const titila = azar() < capa.titilan;
      estrellas.push({
        radio,
        angulo,
        tamano: entre(azar, capa.radio),
        brillo: entre(azar, capa.brillo),
        calida: capa.clave !== "lejos" && azar() < PROPORCION_ESTRELLAS_CALIDAS,
        periodo: titila ? entre(azar, PERIODO_TITILEO_MS) : 0,
        fase: azar() * VUELTA,
      });
    }
    return estrellas;
  });
}

/** Los colores salen de los tokens, leídos del propio lienzo. */
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
  semilla = SEMILLA_CIELO,
  viaLactea = false,
  fugaces = false,
  className = "",
}: {
  semilla?: number;
  viaLactea?: boolean;
  fugaces?: boolean;
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
    // El tramo dentro del que gira, y el horizonte donde se apaga.
    const tramo = lienzo.closest<HTMLElement>("[data-tramo]");
    const horizonte = document.querySelector<HTMLElement>("[data-amanecer]");

    /*
      EL CIELO SE ENCIENDE CUANDO SE VE, no al cargar. `nacimiento` es el
      primer instante en pantalla.
    */
    let nacimiento = 0;

    let ancho = 0;
    let alto = 0;
    let poloX = 0;
    let poloY = 0;
    let radioCielo = 0;
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
      poloX = GIRO_CIELO.polo[0] * ancho;
      poloY = GIRO_CIELO.polo[1] * alto;
      // Del polo a la esquina más lejana: el círculo que barre la pantalla.
      radioCielo = Math.max(
        Math.hypot(poloX, poloY - alto),
        Math.hypot(ancho - poloX, poloY - alto),
        Math.hypot(poloX, poloY),
        Math.hypot(ancho - poloX, poloY),
      );
      const megapixeles = (Math.PI * radioCielo * radioCielo) / 1_000_000;
      cuantas = CAPAS_CIELO.map((capa) =>
        Math.min(MAXIMO_ESTRELLAS_POR_CAPA, Math.round(capa.densidad * megapixeles)),
      );
      lienzo!.dataset.estrellas = String(cuantas.reduce((a, b) => a + b, 0));
    }

    /** Lo que se ha bajado dentro de la noche, en píxeles. */
    function bajado(): number {
      if (!tramo) return 0;
      return Math.max(0, -tramo.getBoundingClientRect().top);
    }

    /** Dónde queda el horizonte, en coordenadas del lienzo. */
    function lineaDelHorizonte(): number {
      if (!horizonte) return Infinity;
      return horizonte.getBoundingClientRect().top - lienzo!.getBoundingClientRect().top;
    }

    function pintarVia() {
      const [nx, ny] = VIA_NORMAL;
      const centroX = poloX + nx * VIA_DISTANCIA * radioCielo;
      const centroY = poloY + ny * VIA_DISTANCIA * radioCielo;
      const media = (VIA_LACTEA.anchura / 2) * radioCielo;
      const luz = contexto!.createLinearGradient(
        centroX - nx * media,
        centroY - ny * media,
        centroX + nx * media,
        centroY + ny * media,
      );
      luz.addColorStop(0, colores.viaFinal);
      luz.addColorStop(0.5, colores.via);
      luz.addColorStop(1, colores.viaFinal);
      contexto!.fillStyle = luz;
      contexto!.fillRect(
        poloX - radioCielo,
        poloY - radioCielo,
        radioCielo * 2,
        radioCielo * 2,
      );
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
      // Entra y se va: el brillo sube y baja a lo largo del recorrido.
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

      const giro = quieto ? 0 : (bajado() / alto) * GIRO_CIELO.gradosPorPantalla;
      const radianes = giro * RADIANES_POR_GRADO;
      lienzo!.dataset.giro = giro.toFixed(2);

      const linea = lineaDelHorizonte();
      const apagado = APAGADO_AL_AMANECER.pantallas * alto;
      // Pasado el horizonte no queda cielo que pintar.
      if (linea <= 0) return;

      if (viaLactea) {
        contexto!.save();
        contexto!.translate(poloX, poloY);
        contexto!.rotate(radianes);
        contexto!.translate(-poloX, -poloY);
        pintarVia();
        contexto!.restore();
      }

      const vivido = quieto ? Infinity : nacimiento ? ahora - nacimiento : 0;

      CAPAS_CIELO.forEach((capa, indice) => {
        const encendido = Math.min(
          1,
          Math.max(0, (vivido - capa.retardo) / DURACION_ENCENDIDO_MS),
        );
        if (encendido === 0) return;
        const lista = capas[indice];
        for (let i = 0; i < cuantas[indice]; i += 1) {
          const estrella = lista[i];
          const distancia = estrella.radio * radioCielo;
          const x = poloX + distancia * Math.cos(estrella.angulo + radianes);
          const y = poloY + distancia * Math.sin(estrella.angulo + radianes);
          // Fuera de la pantalla, o ya en el amanecer: no se pinta.
          if (x < 0 || x > ancho || y < 0 || y > Math.min(alto, linea)) continue;

          const titileo =
            estrella.periodo && !quieto
              ? 1 -
                AMPLITUD_TITILEO *
                  (0.5 + 0.5 * Math.sin((ahora / estrella.periodo) * VUELTA + estrella.fase))
              : 1;
          const alfa = estrella.brillo * titileo * encendido;
          const color = estrella.calida ? colores.calida : colores.estrella;
          if (capa.clave === "cerca") {
            const radioHalo = estrella.tamano * ESCALA_HALO_ESTRELLA;
            const halo = contexto!.createRadialGradient(x, y, 0, x, y, radioHalo);
            halo.addColorStop(0, color);
            halo.addColorStop(1, "transparent");
            contexto!.fillStyle = halo;
            contexto!.globalAlpha = alfa * BRILLO_HALO;
            contexto!.beginPath();
            contexto!.arc(x, y, radioHalo, 0, VUELTA);
            contexto!.fill();
          }
          contexto!.fillStyle = color;
          contexto!.globalAlpha = alfa;
          contexto!.beginPath();
          contexto!.arc(x, y, estrella.tamano, 0, VUELTA);
          contexto!.fill();
        }
      });

      // Las fugaces cruzan la parte alta, y sólo mientras queda noche arriba.
      if (fugaces && !quieto && linea > alto / 2) {
        if (!fugaz && ahora >= proximaFugaz) {
          fugaz = {
            inicio: ahora,
            x: entre(azar, [0.05, 0.55]) * ancho,
            y: entre(azar, [0.04, 0.4]) * alto,
            angulo: entre(azar, FUGACES.angulo) * RADIANES_POR_GRADO,
          };
          proximaFugaz = ahora + FUGACES.duracionMs + entre(azar, FUGACES.intervaloMs);
        }
        pintarFugaz(ahora);
      }
      contexto!.globalAlpha = 1;

      /*
        EL AMANECER APAGA EL CIELO. Con todo ya pintado —estrellas, Vía Láctea
        y fugaces—, se borra con un degradado lo que queda cerca del horizonte:
        nada por debajo de él, y cada vez menos según se acerca. Así se apaga
        todo a la vez y por igual, también los halos que rozan la línea.
      */
      if (linea - apagado < alto) {
        const desde = linea - apagado;
        const borrado = contexto!.createLinearGradient(0, desde, 0, linea);
        borrado.addColorStop(0, "transparent");
        borrado.addColorStop(1, colores.estrella);
        contexto!.save();
        contexto!.globalCompositeOperation = "destination-out";
        contexto!.fillStyle = borrado;
        contexto!.fillRect(0, desde, ancho, alto - desde);
        contexto!.restore();
      }
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

    /*
      QUIETO, SE PINTA AL BAJAR. Sin bucle, el cielo sólo cambia con el
      scroll —se va apagando según llega el amanecer—, así que se vuelve a
      pintar entonces, una vez por fotograma como mucho.
    */
    let repintado = 0;
    function alBajar() {
      if (repintado) return;
      repintado = requestAnimationFrame(() => {
        repintado = 0;
        pintar(performance.now());
      });
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
    if (quieto) window.addEventListener("scroll", alBajar, { passive: true });
    decidir();

    return () => {
      cancelAnimationFrame(peticion);
      cancelAnimationFrame(repintado);
      vigia.disconnect();
      tamano.disconnect();
      document.removeEventListener("visibilitychange", decidir);
      window.removeEventListener("scroll", alBajar);
    };
  }, [semilla, viaLactea, fugaces]);

  return (
    <canvas
      ref={referencia}
      aria-hidden
      data-cielo-estrellado=""
      className={`pointer-events-none block ${className}`}
    />
  );
}
