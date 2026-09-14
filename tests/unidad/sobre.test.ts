import { describe, expect, it } from "vitest";

import { FASES_APERTURA_SOBRE_MS } from "@/config/constants";

/**
 * BODA-121 · Los tiempos del sobre
 *
 * Tres temporizadores encadenados abren el Save the Date: la foto asoma, la
 * tarjeta asoma, el sobre se va. Van en constantes y no en el componente, y
 * aquí se comprueba lo único que no puede cambiar por mucho que se ajusten:
 * que van en ese orden y que todo está a la vista en menos de dos segundos.
 * Más es hacer esperar a quien ya ha tocado el sello.
 */
describe("los tiempos del sobre", () => {
  it("van en orden: la foto, la tarjeta y por último el pie", () => {
    const { foto, tarjeta, fuera } = FASES_APERTURA_SOBRE_MS;
    expect(foto).toBeGreaterThan(0);
    expect(tarjeta).toBeGreaterThan(foto);
    expect(fuera).toBeGreaterThan(tarjeta);
  });

  it("todo está a la vista antes de dos segundos", () => {
    expect(FASES_APERTURA_SOBRE_MS.fuera).toBeLessThan(2000);
  });
});
