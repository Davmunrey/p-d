import { describe, expect, it } from "vitest";

import { leerImporte } from "@/lib/importe";

/**
 * CÓMO SE LEE UN IMPORTE TECLEADO
 *
 * Está aquí y no en un test de navegador porque es la regla del dinero del
 * proyecto entero —la usan la ficha del proveedor, las categorías y los gastos—
 * y comprobarla a base de rellenar formularios cuesta un minuto por caso. Un
 * test unitario los recorre todos en milisegundos, incluidos los que a nadie se
 * le ocurriría probar a mano y son justo los que se cuelan.
 *
 * LO QUE SE PROTEGE ES QUE NO SE REDONDEE. Antes «8600,555» se guardaba como
 * 8.600,56 sin decir nada: un dedo que resbala entraba en el presupuesto
 * convertido en una cifra plausible.
 */
describe("leerImporte", () => {
  it("distingue vacío de cero", () => {
    // Vacío es «no hay importe», que no es lo mismo que un acuerdo por 0 €.
    expect(leerImporte("")).toBeNull();
    expect(leerImporte("   ")).toBeNull();
    expect(leerImporte("0")).toBe(0);
  });

  it("lee el importe como se escribe en castellano", () => {
    expect(leerImporte("12000")).toBe(12000);
    expect(leerImporte("12000,50")).toBe(12000.5);
    expect(leerImporte("12.000,50")).toBe(12000.5);
    // Pegado desde un presupuesto en PDF, con símbolo y espacios.
    expect(leerImporte(" 12.000,50 € ")).toBe(12000.5);
    // Sin parte entera: cincuenta céntimos.
    expect(leerImporte(",50")).toBe(0.5);
  });

  it("con el punto manda el castellano: 1.250 son mil doscientos cincuenta", () => {
    expect(leerImporte("1.250")).toBe(1250);
    // Y sólo cae el punto que separa millares: éste es un decimal.
    expect(leerImporte("12.50")).toBe(12.5);
    expect(leerImporte("1.234.567,89")).toBe(1234567.89);
  });

  it("rechaza el tercer decimal en vez de redondearlo", () => {
    expect(leerImporte("8600,555")).toBeUndefined();
    expect(leerImporte("8600,5555")).toBeUndefined();
    // Con punto hacen falta cuatro cifras para que sea un decimal de más: con
    // tres, la regla del castellano manda y son millares (el caso de abajo).
    expect(leerImporte("8600.5555")).toBeUndefined();
  });

  /**
   * EL PUNTO CON TRES CIFRAS DETRÁS ES UN MILLAR, aunque quien lo teclee
   * estuviera pensando en decimales.
   *
   * Es la única lectura coherente con la regla de arriba —«1.250» son mil
   * doscientos cincuenta— y con el idioma del proyecto. Se deja escrito porque
   * sorprende: quien venga de una hoja de cálculo en inglés esperará 8.600 con
   * medio céntimo, y lo que sale son ocho millones y pico.
   */
  it("resuelve el punto ambiguo como millar, no como decimal", () => {
    expect(leerImporte("8600.555")).toBe(8600555);
    expect(leerImporte("12.500")).toBe(12500);
  });

  it("rechaza lo que no es un importe", () => {
    expect(leerImporte("ocho mil")).toBeUndefined();
    expect(leerImporte("8600 euros")).toBeUndefined();
    expect(leerImporte("8e3")).toBeUndefined();
    expect(leerImporte("--50")).toBeUndefined();
    expect(leerImporte("50-")).toBeUndefined();
  });

  it("rechaza los negativos: un gasto no devuelve dinero", () => {
    expect(leerImporte("-300")).toBeUndefined();
    expect(leerImporte("-0,01")).toBeUndefined();
  });
});
