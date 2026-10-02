import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * LAS FUNCIONES, EN LA REGIÓN DE LA BASE.
 *
 * Sin `regions`, Vercel ejecuta las funciones en Washington y la base está en
 * Frankfurt: cada ida y vuelta cruzaba el Atlántico y la portada tardaba de 2 a
 * 3 segundos en responder. Este test ata la configuración para que nadie la
 * quite sin darse cuenta; si la base se muda, se cambia aquí y en
 * docs/ENTORNO.md a la vez.
 */
const REGION_DE_LA_BASE = "fra1";

describe("vercel.json", () => {
  const config = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "vercel.json"), "utf8"),
  ) as { regions?: string[] };

  it("fija una sola región, la de la base", () => {
    expect(config.regions).toEqual([REGION_DE_LA_BASE]);
  });

  it("y la documentación cuenta por qué", () => {
    const entorno = readFileSync(join(__dirname, "..", "..", "docs", "ENTORNO.md"), "utf8");
    expect(entorno).toContain(`"regions": ["${REGION_DE_LA_BASE}"]`);
  });
});
