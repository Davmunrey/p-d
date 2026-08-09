/**
 * FICHERO GENERADO — no se edita a mano.
 *
 * Lo produce `scripts/generar-tokens.mjs` leyendo `src/styles/tokens/`, y se
 * regenera solo en cada build. Existe para los sitios donde la marca se pinta
 * sin hoja de estilos: las imágenes de Open Graph y, más adelante, los correos.
 *
 * Para cambiar un color, se cambia el token en el CSS y se regenera con
 * `npm run tokens`. Tocar este fichero no sirve de nada: el siguiente build lo
 * sobrescribe.
 */

export const PALETAS = {
  "claro": {
    "fondo": "#fbfaf8",
    "superficie": "#fff",
    "tinta": "#14140f",
    "tinta-suave": "#4a4a45",
    "marca": "#6b7060",
    "borde": "#e6e4df"
  },
  "inversa": {
    "fondo": "#3c4233",
    "superficie": "#2e3327",
    "tinta": "#f1efe7",
    "tinta-suave": "#c9cdbc",
    "marca": "#a9af98",
    "borde": "#454a3c"
  }
} as const;

export type Paleta = keyof typeof PALETAS;
