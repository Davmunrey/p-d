import { describe, expect, it } from "vitest";

import { PORCENTAJE_IVA } from "@/config/constants";
import { basesDelPresupuesto, ordenarPorPrecioComparable } from "@/lib/iva";

/**
 * BODA-73 · PONER TRES PRESUPUESTOS EN LA MISMA BASE
 *
 * Lo que se prueba aquí no es la multiplicación —eso lo hace bien cualquiera—
 * sino el criterio: que cuando el presupuesto no dice si lleva IVA, NO SE
 * INVENTA la otra cifra. Ese es el caso que convierte al proveedor barato en el
 * caro, y el único donde un test puede evitar una decisión equivocada.
 */

const FACTOR = 1 + PORCENTAJE_IVA / 100;

describe("basesDelPresupuesto()", () => {
  it("con el IVA dentro, saca la cifra sin IVA", () => {
    const bases = basesDelPresupuesto(1210, true);

    expect(bases.conIva).toBe(1210);
    expect(bases.sinIva).toBeCloseTo(1210 / FACTOR, 6);
    expect(bases.indeterminado).toBe(false);
  });

  it("sin el IVA, saca la cifra con IVA", () => {
    const bases = basesDelPresupuesto(1000, false);

    expect(bases.sinIva).toBe(1000);
    expect(bases.conIva).toBeCloseTo(1000 * FACTOR, 6);
    expect(bases.indeterminado).toBe(false);
  });

  it("las dos conversiones son la misma cuenta al derecho y al revés", () => {
    const conIva = basesDelPresupuesto(8600, false).conIva;
    expect(basesDelPresupuesto(conIva, true).sinIva).toBeCloseTo(8600, 6);
  });

  it("SI EL PRESUPUESTO NO LO DICE, no se inventa ninguna de las dos", () => {
    const bases = basesDelPresupuesto(8600, null);

    expect(bases.sinIva).toBeNull();
    expect(bases.conIva).toBeNull();
    // Y se marca, para que la pantalla lo diga en vez de dejar dos huecos que
    // parecen un fallo de carga.
    expect(bases.indeterminado).toBe(true);
  });

  it("sin importe no hay nada que avisar", () => {
    // «No ha dado precio» no es lo mismo que «no dice si lleva IVA»: avisar del
    // IVA de una cifra que no existe sería ruido.
    expect(basesDelPresupuesto(null, null)).toEqual({
      sinIva: null,
      conIva: null,
      indeterminado: false,
    });
  });

  it("el cero es un importe, no una ausencia", () => {
    expect(basesDelPresupuesto(0, false)).toEqual({
      sinIva: 0,
      conIva: 0,
      indeterminado: false,
    });
  });
});

describe("ordenarPorPrecioComparable", () => {
  const de = (nombre: string, importe: number | null, iva: boolean | null) => ({
    nombre,
    importePresupuestado: importe,
    ivaIncluido: iva,
  });

  it("EL CASO: el barato de verdad va primero aunque su cifra cruda sea mayor", () => {
    // A: 2.000 sin IVA (2.420 con él). B: 2.300 con IVA (1.900,83 sin él).
    const orden = ordenarPorPrecioComparable([de("A", 2000, false), de("B", 2300, true)]);
    expect(orden.map((p) => p.nombre)).toEqual(["B", "A"]);
  });

  it("los que no dicen si llevan IVA van detrás, y al final los que no dan precio", () => {
    const orden = ordenarPorPrecioComparable([
      de("sin precio", null, null),
      de("no lo dice", 100, null),
      de("caro", 5000, true),
      de("barato", 1000, false),
    ]);
    expect(orden.map((p) => p.nombre)).toEqual(["barato", "caro", "no lo dice", "sin precio"]);
  });

  it("entre iguales respeta el orden en que llegan, y no cambia la lista original", () => {
    const lista = [de("Beta", 1210, true), de("Alfa", 1000, false)];
    const orden = ordenarPorPrecioComparable(lista);
    expect(orden.map((p) => p.nombre)).toEqual(["Beta", "Alfa"]);
    expect(lista.map((p) => p.nombre)).toEqual(["Beta", "Alfa"]);
  });
});
