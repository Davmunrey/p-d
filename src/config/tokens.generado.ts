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
    "fondo": "#f8f9fc",
    "superficie": "#fff",
    "tinta": "#121722",
    "tinta-suave": "#434e63",
    "marca": "#3f4f70",
    "acento": "#8a6224",
    "borde": "#dfe4ec"
  },
  "inversa": {
    "fondo": "#1f2b44",
    "superficie": "#16213a",
    "tinta": "#eef2f8",
    "tinta-suave": "#c3cee1",
    "marca": "#9db0ce",
    "acento": "#e3be86",
    "borde": "#2c3a56"
  }
} as const;

export type Paleta = keyof typeof PALETAS;
