import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { TestInfo } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { origenDe } from "../e2e/utiles/origen-propio";

/**
 * Cada test E2E llega desde su propia dirección (ver `origen-propio.ts`):
 * sin eso, el cortafuegos del RSVP suma los enlaces inválidos de toda la
 * suite en un solo cupo y el décimo cierra la puerta a los que vienen detrás.
 * Este unitario vigila que ningún spec vuelva al `test` de `@playwright/test`
 * a secas, que es como se cae otra vez en el cupo compartido.
 */
const CARPETA = join(__dirname, "..", "e2e");
const specs = readdirSync(CARPETA).filter((fichero) => fichero.endsWith(".spec.ts"));

const importaTestDePlaywright = (fuente: string): boolean =>
  /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/.test(fuente);

describe("cada spec E2E lleva su propio origen", () => {
  it("hay specs que vigilar", () => {
    expect(specs.length).toBeGreaterThan(20);
  });

  it("ningún spec importa `test` directamente de @playwright/test", () => {
    const culpables = specs.filter((fichero) =>
      importaTestDePlaywright(readFileSync(join(CARPETA, fichero), "utf8")),
    );
    expect(culpables, "importa `test` y `expect` de ./utiles/origen-propio").toEqual([]);
  });

  it("y la comprobación muerde: reconoce el import que no se quiere", () => {
    expect(importaTestDePlaywright('import { expect, test } from "@playwright/test";')).toBe(
      true,
    );
    expect(importaTestDePlaywright('import { test, type Page } from "@playwright/test";')).toBe(
      true,
    );
    expect(
      importaTestDePlaywright('import { expect, test } from "./utiles/origen-propio";'),
    ).toBe(false);
    // Importar sólo tipos de Playwright sigue estando bien.
    expect(importaTestDePlaywright('import { type Page } from "@playwright/test";')).toBe(
      false,
    );
  });
});

describe("origenDe", () => {
  const info = (titulo: string, proyecto = "escritorio", retry = 0) => ({
    titlePath: ["x.spec.ts", "un bloque", titulo],
    project: { name: proyecto } as TestInfo["project"],
    retry,
  });

  it("es una dirección privada de 10/8 y siempre la misma para el mismo test", () => {
    expect(origenDe(info("a"))).toMatch(/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    expect(origenDe(info("a"))).toBe(origenDe(info("a")));
  });

  it("distingue tests, proyectos y reintentos", () => {
    const distintas = new Set([
      origenDe(info("a")),
      origenDe(info("b")),
      origenDe(info("a", "movil")),
      origenDe(info("a", "escritorio", 1)),
    ]);
    expect(distintas.size).toBe(4);
  });
});
