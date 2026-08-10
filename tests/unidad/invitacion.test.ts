import { describe, expect, it } from "vitest";

import { RUTA_RSVP } from "../../src/config/constants";
import { tokenDeInvitacionEnRuta } from "../../src/lib/invitacion";

/**
 * DE QUÉ RUTAS SE APUNTA LA INVITACIÓN
 *
 * De esta función depende que la cookie del navegador guarde un token de
 * verdad y no cualquier cosa. Equivocarse tiene dos formas, y las dos son
 * malas:
 *
 *  - **Guardar de más.** Si mañana existiera `/rsvp/<token>/gracias` y se
 *    cogiera el primer trozo, iría bien; pero si se cogiera la ruta entera se
 *    guardaría un token inválido ENCIMA del bueno, y la playlist dejaría de
 *    funcionarle a quien ya la tenía.
 *  - **Guardar de menos.** Sin token no hay campo en la portada, y el invitado
 *    ve la explicación de que le falta su enlace cuando acaba de abrirlo.
 *
 * Es una función pura y el middleware no se puede probar de otra manera
 * razonable, así que se prueba aquí, que además cuesta milisegundos.
 */
describe("El token de invitación en la ruta", () => {
  it("lo saca de un enlace de invitación", () => {
    expect(tokenDeInvitacionEnRuta(`${RUTA_RSVP}/abc-123`)).toBe("abc-123");
  });

  it("lo devuelve descodificado, como lo espera la base", () => {
    // Un token con un carácter que el navegador escapa por el camino: si se
    // guardara tal cual, la huella no coincidiría con ninguna invitación.
    expect(tokenDeInvitacionEnRuta(`${RUTA_RSVP}/uno%2Bdos`)).toBe("uno+dos");
  });

  it("no se inventa nada fuera del RSVP", () => {
    expect(tokenDeInvitacionEnRuta("/")).toBeNull();
    expect(tokenDeInvitacionEnRuta("/panel/invitados")).toBeNull();
    expect(tokenDeInvitacionEnRuta("/rsvpalgo/abc")).toBeNull();
  });

  it("la raíz del RSVP no lleva token", () => {
    expect(tokenDeInvitacionEnRuta(RUTA_RSVP)).toBeNull();
    expect(tokenDeInvitacionEnRuta(`${RUTA_RSVP}/`)).toBeNull();
  });

  /**
   * LO MÁS PROFUNDO NO ES UNA INVITACIÓN.
   *
   * Hoy no existe ninguna ruta así. Se fija ahora porque el día que exista,
   * quien la añada no va a acordarse de esta cookie.
   */
  it("una ruta más profunda no cuenta", () => {
    expect(tokenDeInvitacionEnRuta(`${RUTA_RSVP}/abc-123/gracias`)).toBeNull();
  });

  it("una ruta mal codificada no rompe nada", () => {
    // `decodeURIComponent` lanza con un `%` suelto. Un middleware que lanza
    // tumba TODAS las páginas de la web, no sólo ésta.
    expect(tokenDeInvitacionEnRuta(`${RUTA_RSVP}/100%`)).toBeNull();
  });
});
