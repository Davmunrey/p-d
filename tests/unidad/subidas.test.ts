import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PESO_MAXIMO_DOCUMENTO_MB,
  PESO_MAXIMO_IMAGEN_MB,
  PESO_MAXIMO_VIDEO_MB,
} from "../../src/config/constants";

/**
 * El tope del cuerpo de las acciones de servidor.
 *
 * Next lo pone en 1 MB si nadie dice otra cosa, y corta el cuerpo ANTES de
 * que corra la acción: ninguna foto de más de un mega llegaba a `subirMedio`,
 * mientras la ayuda del formulario prometía diez. Aquí se ata la
 * configuración al mayor de los topes que el módulo promete, para que cambiar
 * uno sin el otro se ponga rojo.
 */
describe("el tope de subida de las acciones de servidor", () => {
  const config = readFileSync(join(__dirname, "..", "..", "next.config.ts"), "utf8");

  it("se declara en next.config.ts a partir de la constante, no de un número", () => {
    expect(config).toContain("bodySizeLimit: `${PESO_MAXIMO_VIDEO_MB}mb`");
    expect(config).toMatch(
      /import \{ PESO_MAXIMO_VIDEO_MB \} from "\.\/src\/config\/constants"/,
    );
  });

  it("el mayor de los topes es el del vídeo, que es el que se declara", () => {
    expect(PESO_MAXIMO_VIDEO_MB).toBeGreaterThanOrEqual(PESO_MAXIMO_DOCUMENTO_MB);
    expect(PESO_MAXIMO_VIDEO_MB).toBeGreaterThanOrEqual(PESO_MAXIMO_IMAGEN_MB);
  });
});
