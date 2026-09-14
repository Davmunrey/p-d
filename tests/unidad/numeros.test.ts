import { describe, expect, it } from "vitest";

import { numeroEnLetra } from "@/lib/numeros";

/** BODA-116 · «tres hoteles de León», no «3 hoteles». */
describe("un número en letra", () => {
  it.each([
    [1, "un"],
    [2, "dos"],
    [3, "tres"],
    [10, "diez"],
  ])("%s se escribe «%s»", (cantidad, letra) => {
    expect(numeroEnLetra(cantidad)).toBe(letra);
  });

  it("a partir de once vuelve la cifra", () => {
    expect(numeroEnLetra(11)).toBe("11");
    expect(numeroEnLetra(120)).toBe("120");
  });

  it("un número que no es una cantidad se deja tal cual", () => {
    expect(numeroEnLetra(2.5)).toBe("2.5");
    expect(numeroEnLetra(-1)).toBe("-1");
  });
});
