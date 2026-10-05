import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { avisoDe } from "../../src/lib/avisos";

/**
 * EL `?estado=` DE LA URL LO ESCRIBE CUALQUIERA.
 *
 * Con `AVISOS[estado]`, un `?estado=constructor` no daba `undefined` sino la
 * función `Object` —verdadera—, y la pantalla reventaba al intentar traducirla:
 * invitados, mesas, pendientes y el día se caían con un enlace manipulado.
 */

const AVISOS = { guardado: "Guardado", fallo: "Ha fallado" } as const;

describe("avisoDe", () => {
  it("devuelve el aviso de un estado que el mapa declara", () => {
    expect(avisoDe(AVISOS, "guardado")).toBe("Guardado");
    expect(avisoDe(AVISOS, "fallo")).toBe("Ha fallado");
  });

  it("no devuelve nada para lo que viene de la cadena de prototipos", () => {
    for (const trampa of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "valueOf",
    ]) {
      expect(avisoDe(AVISOS, trampa), trampa).toBeUndefined();
    }
  });

  it("ni para un estado vacío, ausente o inventado", () => {
    expect(avisoDe(AVISOS, "")).toBeUndefined();
    expect(avisoDe(AVISOS, null)).toBeUndefined();
    expect(avisoDe(AVISOS, undefined)).toBeUndefined();
    expect(avisoDe(AVISOS, "inventado")).toBeUndefined();
  });
});

describe("las pantallas del panel", () => {
  const RAIZ = join(__dirname, "..", "..");

  it("todo mapa de avisos con claves de texto libre se lee con avisoDe", () => {
    const ficheros = readdirSync(join(RAIZ, "src", "app"), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((fichero) => /\.tsx?$/.test(fichero))
      .map((fichero) => join("src", "app", fichero));
    const conMapaLibre = ficheros.filter((fichero) =>
      /const AVISOS: Record<string,/.test(readFileSync(join(RAIZ, fichero), "utf8")),
    );

    expect(conMapaLibre.length).toBeGreaterThan(0);
    for (const fichero of conMapaLibre) {
      const fuente = readFileSync(join(RAIZ, fichero), "utf8");
      expect(fuente, fichero).toMatch(/avisoDe\(AVISOS,/);
      expect(fuente, fichero).not.toMatch(/AVISOS\[[^\]]+\]/);
      expect(fuente, fichero).not.toMatch(/in AVISOS/);
    }
  });
});
