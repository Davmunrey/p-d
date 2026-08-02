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

export interface GrupoTokens {
  readonly id: string;
  readonly claveCopy:
    | "grupoSuperficies"
    | "grupoTinta"
    | "grupoMarca"
    | "grupoBordes"
    | "grupoEstado";
  readonly tokens: readonly string[];
}

export const GRUPOS_COLOR: readonly GrupoTokens[] = [
  {
    id: "superficies",
    claveCopy: "grupoSuperficies",
    tokens: [
      "fondo",
      "superficie",
      "superficie-elevada",
      "superficie-hundida",
      "superficie-tenue",
      "superficie-inversa",
    ],
  },
  {
    id: "tinta",
    claveCopy: "grupoTinta",
    tokens: ["tinta", "tinta-suave", "tinta-tenue", "tinta-inversa", "tinta-marca"],
  },
  {
    id: "marca",
    claveCopy: "grupoMarca",
    tokens: [
      "marca",
      "marca-hover",
      "marca-activo",
      "marca-tenue",
      "acento",
      "acento-hover",
      "acento-tenue",
    ],
  },
  {
    id: "bordes",
    claveCopy: "grupoBordes",
    tokens: ["borde", "borde-fuerte", "borde-tenue", "borde-marca"],
  },
  {
    id: "estado",
    claveCopy: "grupoEstado",
    tokens: ["exito", "aviso", "error", "info", "foco"],
  },
] as const;

export const TOKENS_TIPOGRAFIA: readonly string[] = [
  "texto-display",
  "texto-titulo-1",
  "texto-titulo-2",
  "texto-titulo-3",
  "texto-titulo-4",
  "texto-cuerpo-grande",
  "texto-cuerpo",
  "texto-pequeno",
  "texto-diminuto",
] as const;

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
  "radio-boton",
  "radio-campo",
  "radio-imagen",
  "radio-tarjeta",
  "radio-modal",
  "radio-etiqueta",
] as const;

export const TOKENS_SOMBRA: readonly string[] = [
  "sombra-sutil",
  "sombra-tarjeta",
  "sombra-elevada",
  "sombra-modal",
] as const;

export const ANIMACIONES: readonly string[] = [
  "animacion-aparecer",
  "animacion-aparecer-subiendo",
  "animacion-aparecer-escalando",
] as const;
