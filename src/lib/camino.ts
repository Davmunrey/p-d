import { CAMINO_HISTORIA } from "@/config/cielo";

import { entre, generador } from "./azar";

/**
 * EL CAMINO DE «NUESTRA HISTORIA»: una estrella por hito, de izquierda a
 * derecha por el cielo, en un lienzo de 100×100.
 *
 * No forma ninguna figura —eso era la Lira, que «parecía una casa»—: avanza
 * en horizontal a pasos iguales, y en vertical se mueve dentro de su franja
 * alternando arriba y abajo, con un desvío al azar para que no parezca una
 * gráfica. Con la semilla fija, el camino es siempre el mismo.
 */
export function caminoDeEstrellas(cuantas: number, semilla: number): [number, number][] {
  const azar = generador(semilla);
  const [alto, bajo] = CAMINO_HISTORIA.franja;
  const desde = CAMINO_HISTORIA.margen;
  const hasta = 1 - CAMINO_HISTORIA.margen;
  const desvio = CAMINO_HISTORIA.desvio;

  return Array.from({ length: cuantas }, (_, indice) => {
    const avance = cuantas === 1 ? 0.5 : indice / (cuantas - 1);
    const x = desde + avance * (hasta - desde) + entre(azar, [-desvio, desvio]) / 2;
    // Arriba y abajo, alternando, sin tocar los bordes de la franja.
    const centro = (alto + bajo) / 2;
    const amplitud = (bajo - alto) / 2;
    const lado = indice % 2 === 0 ? -1 : 1;
    const y =
      centro + lado * amplitud * entre(azar, [0.35, 1]) + entre(azar, [-desvio, desvio]);
    const recortar = (valor: number) => Math.min(1 - desde / 2, Math.max(desde / 2, valor));
    return [recortar(x) * 100, recortar(y) * 100];
  });
}
