import { describe, expect, it } from "vitest";

import { estrellasAPintar } from "../../src/components/marketing/estrellas-del-retrato";
import { RETRATO_EN_LA_SOLAPA, RETRATO_EN_LA_TARJETA } from "../../src/config/cielo";
import type { EstrellaDelRetrato } from "../../src/lib/retrato/estrellas";

/**
 * EL RETRATO PEQUEÑO SE PINTA CON MENOS ESTRELLAS. En la solapa y en la
 * tarjeta mide setenta u ochenta píxeles, y el contorno de producción lleva
 * casi quinientas estrellas: todas juntas se funden en una raya. Se pinta una
 * de cada pocas, pero las principales —cabezas, manos, pies— nunca se caen.
 */

const PRINCIPAL = 0.99;

/** Un contorno fabricado: `n` estrellas, una principal de cada `cada`. */
function contorno(n: number, cada: number): EstrellaDelRetrato[] {
  return Array.from({ length: n }, (_, i) => [i / n, i / n, i % cada === 0 ? 1 : 0.5]);
}

describe("estrellasAPintar", () => {
  it("con el contorno de producción se queda en el máximo y conserva todas las principales", () => {
    const estrellas = contorno(493, 9);
    const principales = estrellas.filter(([, , b]) => b >= PRINCIPAL).length;
    const maximo = RETRATO_EN_LA_TARJETA.maximo;

    const pintadas = estrellasAPintar(estrellas, PRINCIPAL, maximo);

    expect(pintadas.length).toBeLessThanOrEqual(maximo);
    expect(pintadas.length).toBeGreaterThan(maximo / 2);
    expect(pintadas.filter(({ estrella: [, , b] }) => b >= PRINCIPAL)).toHaveLength(
      principales,
    );
  });

  it("cada estrella conserva su sitio en el orden del contorno, que decide cuándo se enciende", () => {
    const estrellas = contorno(400, 7);
    const pintadas = estrellasAPintar(estrellas, PRINCIPAL, RETRATO_EN_LA_SOLAPA.maximo);

    for (const { estrella, i } of pintadas) expect(estrella).toBe(estrellas[i]);
    const indices = pintadas.map(({ i }) => i);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("un contorno corto o sin máximo se pinta entero", () => {
    const corto = contorno(120, 5);
    expect(estrellasAPintar(corto, PRINCIPAL, RETRATO_EN_LA_TARJETA.maximo)).toHaveLength(120);
    expect(estrellasAPintar(contorno(900, 5), PRINCIPAL)).toHaveLength(900);
  });

  it("en la tarjeta, sobre papel claro, no hay halo; en la solapa marino, sí", () => {
    expect(RETRATO_EN_LA_TARJETA.brilloHalo).toBe(0);
    expect(RETRATO_EN_LA_SOLAPA.brilloHalo).toBeGreaterThan(0);
    expect(RETRATO_EN_LA_SOLAPA.halo).toBeGreaterThan(1);
  });
});
