import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AJUSTE_MAXIMO_RECUENTO,
  CAPACIDAD_MAXIMA_MESA,
  CAPACIDAD_MINIMA_MESA,
  MAXIMO_ACOMPANANTES,
  VALORACION_MAXIMA,
  VALORACION_MINIMA,
} from "@/config/constants";

/**
 * LOS RANGOS NUMÉRICOS LOS DICE LA BASE, Y AQUÍ SE COMPRUEBA QUE SE CITAN
 *
 * Igual que con los largos de texto: cada rango vive en un `check (x between a
 * and b)` de su migración, y la acción lo repite para poder decirlo en
 * castellano. Si los dos números se separan, o la pantalla rechaza lo que la
 * base admitiría o deja pasar lo que la base devuelve como avería.
 */

const MIGRACIONES = join(__dirname, "..", "..", "supabase", "migrations");

function rangoDeLaBase(columna: string): [number, number] {
  const patron = new RegExp(`\\b${columna}\\s+between\\s+(-?\\d+)\\s+and\\s+(-?\\d+)`, "gi");
  let ultimo: [number, number] | null = null;
  for (const nombre of readdirSync(MIGRACIONES).sort()) {
    if (!nombre.endsWith(".sql")) continue;
    for (const encontrado of readFileSync(join(MIGRACIONES, nombre), "utf8").matchAll(patron)) {
      ultimo = [Number(encontrado[1]), Number(encontrado[2])];
    }
  }
  expect(ultimo, `ninguna migración declara un rango para ${columna}`).not.toBeNull();
  return ultimo!;
}

describe("los rangos de las acciones citan los de la base", () => {
  it("acompañantes de una invitación", () => {
    expect(rangoDeLaBase("maximo_acompanantes")).toEqual([0, MAXIMO_ACOMPANANTES]);
  });

  it("valoración de un proveedor", () => {
    expect(rangoDeLaBase("valoracion")).toEqual([VALORACION_MINIMA, VALORACION_MAXIMA]);
  });

  it("capacidad de una mesa", () => {
    expect(rangoDeLaBase("capacidad")).toEqual([CAPACIDAD_MINIMA_MESA, CAPACIDAD_MAXIMA_MESA]);
  });

  it("corrección a mano del recuento", () => {
    expect(rangoDeLaBase("ajuste")).toEqual([-AJUSTE_MAXIMO_RECUENTO, AJUSTE_MAXIMO_RECUENTO]);
  });
});
