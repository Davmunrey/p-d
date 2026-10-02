import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CuentaAtras } from "@/components/marketing/cuenta-atras";
import { diaEnLaBoda } from "@/lib/fechas";

import copy from "../../content/copy.es.json";

/**
 * «HOY ES EL DÍA» SÓLO EL DÍA DE LA BODA.
 *
 * La cuenta atrás marcaba «llegado» en cuanto el instante de la ceremonia
 * pasaba, y desde ahí anunciaba «Hoy es el día» para siempre: el 27 de junio,
 * en julio, a quien entrase a ver la galería meses después.
 */
const CEREMONIA = "2027-06-26T11:00:00.000Z"; // 13:00 en Madrid

describe("diaEnLaBoda", () => {
  it("cuenta el día en Madrid, no en UTC", () => {
    // 22:30 UTC del 2 de octubre son las 00:30 del 3 en Madrid (horario de verano).
    expect(diaEnLaBoda(new Date("2026-10-02T22:30:00Z"))).toBe("2026-10-03");
    expect(diaEnLaBoda(new Date("2026-10-02T21:30:00Z"))).toBe("2026-10-02");
  });
});

describe("la cuenta atrás después de la boda", () => {
  it("antes de la ceremonia cuenta", () => {
    const html = renderToStaticMarkup(
      <CuentaAtras fechaIso={CEREMONIA} ahoraIso="2027-06-20T10:00:00.000Z" />,
    );
    expect(html).not.toContain(copy.cuentaAtras.yaEsHoy);
    expect(html).toContain(copy.cuentaAtras.dias);
  });

  it("el mismo día, pasada la hora, dice que hoy es el día", () => {
    const html = renderToStaticMarkup(
      <CuentaAtras fechaIso={CEREMONIA} ahoraIso="2027-06-26T20:00:00.000Z" />,
    );
    expect(html).toContain(copy.cuentaAtras.yaEsHoy);
  });

  it("al día siguiente ya no dice nada", () => {
    const html = renderToStaticMarkup(
      <CuentaAtras fechaIso={CEREMONIA} ahoraIso="2027-06-27T09:00:00.000Z" />,
    );
    expect(html).toBe("");
  });
});
