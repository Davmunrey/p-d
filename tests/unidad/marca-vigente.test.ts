import { describe, expect, it } from "vitest";

import { marcaVigente } from "../../src/app/panel/dia/cola";

/**
 * BODA-100 · Qué marca se pinta en el guion del día
 *
 * La pantalla del día tiene tres sitios donde puede estar la verdad —lo que
 * está sin mandar, lo que el servidor ya aceptó, y lo que había en la base al
 * pintar— y el orden entre ellas decide lo que ve quien marca. Equivocarse no
 * da error: la marca simplemente aparece o desaparece cuando no toca, y sólo se
 * nota mirando la pantalla en el instante exacto.
 *
 * Por eso la regla es una función pura y se prueba aquí. El caso que motivó
 * esto —la marca borrándose sola al confirmarla el servidor— tiene su test con
 * nombre propio abajo.
 */

const HORA = "2027-06-26T12:30:00.000Z";

describe("qué marca se pinta", () => {
  it("lo que está sin mandar manda sobre todo lo demás", () => {
    expect(marcaVigente("a", null, { a: HORA }, {})).toBe(HORA);
    // Y desmarcar también: `null` en la cola es «se desmarcó», no «no hay nada».
    expect(marcaVigente("a", HORA, { a: null }, {})).toBeNull();
  });

  it("una marca ya aceptada NO se borra al salir de la cola", () => {
    /*
      ESTE ES EL FALLO QUE SE ARREGLÓ. Al confirmar, la marca sale de la cola;
      si no hubiera capa de confirmadas, aquí se caería al valor del servidor
      —que es de antes de marcar— y la pantalla se desmarcaría sola medio
      segundo después de marcarse. El día de la boda, con el móvil en una mano.
    */
    expect(marcaVigente("a", null, {}, { a: HORA })).toBe(HORA);
  });

  it("y lo que el servidor rechazó vuelve al valor de la base", () => {
    // A un lector no se le marca nada, y la pantalla no puede decirle que sí:
    // su marca no entra ni en la cola ni en las confirmadas.
    expect(marcaVigente("a", null, {}, {})).toBeNull();
    expect(marcaVigente("a", HORA, {}, {})).toBe(HORA);
  });

  it("sin nada de por medio, manda la base", () => {
    expect(marcaVigente("b", HORA, { a: null }, { c: HORA })).toBe(HORA);
  });
});
