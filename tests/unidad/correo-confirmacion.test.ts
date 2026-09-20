import { describe, expect, it } from "vitest";

import copy from "../../content/copy.es.json";
import { componerConfirmacion } from "../../src/lib/correo-confirmacion";

/**
 * La carta del acuse de recibo.
 *
 * El enlace para cambiar la respuesta sólo va si es absoluto: un
 * `<a href="/rsvp/…">` no abre desde ningún cliente de correo, y un correo ya
 * enviado no se corrige. Sin dominio conocido, el párrafo no va.
 */
const base = {
  vienen: ["Aitor"],
  noVienen: [] as string[],
  fechaLimite: null,
  nombreNovia: "Paloma",
  nombreNovio: "David",
};

describe("componerConfirmacion", () => {
  it("con enlace, lo lleva en HTML y en texto plano", () => {
    const carta = componerConfirmacion({
      ...base,
      enlace: "https://boda.test/rsvp/abc",
    });

    expect(carta.html).toContain('<a href="https://boda.test/rsvp/abc">');
    expect(carta.texto).toContain("https://boda.test/rsvp/abc");
    expect(carta.texto).toContain(copy.correoConfirmacion.cambiar);
  });

  it("sin dominio, sale sin el párrafo del enlace en vez de con uno roto", () => {
    const carta = componerConfirmacion({ ...base, enlace: null });

    expect(carta.html).not.toContain("<a href");
    expect(carta.html).not.toContain(copy.correoConfirmacion.cambiar);
    expect(carta.texto).not.toContain(copy.correoConfirmacion.cambiar);
    // Y el resto de la carta sigue entera.
    expect(carta.texto).toContain(copy.correoConfirmacion.despedida);
    expect(carta.html).toContain("Aitor");
  });
});
