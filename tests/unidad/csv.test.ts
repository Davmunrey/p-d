import { describe, expect, it } from "vitest";

import { celda } from "../../src/lib/csv";

/**
 * La celda de CSV que comparten las exportaciones del panel.
 *
 * El caso que la trajo aquí: las alergias las escribe un invitado desde una
 * URL pública y las abre el catering con Excel. Con las comillas solas, una
 * alergia que empezara por `=` se evaluaba como fórmula al abrir el fichero.
 */
describe("celda de CSV", () => {
  it("entrecomilla siempre y dobla las comillas de dentro", () => {
    expect(celda('Celíaca, "de verdad"')).toBe('"Celíaca, ""de verdad"""');
    expect(celda("")).toBe('""');
    expect(celda(null)).toBe('""');
    expect(celda(undefined)).toBe('""');
    expect(celda(8)).toBe('"8"');
  });

  it("neutraliza lo que Excel leería como fórmula", () => {
    expect(celda('=HYPERLINK("https://phish.example";"Ver alergias")')).toBe(
      '"\'=HYPERLINK(""https://phish.example"";""Ver alergias"")"',
    );
    expect(celda("=1+1")).toBe('"\'=1+1"');
    expect(celda("+34 600 000 000")).toBe('"\'+34 600 000 000"');
    expect(celda("-ninguna")).toBe('"\'-ninguna"');
    expect(celda("@todos")).toBe('"\'@todos"');
    expect(celda("\tcon tabulador")).toBe('"\'\tcon tabulador"');
    expect(celda("\rcon retorno")).toBe('"\'\rcon retorno"');
  });

  it("no toca el texto normal, ni el que lleva esos signos por dentro", () => {
    expect(celda("Alérgica a frutos secos = grave")).toBe('"Alérgica a frutos secos = grave"');
    expect(celda("2027-06-26")).toBe('"2027-06-26"');
    expect(celda("Mesa 1")).toBe('"Mesa 1"');
  });
});
