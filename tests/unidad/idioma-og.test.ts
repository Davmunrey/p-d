import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IDIOMA, IDIOMA_OG } from "../../src/config/constants";

/**
 * Dos formatos para el mismo idioma: BCP 47 con guion para `<html lang>` e
 * `Intl`, y `language_TERRITORY` con guion bajo para Open Graph. `og:locale`
 * salía como `es-ES` y Facebook lo descartaba.
 */
describe("el idioma en sus dos escrituras", () => {
  const layout = readFileSync(join(__dirname, "..", "..", "src", "app", "layout.tsx"), "utf8");

  it("Open Graph lleva el guion bajo y la etiqueta html el guion", () => {
    expect(IDIOMA).toBe("es-ES");
    expect(IDIOMA_OG).toBe("es_ES");
  });

  it("el layout usa cada uno donde toca", () => {
    expect(layout).toMatch(/locale:\s*IDIOMA_OG/);
    expect(layout).toMatch(/lang=\{IDIOMA\}/);
  });
});
