import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import copy from "../../content/copy.es.json";

/**
 * EL RESUMEN DEL PANEL SIN FECHA Y SIN INVITADOS
 *
 * Las dos ramas que dicen «todavía no hay» en vez de enseñar ceros. El E2E del
 * resumen corre contra la semilla —con fecha y con invitados— y no puede
 * llegar a ninguna sin vaciar una base que comparten todos los demás tests;
 * su título prometía las dos y no recorría ninguna. Aquí se pinta la página
 * con los datos de cada caso.
 */

const configuracion = vi.fn();
const resumen = vi.fn();

vi.mock("@/lib/bbdd/landing", () => ({ obtenerConfiguracion: () => configuracion() }));
vi.mock("@/lib/bbdd/resumen", () => ({ obtenerResumen: () => resumen() }));
vi.mock("@/lib/bbdd/presupuesto", () => ({
  obtenerResumenPresupuesto: async () => [],
  desviosDe: () => [],
}));

const INVITADOS = {
  personas: 12,
  confirmados: 5,
  adultosConfirmados: 4,
  ninosConfirmados: 1,
  rechazados: 2,
  pendientes: 5,
  plazasAutobus: 3,
};

async function pintar(): Promise<string> {
  const { default: PaginaResumen } = await import("../../src/app/panel/page");
  return renderToStaticMarkup(await PaginaResumen());
}

describe("el resumen del panel", () => {
  beforeEach(() => {
    vi.resetModules();
    configuracion.mockResolvedValue({ fechaCeremonia: new Date(Date.now() + 40 * 86_400_000) });
    resumen.mockResolvedValue({ invitados: INVITADOS, menus: [] });
  });

  it("con fecha e invitados enseña la cuenta atrás y las cifras", async () => {
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.bloqueInvitados);
    expect(html).not.toContain(copy.panel.resumen.sinFecha);
    expect(html).not.toContain(copy.panel.resumen.sinInvitados);
  });

  it("si no se puede leer la fecha, lo dice en vez de inventar una cuenta atrás", async () => {
    configuracion.mockRejectedValue(new Error("sin configuración"));
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.sinFecha);
    // Y lo demás sigue: no saber la fecha no deja el panel en blanco.
    expect(html).toContain(copy.panel.resumen.bloqueInvitados);
  });

  it("sin invitados lo dice, enlaza a darlos de alta y no pinta ceros", async () => {
    resumen.mockResolvedValue({
      invitados: { ...INVITADOS, personas: 0, confirmados: 0, pendientes: 0 },
      menus: [],
    });
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.sinInvitados);
    expect(html).toContain(copy.panel.resumen.irAInvitados);
    expect(html).not.toContain(copy.panel.resumen.bloqueInvitados);
    expect(html).not.toContain(copy.panel.resumen.bloqueLogistica);
  });
});
