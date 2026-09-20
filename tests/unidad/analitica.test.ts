import { describe, expect, it } from "vitest";

import { RUTA_ACCESO, RUTA_PANEL, RUTA_RSVP } from "../../src/config/constants";
import { pasoDelEmbudo } from "../../src/components/analitica";

/**
 * BODA-93 · Qué rutas cuentan como pasos del embudo.
 *
 * La analítica vive en el layout raíz, que envuelve también el panel: sin
 * mirar la ruta, cada recarga del panel contaba como «alguien ha abierto la
 * invitación», y el único número que se mide medía sobre todo a los novios.
 */
describe("pasoDelEmbudo", () => {
  it("la portada es abrir la invitación; el RSVP, llegar al formulario", () => {
    expect(pasoDelEmbudo("/")).toBe("landing_vista");
    expect(pasoDelEmbudo(`${RUTA_RSVP}/un-token-cualquiera`)).toBe("rsvp_vista");
  });

  it("el panel, la puerta y todo lo demás no son pasos de nadie", () => {
    expect(pasoDelEmbudo(RUTA_PANEL)).toBeNull();
    expect(pasoDelEmbudo(`${RUTA_PANEL}/invitados`)).toBeNull();
    expect(pasoDelEmbudo(RUTA_ACCESO)).toBeNull();
    expect(pasoDelEmbudo("/reserva-la-fecha")).toBeNull();
    expect(pasoDelEmbudo(RUTA_RSVP)).toBeNull();
    expect(pasoDelEmbudo(null)).toBeNull();
  });
});
