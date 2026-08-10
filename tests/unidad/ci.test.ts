import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El CI tiene que ejecutar los tests que existen, no los que existían
 *
 * Este fichero nace de un fallo real y silencioso. El trabajo que levanta el
 * Supabase de verdad —el único donde pueden correr los tests con sesión—
 * enumeraba los specs a mano:
 *
 *     npx playwright test --project=escritorio tests/e2e/acceso-real.spec.ts tests/e2e/panel.spec.ts
 *
 * En cuanto apareció un tercer spec con sesión, quedó fuera de esa lista. Y
 * como fuera de ese trabajo no hay Supabase, ese spec se saltaba solo. Nadie
 * lo ejecutaba nunca, y el módulo entero pasaba por entregado y probado.
 *
 * Lo peor no es que falle: es que sale verde.
 */

const RAIZ = join(__dirname, "..", "..");

describe("flujo de CI", () => {
  const ci = readFileSync(join(RAIZ, ".github/workflows/ci.yml"), "utf8");

  it("no enumera ficheros de test a mano", () => {
    // Una lista de rutas dentro de una invocación de Playwright es una lista
    // que se queda atrás. Se ejecuta la suite y que Playwright decida.
    const invocaciones = [...ci.matchAll(/npx playwright test[^\n]*/g)].map((m) => m[0]);

    expect(
      invocaciones.length,
      "Se esperaba al menos una llamada a Playwright",
    ).toBeGreaterThan(0);

    for (const invocacion of invocaciones) {
      expect(
        invocacion,
        `Este comando nombra specs a mano y se quedará atrás:\n  ${invocacion}\n` +
          "Ejecuta la suite entera, o selecciona por proyecto o por etiqueta.",
      ).not.toMatch(/tests\/e2e\/\S+\.spec\.ts/);
    }
  });

  it("el trabajo con Supabase real sigue existiendo", () => {
    // Si alguien lo quitara, los tests con sesión se saltarían en todas
    // partes y el panel dejaría de estar probado sin que nada se pusiera rojo.
    expect(ci).toContain("supabase start");
    expect(ci).toContain("preparar-acceso-pruebas.sh");
  });
});
