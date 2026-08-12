import { describe, expect, it } from "vitest";

import { evolucionMensual, proporcion, repartoPorCategoria } from "../../src/lib/graficas";

/**
 * BODA-63 · LAS CUENTAS DE LAS GRÁFICAS, ANTES DE DIBUJARLAS
 *
 * Una barra mal escalada no se nota mirándola: se nota comparándola con otra, y
 * para entonces alguien ya ha decidido algo con ella. Aquí se comprueban las
 * cuentas con números que se pueden llevar a mano.
 */

describe("el reparto del gasto por categoría", () => {
  it("reparte el cien por cien entre las categorías con gasto", () => {
    const reparto = repartoPorCategoria([
      { categoria: "Catering", real: 6000 },
      { categoria: "Fotografía", real: 3000 },
      { categoria: "Flores", real: 1000 },
    ]);

    expect(reparto.map((parte) => parte.porcentaje)).toEqual([60, 30, 10]);
    expect(reparto.reduce((suma, parte) => suma + parte.porcentaje, 0)).toBe(100);
  });

  it("ordena de la que más se lleva a la que menos, no como venían", () => {
    const reparto = repartoPorCategoria([
      { categoria: "Flores", real: 1000 },
      { categoria: "Catering", real: 6000 },
      { categoria: "Fotografía", real: 3000 },
    ]);

    expect(reparto.map((parte) => parte.categoria)).toEqual([
      "Catering",
      "Fotografía",
      "Flores",
    ]);
  });

  it("deja fuera las categorías sin gasto", () => {
    const reparto = repartoPorCategoria([
      { categoria: "Catering", real: 6000 },
      { categoria: "Sin tocar", real: 0 },
    ]);

    expect(reparto.map((parte) => parte.categoria)).toEqual(["Catering"]);
  });

  /**
   * EL CASO QUE PINTA UNA BARRA DE ANCHURA «NaN». Con todo a cero, dividir por
   * el total da `NaN`, el `<svg>` recibe `width="NaN"` y no dibuja nada — sin
   * error, sin aviso y sin que nadie se entere hasta que falta media gráfica.
   */
  it("con todo a cero no divide por cero", () => {
    expect(repartoPorCategoria([{ categoria: "Nada", real: 0 }])).toEqual([]);
    expect(repartoPorCategoria([])).toEqual([]);
  });
});

describe("la evolución de lo gastado", () => {
  it("suma por mes y va acumulando", () => {
    const meses = evolucionMensual([
      { importe: 1000, pagadoEn: "2026-01-10T10:00:00Z" },
      { importe: 500, pagadoEn: "2026-01-20T10:00:00Z" },
      { importe: 2000, pagadoEn: "2026-03-05T10:00:00Z" },
    ]);

    expect(meses.map((mes) => mes.clave)).toEqual(["2026-01", "2026-03"]);
    expect(meses.map((mes) => mes.importe)).toEqual([1500, 2000]);
    expect(meses.map((mes) => mes.acumulado)).toEqual([1500, 3500]);
  });

  /**
   * LO QUE NO SE HA PAGADO NO SE HA GASTADO. Un vencimiento futuro no es dinero
   * que haya salido de la cuenta, y meterlo en la curva de «cuánto llevamos»
   * la convertiría en «cuánto llevaremos», que es otra gráfica.
   */
  it("no cuenta lo que todavía no se ha pagado", () => {
    const meses = evolucionMensual([
      { importe: 1000, pagadoEn: null },
      { importe: 400, pagadoEn: "2026-02-01T10:00:00Z" },
    ]);

    expect(meses).toHaveLength(1);
    expect(meses[0].acumulado).toBe(400);
  });

  it("ordena los meses por fecha aunque lleguen al revés", () => {
    const meses = evolucionMensual([
      { importe: 300, pagadoEn: "2026-12-01T10:00:00Z" },
      { importe: 100, pagadoEn: "2026-02-01T10:00:00Z" },
    ]);

    expect(meses.map((mes) => mes.clave)).toEqual(["2026-02", "2026-12"]);
    expect(meses.map((mes) => mes.acumulado)).toEqual([100, 400]);
  });

  /**
   * EL PAGO DE MEDIANOCHE. Un pago del 1 de marzo a las 00:30 en Madrid es el
   * 28 de febrero a las 23:30 en UTC. Contado en UTC cae en la barra de
   * febrero: el mes se corta donde lo corta el calendario de la boda.
   */
  it("el mes es el de la boda, no el del servidor", () => {
    const meses = evolucionMensual([{ importe: 100, pagadoEn: "2026-02-28T23:30:00Z" }]);

    expect(meses[0].clave, "23:30 UTC del 28 de febrero son las 00:30 del 1 de marzo").toBe(
      "2026-03",
    );
  });

  it("una fecha que no se entiende no tumba la gráfica", () => {
    const meses = evolucionMensual([
      { importe: 100, pagadoEn: "esto no es una fecha" },
      { importe: 200, pagadoEn: "2026-05-01T10:00:00Z" },
    ]);

    expect(meses.map((mes) => mes.importe)).toEqual([200]);
  });

  it("la etiqueta se lee en castellano", () => {
    const meses = evolucionMensual([{ importe: 100, pagadoEn: "2026-03-04T10:00:00Z" }]);
    expect(meses[0].etiqueta).toMatch(/marzo/i);
    expect(meses[0].etiqueta).toContain("2026");
  });
});

describe("la proporción de una barra", () => {
  it("es la parte que le toca del máximo", () => {
    expect(proporcion(50, 100)).toBe(0.5);
    expect(proporcion(100, 100)).toBe(1);
  });

  it("sin máximo no dibuja nada, en vez de dividir por cero", () => {
    expect(proporcion(10, 0)).toBe(0);
  });

  it("nunca se sale del lienzo ni se va a negativo", () => {
    expect(proporcion(200, 100)).toBe(1);
    expect(proporcion(-50, 100)).toBe(0);
  });
});
