import { describe, expect, it } from "vitest";

import { sillasOcupadas } from "../../src/lib/aforo";

const ESTADO_CONFIRMADO = "confirmado";
const ESTADO_RECHAZADO = "rechazado";

/**
 * QUIEN DICE QUE NO DEJA SU SILLA LIBRE (n16 de la auditoría integral).
 *
 * Se sigue pintando en su mesa con «No viene», pero no cuenta para el aforo:
 * antes la mesa salía «8 de 8» con una silla libre y no dejaba sentar a nadie.
 */
describe("sillasOcupadas", () => {
  it("cuenta a los que vienen y a los que aún no han contestado", () => {
    expect(sillasOcupadas([{ estado: ESTADO_CONFIRMADO }, { estado: "pendiente" }])).toBe(2);
  });

  it("no cuenta a quien ha dicho que no", () => {
    expect(
      sillasOcupadas([
        { estado: ESTADO_CONFIRMADO },
        { estado: ESTADO_RECHAZADO },
        { estado: ESTADO_RECHAZADO },
      ]),
    ).toBe(1);
    expect(sillasOcupadas([])).toBe(0);
  });
});
