import {
  TAMANO_TESELA,
  TESELAS_ALREDEDOR,
  URL_MAPA_EXTERNO,
  URL_TESELAS_MAPA,
  ZOOM_MAPA_FINAL,
} from "@/config/constants";

/**
 * BODA-26 · LOS DOS ENLACES DEL MAPA
 *
 * Aquí y no dentro de la página porque son dos formas de decir lo mismo —dónde
 * está la finca— y tienen que salir de las mismas coordenadas. Escritos en dos
 * sitios distintos, el día que alguien corrija una y no la otra el invitado
 * acaba en un pueblo y el mapa enseña otro.
 *
 * NINGUNA COORDENADA VIVE AQUÍ. Entran por parámetro y salen de
 * `configuracion_boda`: eso es lo que hace que cambiar la finca en la base
 * cambie la landing, que es justo lo que este ticket viene a probar.
 */

/**
 * El enlace que abre la aplicación de mapas del móvil.
 *
 * Es el enlace universal de Google y no un `geo:`, que sería más puro pero sólo
 * funciona en el teléfono: la mitad de la gente abre la invitación en el
 * ordenador para verla con calma, y ahí `geo:` no lleva a ningún sitio. Éste
 * abre la aplicación si está instalada y el navegador si no.
 */
export function enlaceMapaExterno(latitud: number, longitud: number): string {
  const punto = `${latitud},${longitud}`;
  return `${URL_MAPA_EXTERNO}?api=1&query=${encodeURIComponent(punto)}`;
}

/** Una tesela del mapa: su dirección y dónde va respecto al sitio, en píxeles. */
export interface Tesela {
  url: string;
  /** Lo que hay del sitio a la esquina de arriba a la izquierda de la tesela. */
  x: number;
  y: number;
}

/**
 * El mapa que se ve dentro de la página: las teselas de alrededor del sitio.
 *
 * ES OPENSTREETMAP Y NO GOOGLE, por dos razones que van en el mismo sentido:
 * el mapa de Google exige una clave de API —una cuenta, una facturación y una
 * variable de entorno más que configurar para que la landing no salga rota—, y
 * además le cuenta a Google quién ha abierto la invitación antes de que el
 * invitado haya pulsado nada. Aquí no hace falta ninguna clave.
 *
 * El botón de «Abrir en el mapa» sigue llevando a Google, que es la aplicación
 * que la gente tiene instalada: eso es una elección del invitado, no una que
 * hagamos nosotros por él al cargar la página.
 *
 * LA CUENTA ES LA DE CUALQUIER MAPA WEB (Mercator): a un zoom dado, el mundo
 * mide 2^zoom teselas de lado, y la longitud y la latitud dicen en qué píxel
 * de ese mundo cae el sitio. Cada tesela sale con su posición respecto a ese
 * píxel, así que quien la pinta sólo tiene que poner el sitio donde quiera y
 * cada tesela a su distancia: el sitio cae exacto, sea cual sea la pantalla.
 */
export function teselasAlrededor(latitud: number, longitud: number): Tesela[] {
  const mundo = TAMANO_TESELA * 2 ** ZOOM_MAPA_FINAL;
  const radianes = (latitud * Math.PI) / 180;
  const sitioX = ((longitud + 180) / 360) * mundo;
  const sitioY =
    ((1 - Math.log(Math.tan(radianes) + 1 / Math.cos(radianes)) / Math.PI) / 2) * mundo;

  const columna = Math.floor(sitioX / TAMANO_TESELA);
  const fila = Math.floor(sitioY / TAMANO_TESELA);
  const teselasPorLado = 2 ** ZOOM_MAPA_FINAL;

  const teselas: Tesela[] = [];
  const { columnas, filas } = TESELAS_ALREDEDOR;
  for (let df = -filas; df <= filas; df += 1) {
    for (let dc = -columnas; dc <= columnas; dc += 1) {
      const c = columna + dc;
      const f = fila + df;
      // Ni por encima del polo ni por debajo: ahí no hay mapa.
      if (f < 0 || f >= teselasPorLado) continue;
      // En longitud el mundo da la vuelta: la columna se envuelve.
      const cEnvuelta = ((c % teselasPorLado) + teselasPorLado) % teselasPorLado;
      teselas.push({
        url: `${URL_TESELAS_MAPA}/${ZOOM_MAPA_FINAL}/${cEnvuelta}/${f}.png`,
        x: Math.round(c * TAMANO_TESELA - sitioX),
        y: Math.round(f * TAMANO_TESELA - sitioY),
      });
    }
  }
  return teselas;
}
