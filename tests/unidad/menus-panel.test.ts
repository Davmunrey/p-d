import { describe, expect, it } from "vitest";

import copy from "../../content/copy.es.json";
import { MENUS_RSVP } from "../../src/config/constants";

/**
 * EL PANEL NO HABLA CON LA VOZ DEL INVITADO
 *
 * «Otro (lo cuento en alergias)» es lo que lee el invitado en su formulario, en
 * primera persona. En el panel, en el recuento del día y en los CSV que van al
 * catering salía tal cual. El panel tiene sus propios rótulos de menú, y tiene
 * que haber uno por cada menú que se puede pedir.
 */
describe("los rótulos de menú del panel", () => {
  it("hay uno por cada menú del formulario, y en los dos sitios", () => {
    for (const menu of MENUS_RSVP) {
      expect(copy.panel.menus[menu], `falta panel.menus.${menu}`).toBeTruthy();
      expect(copy.rsvp.menus[menu], `falta rsvp.menus.${menu}`).toBeTruthy();
    }
  });

  it("«otro» no lo dice el invitado en primera persona", () => {
    expect(copy.panel.menus.otro).not.toBe(copy.rsvp.menus.otro);
  });
});
