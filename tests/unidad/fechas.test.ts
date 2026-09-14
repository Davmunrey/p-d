import { describe, expect, it } from "vitest";

import {
  anio,
  fechaConDia,
  fechaEnPuntos,
  fechaLarga,
  nombreDelDia,
  vispera,
} from "@/lib/fechas";

/**
 * BODA-115 · Cómo se escriben las fechas
 *
 * El Sistema de marca lo fija en su lista de repaso: «26 · 06 · 2027» o «26 de
 * junio de 2027»; y la Landing aplicada escribe la cabecera del programa como
 * «Sábado 26 de junio» —sin coma y sin año—. Cada formateador tiene aquí su
 * ejemplo copiado de la entrega, para que nadie lo «mejore» con la coma que
 * `Intl` pone por defecto.
 */

// Un sábado a las 13:00 de Madrid (11:00 UTC en junio).
const SABADO = new Date("2027-06-26T11:00:00Z");

describe("las fechas de la marca", () => {
  it("«26 · 06 · 2027»: la forma corta, con puntos medios", () => {
    expect(fechaEnPuntos(SABADO)).toBe("26 · 06 · 2027");
  });

  it("«Sábado 26 de junio»: la cabecera del programa, sin coma ni año", () => {
    expect(fechaConDia(SABADO)).toBe("Sábado 26 de junio");
  });

  it("«26 de junio de 2027»: los plazos, sin día de la semana", () => {
    expect(fechaLarga(SABADO)).toBe("26 de junio de 2027");
  });

  it("el nombre del día va en minúscula, para dentro de una frase", () => {
    expect(nombreDelDia(SABADO)).toBe("sábado");
  });

  it("«2027»: el año solo, para la línea grande de la tarjeta", () => {
    expect(anio(SABADO)).toBe("2027");
    // Contado en la zona de la boda: una Nochevieja a las 23:30 UTC ya es el
    // año siguiente en Madrid.
    expect(anio(new Date("2027-12-31T23:30:00Z"))).toBe("2028");
  });

  it("la víspera de un sábado es el viernes", () => {
    expect(fechaConDia(vispera(SABADO))).toBe("Viernes 25 de junio");
    expect(nombreDelDia(vispera(SABADO))).toBe("viernes");
  });

  /**
   * CASO DE ERROR. Una boda a las 00:30 del sábado son las 22:30 UTC del
   * viernes. Contada en UTC, la víspera saldría «jueves»; contada en la zona
   * de la boda, es el viernes, que es lo que tiene en la cabeza quien viene
   * de fuera.
   */
  it("la víspera se cuenta en la zona de la boda, no en UTC", () => {
    const madrugada = new Date("2027-06-25T22:30:00Z");
    expect(fechaConDia(madrugada)).toBe("Sábado 26 de junio");
    expect(fechaConDia(vispera(madrugada))).toBe("Viernes 25 de junio");
  });
});
