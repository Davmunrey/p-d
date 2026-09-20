import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BODA-100 · La cola de marcas del guion del día, con dos toques seguidos.
 *
 * El caso: marcar un punto y, con la petición todavía en vuelo, desmarcarlo.
 * Cuando volvía la respuesta de la PRIMERA, la cola soltaba la entrada por id
 * y tiraba la marca NUEVA —la de desmarcar— sin haberla mandado. La pantalla
 * saltaba sola a «hecho» y, si la segunda petición fallaba, no quedaba nada que
 * reintentar. Soltar sólo lo que sigue siendo lo que se mandó lo evita.
 *
 * El módulo guarda la cola en memoria, así que cada test lo importa de nuevo.
 */
async function colaLimpia() {
  vi.resetModules();
  window.localStorage.clear();
  return import("../../src/app/panel/dia/cola");
}

const P = "punto-1";
const T1 = "2027-06-26T12:30:00.000Z";

describe("soltar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("suelta lo que se mandó tal cual", async () => {
    const cola = await colaLimpia();
    cola.apuntar(P, T1);
    cola.soltar([[P, T1]]);
    expect(cola.instantanea()).toEqual({});
  });

  it("EL CASO: no suelta la marca nueva cuando vuelve la respuesta de la vieja", async () => {
    const cola = await colaLimpia();
    cola.apuntar(P, T1); // marcar → se manda T1
    cola.apuntar(P, null); // desmarcar antes de que conteste → se manda null

    cola.soltar([[P, T1]]); // vuelve la respuesta de T1

    // La marca de desmarcar sigue pendiente: es lo último que hizo quien marcaba.
    expect(cola.instantanea()).toEqual({ [P]: null });

    cola.soltar([[P, null]]); // y cuando vuelve la suya, sí
    expect(cola.instantanea()).toEqual({});
  });

  it("no toca lo que no se mandó", async () => {
    const cola = await colaLimpia();
    cola.apuntar(P, T1);
    cola.apuntar("punto-2", null);
    cola.soltar([[P, T1]]);
    expect(cola.instantanea()).toEqual({ "punto-2": null });
    cola.soltar([]);
    expect(cola.instantanea()).toEqual({ "punto-2": null });
  });
});
