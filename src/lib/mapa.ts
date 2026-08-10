import { MAPA_MARGEN_GRADOS } from "@/config/constants";

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
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(punto)}`;
}

/**
 * El mapa que se ve dentro de la página, sin salir de ella.
 *
 * ES OPENSTREETMAP Y NO GOOGLE, por dos razones que van en el mismo sentido:
 * el mapa incrustado de Google exige una clave de API —una cuenta, una
 * facturación y una variable de entorno más que configurar para que la landing
 * no salga rota—, y además le cuenta a Google quién ha abierto la invitación
 * antes de que el invitado haya pulsado nada. Aquí no hace falta ninguna clave.
 *
 * El botón de arriba sigue llevando a Google, que es la aplicación que la gente
 * tiene instalada: eso es una elección del invitado, no una que hagamos nosotros
 * por él al cargar la página.
 *
 * El recuadro se calcula alrededor del punto con un margen fijo, que es lo que
 * decide cuánto se ve alrededor de la finca. Vive en `constants.ts` porque es un
 * número que se ajusta mirando el resultado, no una constante de la naturaleza.
 */
export function enlaceMapaEmbebido(latitud: number, longitud: number): string {
  const margen = MAPA_MARGEN_GRADOS;
  const recuadro = [
    longitud - margen,
    latitud - margen,
    longitud + margen,
    latitud + margen,
  ].join(",");

  const parametros = new URLSearchParams({
    bbox: recuadro,
    layer: "mapnik",
    marker: `${latitud},${longitud}`,
  });

  return `https://www.openstreetmap.org/export/embed.html?${parametros.toString()}`;
}
