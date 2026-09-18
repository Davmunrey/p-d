import { describe, expect, it } from "vitest";

import {
  permutarConElVecino,
  type ConOrden,
} from "../../src/app/panel/contenido/[lista]/reordenar";

/**
 * BODA-129 · Mover una ficha de sitio
 *
 * Es la operación con más casos límite de la pantalla, y la única cuyo fallo no
 * se ve: si el botón del primero mueve la ficha equivocada, la lista queda
 * ordenada de otra manera y hay que acordarse de cómo estaba para darse cuenta.
 *
 * Por eso la permuta es una función pura y se prueba aquí, en milisegundos, en
 * vez de levantando un Supabase entero para descubrirlo.
 */

/** Tres fichas seguidas, como las deja el seed. */
const TRES: ConOrden[] = [
  { id: "a", orden: 0 },
  { id: "b", orden: 1 },
  { id: "c", orden: 2 },
];

describe("permutar una ficha con la de al lado", () => {
  it("bajar la primera la intercambia con la segunda", () => {
    expect(permutarConElVecino(TRES, "a", "bajar")).toEqual([
      { id: "b", orden: 0 },
      { id: "a", orden: 1 },
    ]);
  });

  it("subir la última la intercambia con la penúltima", () => {
    expect(permutarConElVecino(TRES, "c", "subir")).toEqual([
      { id: "c", orden: 1 },
      { id: "b", orden: 2 },
    ]);
  });

  it("subir la primera no hace nada", () => {
    // No es un error: es que no hay a dónde, y la pantalla ya no pinta el botón.
    expect(permutarConElVecino(TRES, "a", "subir")).toEqual([]);
  });

  it("bajar la última tampoco", () => {
    expect(permutarConElVecino(TRES, "c", "bajar")).toEqual([]);
  });

  it("una ficha que ya no está no mueve nada", () => {
    // Pasa de verdad: dos pestañas abiertas y en una se borró hace un minuto.
    expect(permutarConElVecino(TRES, "borrada", "subir")).toEqual([]);
  });

  it("con una sola ficha no hay vecino por ningún lado", () => {
    const una: ConOrden[] = [{ id: "sola", orden: 0 }];
    expect(permutarConElVecino(una, "sola", "subir")).toEqual([]);
    expect(permutarConElVecino(una, "sola", "bajar")).toEqual([]);
  });

  it("sólo devuelve las filas que de verdad cambian", () => {
    /*
      Escribir las cinco para mover una serían cinco escrituras, cinco entradas
      en la auditoría y cinco `actualizado_en` mintiendo sobre cuándo se tocó
      cada cosa.
    */
    const cinco: ConOrden[] = [
      { id: "a", orden: 0 },
      { id: "b", orden: 1 },
      { id: "c", orden: 2 },
      { id: "d", orden: 3 },
      { id: "e", orden: 4 },
    ];

    expect(permutarConElVecino(cinco, "c", "bajar")).toEqual([
      { id: "d", orden: 2 },
      { id: "c", orden: 3 },
    ]);
  });

  it("con los órdenes descolocados, renumera y deja la lista bien", () => {
    /*
      NO SE INTERCAMBIAN LOS DOS NÚMEROS, SE RENUMERA, y este test es el porqué.
      `orden` en estas tablas no es único —a diferencia de `secciones_landing`—,
      así que dos fichas pueden compartir número: aquí las tres valen 7. Con un
      intercambio, mover no movería nada y el botón parecería roto.
    */
    const repetidos: ConOrden[] = [
      { id: "a", orden: 7 },
      { id: "b", orden: 7 },
      { id: "c", orden: 7 },
    ];

    expect(permutarConElVecino(repetidos, "a", "bajar")).toEqual([
      { id: "b", orden: 0 },
      { id: "a", orden: 1 },
      { id: "c", orden: 2 },
    ]);
  });

  it("y con huecos, también", () => {
    // Borrar una de en medio deja 0, 1, 3. Renumerar los cierra de paso.
    const conHueco: ConOrden[] = [
      { id: "a", orden: 0 },
      { id: "b", orden: 1 },
      { id: "c", orden: 3 },
    ];

    expect(permutarConElVecino(conHueco, "b", "bajar")).toEqual([
      { id: "c", orden: 1 },
      { id: "b", orden: 2 },
    ]);
  });
});
