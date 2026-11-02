import { describe, expect, it } from "vitest";

import copy from "../../content/copy.es.json";
import { MENUS_INVITADO } from "../../src/config/constants";

/**
 * CADA MENÚ TIENE SU RÓTULO EN EL PANEL
 *
 * Los menús se apuntan a mano en el panel —los invitados contestan por
 * WhatsApp— y salen en el recuento del día y en los CSV que van al catering. Un
 * menú sin rótulo saldría como su clave en crudo («sin_gluten»).
 */
describe("los rótulos de menú del panel", () => {
  it("hay uno por cada menú que se puede apuntar", () => {
    for (const menu of MENUS_INVITADO) {
      expect(copy.panel.menus[menu], `falta panel.menus.${menu}`).toBeTruthy();
    }
  });
});
