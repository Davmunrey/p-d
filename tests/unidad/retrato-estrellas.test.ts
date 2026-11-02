import { describe, expect, it } from "vitest";

import { RETRATO_DE_ESTRELLAS } from "../../src/config/constants";
import {
  comoRetrato,
  estrellasDeLaSilueta,
  type Silueta,
} from "../../src/lib/retrato/estrellas";

/** Una silueta fabricada: opaco donde `figura(x, y)` diga, transparente el resto. */
function silueta(
  ancho: number,
  alto: number,
  figura: (x: number, y: number) => boolean,
): Silueta {
  const alfa = new Uint8Array(ancho * alto);
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) if (figura(x, y)) alfa[y * ancho + x] = 255;
  }
  return { ancho, alto, alfa };
}

const circulo = (cx: number, cy: number, r: number) => (x: number, y: number) =>
  (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

describe("estrellasDeLaSilueta", () => {
  it("un círculo da estrellas sobre su borde, y nada dentro", () => {
    const retrato = estrellasDeLaSilueta(silueta(200, 200, circulo(100, 100, 70)))!;

    expect(retrato).not.toBeNull();
    expect(retrato.proporcion).toBeCloseTo(1, 1);
    expect(retrato.estrellas.length).toBeGreaterThan(30);
    for (const [x, y, brillo] of retrato.estrellas) {
      // En la caja de la figura, el borde de un círculo está a media caja del centro.
      expect(Math.hypot(x - 0.5, y - 0.5)).toBeCloseTo(0.5, 1);
      expect(brillo).toBeGreaterThan(0);
      expect(brillo).toBeLessThanOrEqual(1);
    }
  });

  it("empieza por arriba: la primera estrella es la más alta", () => {
    const { estrellas } = estrellasDeLaSilueta(silueta(200, 200, circulo(100, 100, 70)))!;
    const masAlta = Math.min(...estrellas.map(([, y]) => y));
    expect(estrellas[0]![1]).toBeCloseTo(masAlta, 2);
  });

  it("las esquinas de un cuadrado son estrellas principales", () => {
    const cuadrado = (x: number, y: number) => x >= 40 && x < 160 && y >= 40 && y < 160;
    const { estrellas } = estrellasDeLaSilueta(silueta(200, 200, cuadrado))!;
    const principales = estrellas.filter(([, , brillo]) => brillo === 1);

    for (const [ex, ey] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      const cerca = principales.some(([x, y]) => Math.hypot(x - ex, y - ey) < 0.08);
      expect(cerca, `falta la esquina (${ex}, ${ey})`).toBe(true);
    }
    // Y no todas: las de los lados rectos son las de fondo.
    expect(principales.length).toBeLessThan(estrellas.length / 4);
  });

  it("dos figuras separadas se dibujan las dos, y una miga suelta no", () => {
    const dos = (x: number, y: number) =>
      circulo(60, 100, 40)(x, y) || circulo(160, 110, 30)(x, y) || circulo(110, 15, 2)(x, y);
    const { estrellas } = estrellasDeLaSilueta(silueta(220, 200, dos))!;

    const izquierda = estrellas.filter(([x]) => x < 0.45).length;
    const derecha = estrellas.filter(([x]) => x > 0.55).length;
    expect(izquierda).toBeGreaterThan(10);
    expect(derecha).toBeGreaterThan(10);
    // La miga estaba arriba en medio: ahí no hay estrellas.
    expect(estrellas.some(([x, y]) => Math.abs(x - 0.5) < 0.05 && y < 0.1)).toBe(false);
  });

  it("siempre igual: la misma foto da el mismo retrato", () => {
    const una = estrellasDeLaSilueta(silueta(150, 180, circulo(75, 90, 60)));
    const otra = estrellasDeLaSilueta(silueta(150, 180, circulo(75, 90, 60)));
    expect(una).toEqual(otra);
  });

  it("no pasa del tope de estrellas: si el contorno da para más, las separa", () => {
    const ajustes = { ...RETRATO_DE_ESTRELLAS, paso: 0.001, maximoEstrellas: 40 };
    const { estrellas } = estrellasDeLaSilueta(
      silueta(200, 200, circulo(100, 100, 80)),
      ajustes,
    )!;
    expect(estrellas.length).toBeLessThanOrEqual(45);
  });

  // CASOS DE ERROR: lo que no es una foto recortada no tiene contorno.
  it("una foto sin transparencia no se dibuja", () => {
    expect(estrellasDeLaSilueta(silueta(100, 100, () => true))).toBeNull();
    // Casi entera opaca —un marco de un píxel transparente— tampoco es un recorte.
    expect(
      estrellasDeLaSilueta(silueta(100, 100, (x, y) => x > 0 && y > 0 && x < 99 && y < 99)),
    ).toBeNull();
  });

  it("una foto toda transparente, o mal medida, tampoco", () => {
    expect(estrellasDeLaSilueta(silueta(100, 100, () => false))).toBeNull();
    expect(estrellasDeLaSilueta({ ancho: 10, alto: 10, alfa: new Uint8Array(5) })).toBeNull();
  });
});

describe("comoRetrato", () => {
  const bueno = {
    proporcion: 0.9,
    estrellas: [
      [0, 0, 1],
      [0.5, 0.5, 0.5],
      [1, 1, 0.45],
    ],
  };

  it("deja pasar un retrato bien formado", () => {
    expect(comoRetrato(bueno)).toEqual(bueno);
  });

  it("descarta las estrellas que no son tres números entre 0 y 1", () => {
    const conMalas = {
      ...bueno,
      estrellas: [...bueno.estrellas, [2, 0, 1], ["a", 0, 1], [0, 0]],
    };
    expect(comoRetrato(conMalas)?.estrellas).toHaveLength(3);
  });

  // CASO DE ERROR: lo que no se entiende no se pinta, y la página sigue.
  it("lo que no tiene la forma de un retrato es null", () => {
    expect(comoRetrato(null)).toBeNull();
    expect(comoRetrato("estrellas")).toBeNull();
    expect(comoRetrato({ proporcion: 0, estrellas: bueno.estrellas })).toBeNull();
    expect(comoRetrato({ proporcion: 1, estrellas: "x" })).toBeNull();
    expect(comoRetrato({ proporcion: 1, estrellas: [[0, 0, 1]] })).toBeNull();
  });
});
