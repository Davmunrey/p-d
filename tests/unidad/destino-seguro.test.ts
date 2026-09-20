import { describe, expect, it } from "vitest";

import { destinoSeguro } from "../../src/app/acceso/estado";
import { RUTA_PANEL } from "../../src/config/constants";

/**
 * La guarda contra el trampolín: `?volver=` sólo vale dentro del panel.
 *
 * Su único E2E no la ejercitaba —con el acceso fallido nunca se llega al
 * `redirect(destino)`—, así que borrarla dejaba la suite en verde.
 */
describe("destinoSeguro", () => {
  it("acepta el panel y lo que cuelga de él", () => {
    expect(destinoSeguro(RUTA_PANEL)).toBe(RUTA_PANEL);
    expect(destinoSeguro(`${RUTA_PANEL}/invitados`)).toBe(`${RUTA_PANEL}/invitados`);
    expect(destinoSeguro(`${RUTA_PANEL}/invitados?buscar=ana`)).toBe(
      `${RUTA_PANEL}/invitados?buscar=ana`,
    );
  });

  it("todo lo demás vuelve a la portada del panel", () => {
    expect(destinoSeguro(null)).toBe(RUTA_PANEL);
    expect(destinoSeguro("")).toBe(RUTA_PANEL);
    expect(destinoSeguro("https://otro-sitio.test/")).toBe(RUTA_PANEL);
    expect(destinoSeguro("//otro-sitio.test/")).toBe(RUTA_PANEL);
    expect(destinoSeguro("/etc/passwd")).toBe(RUTA_PANEL);
    expect(destinoSeguro(`${RUTA_PANEL}trampa`)).toBe(RUTA_PANEL);
    expect(destinoSeguro("/")).toBe(RUTA_PANEL);
  });
});
