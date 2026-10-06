import { describe, expect, it } from "vitest";

import {
  colorLegible,
  duracionLegible,
  espaciadoLegible,
  familiaLegible,
  longitudLegible,
  numeroLegible,
  sombraLegible,
  transicionLegible,
} from "@/lib/valor-css";

/**
 * BODA-124 · Lo que el navegador resuelve, escrito como lo escribe la entrega
 *
 * `/cocina` enseña bajo cada token el valor que el navegador ha calculado. Si
 * la traducción se equivocara, la ficha diría un valor que no es el de la
 * pantalla, y el catálogo existe justo para que eso no pase.
 */

describe("colorLegible", () => {
  it("pasa un rgb() a hexadecimal en mayúsculas, como el catálogo", () => {
    expect(colorLegible("rgb(18, 23, 34)")).toBe("#121722");
  });

  it("deja la opacidad aparte y en porcentaje", () => {
    expect(colorLegible("rgba(20, 20, 15, 0.55)")).toMatch(/^#14140F · 55\s%$/);
    expect(colorLegible("rgb(255 255 255 / 0.6)")).toMatch(/^#FFFFFF · 60\s%$/);
  });

  it("lo que no reconoce lo devuelve tal cual, no se inventa un hex", () => {
    expect(colorLegible("oklch(0.5 0.1 200)")).toBe("oklch(0.5 0.1 200)");
    expect(colorLegible("")).toBe("");
  });
});

describe("las medidas", () => {
  it("escribe los píxeles con coma decimal", () => {
    expect(longitudLegible("22.4px")).toBe("22,4 px");
    expect(longitudLegible("9999px")).toBe("9999 px");
  });

  it("un valor que no está en píxeles se queda como está", () => {
    expect(longitudLegible("50%")).toBe("50%");
  });

  it("los números, con coma", () => {
    expect(numeroLegible("0.94")).toBe("0,94");
    expect(numeroLegible("")).toBe("");
  });
});

describe("el movimiento", () => {
  it("las duraciones cortas en milisegundos y las largas en segundos", () => {
    expect(duracionLegible("250ms")).toMatch(/^250\sms$/);
    expect(duracionLegible("0.25s")).toMatch(/^250\sms$/);
    expect(duracionLegible("1400ms")).toMatch(/^1,4\ss$/);
  });

  it("separa la duración de la curva en una transición", () => {
    const { duracion, curva } = transicionLegible("900ms cubic-bezier(0.2, 0.7, 0.3, 1)");
    expect(duracion).toMatch(/^900\sms$/);
    expect(curva).toBe("cubic-bezier(0.2, 0.7, 0.3, 1)");
  });

  it("una duración que no entiende no se convierte en cero", () => {
    expect(duracionLegible("var(--algo)")).toBe("var(--algo)");
  });
});

describe("las sombras", () => {
  it("quita el color y deja la forma", () => {
    expect(sombraLegible("rgba(20, 20, 15, 0.45) 0px 24px 60px -34px")).toBe(
      "0 24px 60px -34px",
    );
  });

  it("respeta las sombras compuestas, separadas por coma", () => {
    expect(
      sombraLegible(
        "rgba(20, 20, 15, 0.07) 0px 1px 2px 0px, rgba(1, 2, 3, 0.1) 0px 10px 20px -5px",
      ),
    ).toBe("0 1px 2px 0, 0 10px 20px -5px");
  });
});

describe("la tipografía", () => {
  it("el espaciado entre letras va en em, como en la entrega", () => {
    expect(espaciadoLegible("3.3px", "11px")).toBe("0,3 em");
    expect(espaciadoLegible("normal", "11px")).toBeNull();
  });

  it("la familia se nombra por la entrega, no por el alias de next/font", () => {
    const familias = [
      {
        pila: '"serif", "serif Fallback", "Cormorant Infant", serif',
        nombre: "Cormorant Infant",
      },
      { pila: '"sans", "sans Fallback", "Jost", sans-serif', nombre: "Jost" },
    ];
    // El navegador quita unas comillas y deja otras: tiene que dar igual.
    expect(familiaLegible('sans, "sans Fallback", Jost, sans-serif', familias)).toBe("Jost");
  });

  it("una familia que no es de la marca sale con su propio nombre", () => {
    expect(familiaLegible('"Times New Roman", serif', [])).toBe("Times New Roman");
  });
});
