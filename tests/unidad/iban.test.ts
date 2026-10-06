import { describe, expect, it } from "vitest";

import { esIbanValido, formatearIban } from "@/lib/iban";

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

/** Los dígitos de control: lo que la forma sola no veía. */
describe("si el IBAN es de verdad", () => {
  it("acepta los que cuadran, de aquí y de fuera", () => {
    expect(esIbanValido("ES9121000418450200051332")).toBe(true);
    expect(esIbanValido("GB82WEST12345698765432")).toBe(true);
    expect(esIbanValido("DE89370400440532013000")).toBe(true);
  });

  it("rechaza una cifra cambiada, aunque tenga la forma", () => {
    expect(esIbanValido("ES9121000418450200051333")).toBe(false);
    // El que usaba el test E2E feliz: con forma de IBAN y sin serlo.
    expect(esIbanValido("ES7621000418450200051332")).toBe(false);
  });

  it("rechaza dos cifras seguidas trastocadas", () => {
    expect(esIbanValido("ES9121000418450200053132")).toBe(false);
  });

  it("un IBAN español con una cifra de menos no pasa por la longitud", () => {
    expect(esIbanValido("ES912100041845020005133")).toBe(false);
  });

  it("lo que no tiene forma de IBAN, tampoco", () => {
    expect(esIbanValido("no es un iban")).toBe(false);
    expect(esIbanValido("")).toBe(false);
  });
});
