import { describe, expect, it } from "vitest";

import { formatearIban } from "@/lib/iban";

/** BODA-115 · El IBAN se lee de cuatro en cuatro y se copia sin espacios. */
describe("el IBAN para leerlo", () => {
  it("se agrupa de cuatro en cuatro", () => {
    expect(formatearIban("ES9121000418450200051332")).toBe("ES91 2100 0418 4502 0005 1332");
  });

  it("uno que ya viene con espacios o en minúsculas sale igual de limpio", () => {
    expect(formatearIban("es91 2100 0418 4502 0005 1332")).toBe(
      "ES91 2100 0418 4502 0005 1332",
    );
  });

  // Un IBAN de otro país no siempre es múltiplo de cuatro: el último grupo
  // se queda con lo que sobre, nunca se rellena ni se corta.
  it("el último grupo puede ser más corto", () => {
    expect(formatearIban("BE71096123456769")).toBe("BE71 0961 2345 6769");
    expect(formatearIban("NO8330001234567")).toBe("NO83 3000 1234 567");
  });
});
