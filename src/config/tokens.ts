/**
 * CATÁLOGO DE TOKENS
 *
 * Lista los tokens semánticos existentes para poder mostrarlos en `/cocina`.
 * Contiene NOMBRES, nunca valores: los valores viven en los ficheros CSS y se
 * resuelven en runtime con `var(--nombre)`.
 *
 * Añadir un token al sistema implica añadirlo aquí, y así la página de diseño
 * nunca queda desactualizada.
 */

/*
 * Los colores no están aquí: salen del propio `semantic.css`, agrupados por
 * sus rótulos de sección, en `GRUPOS_COLOR` de `tokens.generado.ts`. Una lista
 * escrita a mano se quedó corta una vez y nadie lo vio.
 */

/**
 * La escala tipográfica, en el orden del catálogo. Cada nombre tiene en
 * `/cocina` su muestra pintada con el componente que lo usa de verdad, y el
 * tipo obliga: un token nuevo sin muestra no compila.
 */
export const TOKENS_TIPOGRAFIA = [
  "texto-display",
  "texto-titulo-1",
  "texto-titulo-2",
  "texto-titulo-3",
  "texto-cita",
  "texto-conector",
  "texto-cifra",
  "texto-cuerpo-grande",
  "texto-cuerpo",
  "texto-etiqueta",
  "texto-pequeno",
  "texto-diminuto",
  "texto-boton",
  "texto-hito",
  "texto-hora",
  "texto-dato",
] as const;

export type TokenTipografia = (typeof TOKENS_TIPOGRAFIA)[number];

export const TOKENS_ESPACIADO: readonly string[] = [
  "espacio-linea",
  "espacio-interno-compacto",
  "espacio-interno",
  "espacio-pila",
  "espacio-elemento",
  "espacio-bloque",
  "espacio-seccion-compacta",
  "espacio-seccion",
] as const;

export const TOKENS_RADIO: readonly string[] = [
  "radio-imagen",
  "radio-campo",
  "radio-tarjeta",
  "radio-modal",
  "radio-boton",
] as const;

export const TOKENS_SOMBRA: readonly string[] = [
  "sombra-sutil",
  "sombra-tarjeta",
  "sombra-elevada",
  "sombra-modal",
] as const;

/**
 * LAS TABLAS DE MOVIMIENTO DEL CATÁLOGO, con los tokens que de verdad mueven la
 * web. Las duraciones y las curvas salen de las transiciones semánticas —que
 * son duración y curva juntas—, de la más corta a la más larga.
 */
export const TOKENS_DURACION = [
  "transicion-color",
  "transicion-transformacion",
  "transicion-muelle",
  "transicion-aparicion",
  "transicion-fundido-portada",
  "transicion-cinematica",
  "transicion-escena",
] as const;

/** Las dos curvas del sistema: la de todo lo que entra y la del muelle. */
export const TOKENS_CURVA = ["transicion-aparicion", "transicion-muelle"] as const;

/** Cuánto recorre lo que entra: la distancia, y las dos escalas de partida. */
export const TOKENS_RECORRIDO = [
  { token: "recorrido-reveal", como: "longitud" },
  { token: "escala-reveal", como: "numero" },
  { token: "escala-pop", como: "numero" },
] as const;
