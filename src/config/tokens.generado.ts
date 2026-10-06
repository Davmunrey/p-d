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

export const ESCALA_OG = {
  "margenVertical": 72,
  "margenLateral": 140,
  "textoEtiqueta": 24,
  "espaciadoEtiqueta": 8,
  "textoNombres": 88,
  "textoConector": 80,
  "solapeConector": 4,
  "textoPie": 30,
  "hueco": 28,
  "huecoPie": 36,
  "filete": 2
} as const;

/**
 * Los colores de la capa semántica, agrupados por los rótulos de sección de
 * `semantic.css`. Los enseña `/cocina`, uno por ficha.
 */
export const GRUPOS_COLOR = [
  {
    "id": "superficies",
    "tokens": [
      "fondo",
      "superficie",
      "superficie-elevada",
      "superficie-hundida",
      "superficie-tenue",
      "superficie-inversa",
      "superficie-cabecera"
    ]
  },
  {
    "id": "texto",
    "tokens": [
      "tinta",
      "tinta-suave",
      "tinta-tenue",
      "tinta-inversa",
      "tinta-sobre-foto",
      "tinta-sobre-foto-tenue",
      "tinta-marca",
      "tinta-sobre-marca",
      "tinta-sobre-accion",
      "tinta-sobre-acento"
    ]
  },
  {
    "id": "marca",
    "tokens": [
      "marca",
      "marca-hover",
      "marca-activo",
      "marca-tenue"
    ]
  },
  {
    "id": "accion",
    "tokens": [
      "accion",
      "accion-hover",
      "accion-activa"
    ]
  },
  {
    "id": "acento",
    "tokens": [
      "acento",
      "acento-hover"
    ]
  },
  {
    "id": "constelaciones",
    "tokens": [
      "constelacion-estrella",
      "constelacion-trazo"
    ]
  },
  {
    "id": "bordes",
    "tokens": [
      "borde",
      "borde-fuerte",
      "borde-tenue",
      "borde-filete",
      "borde-marca"
    ]
  },
  {
    "id": "estado",
    "tokens": [
      "exito",
      "exito-fondo",
      "exito-tinta",
      "aviso",
      "aviso-fondo",
      "nota-fondo",
      "nota-tinta",
      "nota-tinta-fuerte",
      "etiqueta-marca-tinta",
      "aviso-tinta",
      "error",
      "error-fondo",
      "error-tinta",
      "serie-previsto",
      "serie-real",
      "serie-exceso",
      "foco",
      "anillo-campo",
      "accion-desactivada",
      "tinta-desactivada"
    ]
  },
  {
    "id": "superposiciones",
    "tokens": [
      "velo",
      "velo-suave",
      "velo-fuerte",
      "velo-foto"
    ]
  },
  {
    "id": "saveTheDate",
    "tokens": [
      "papel-sobre-arriba",
      "papel-sobre-abajo",
      "papel-dorso-arriba",
      "papel-dorso-abajo",
      "papel-solapa-arriba",
      "papel-solapa-abajo",
      "papel-tarjeta-arriba",
      "papel-tarjeta-abajo",
      "papel-foto",
      "hueco-foto-naipe",
      "borde-sobre",
      "borde-naipe",
      "trama-sobre",
      "brillo-papel",
      "brillo-papel-final",
      "tinta-remite",
      "tinta-pista",
      "tinta-sello",
      "sello-brillo",
      "sello-medio",
      "sello-fondo",
      "anillo-sello",
      "anillo-sello-final",
      "estrella-clara-1",
      "estrella-clara-2",
      "velo-cielo-centro",
      "velo-cielo-medio",
      "velo-cielo-borde"
    ]
  },
  {
    "id": "elPaisaje",
    "tokens": [
      "velo-escena-lejos-arriba",
      "velo-escena-lejos-abajo",
      "velo-escena-cerca-arriba",
      "velo-escena-cerca-abajo",
      "tinta-sobre-foto-fria",
      "acento-sobre-foto"
    ]
  }
] as const;
