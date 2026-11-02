import { describe, expect, it } from "vitest";

import { DIAS_RECUERDO_INVITACION } from "../../src/config/constants";
import { COOKIE_INVITACION, opcionesCookieInvitacion } from "../../src/lib/invitacion";

/**
 * LA COOKIE QUE RECUERDA LA INVITACIÓN
 *
 * La pone `/invitacion/<token>` al abrir el enlace y la lee la portada para
 * saludar al grupo y enseñar el campo de la playlist. Equivocarse en cómo se
 * guarda tiene dos formas, y las dos se notan tarde:
 *
 *  - **Que no llegue.** `Secure` sobre `http` y Safari la tira sin avisar: el
 *    invitado abre su enlace y la portada no le conoce.
 *  - **Que llegue a quien no debe.** Legible desde JavaScript, cualquier script
 *    de la página tendría el token en la mano.
 */
describe("La cookie de la invitación", () => {
  it("tiene un nombre con prefijo propio", () => {
    expect(COOKIE_INVITACION.startsWith("boda:")).toBe(true);
  });

  it("sólo la lee el servidor, en toda la web, y dura lo que se ha decidido", () => {
    const opciones = opcionesCookieInvitacion("https");
    expect(opciones.httpOnly).toBe(true);
    expect(opciones.sameSite).toBe("lax");
    expect(opciones.path).toBe("/");
    expect(opciones.maxAge).toBe(DIAS_RECUERDO_INVITACION * 24 * 60 * 60);
  });

  it("es segura cuando la petición llegó por https, venga como venga escrito", () => {
    expect(opcionesCookieInvitacion("https").secure).toBe(true);
    // `nextUrl.protocol` lleva los dos puntos; la cabecera del proxy, no.
    expect(opcionesCookieInvitacion("https:").secure).toBe(true);
  });

  it("no se marca segura sobre http, que es como corren los E2E", () => {
    expect(opcionesCookieInvitacion("http").secure).toBe(false);
    expect(opcionesCookieInvitacion("http:").secure).toBe(false);
    expect(opcionesCookieInvitacion(null).secure).toBe(false);
  });
});
