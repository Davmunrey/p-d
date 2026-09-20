import { describe, expect, it } from "vitest";

import { TROZO_COOKIE_BYTES } from "../../src/config/constants";
import {
  codificar,
  decodificar,
  nombreDelTrozo,
  trocear,
  trozosSobrantes,
  unirTrozos,
} from "../../src/lib/cookie-troceada";

/**
 * El borrador del RSVP repartido en varias cookies.
 *
 * El caso que lo trajo: cuatro personas con menú, alergias y autobús y un
 * mensaje de dos mil caracteres con tildes medían 4.445 bytes codificados por
 * Next, y el navegador tiraba la cookie sin decir nada. Aquí se fabrica ese
 * borrador y se comprueba que cada trozo cabe Y que se escribe tal cual.
 */

function borradorRealista() {
  const ids = [
    "8f3c1a2e-4b5d-4c6e-9f10-1a2b3c4d5e6f",
    "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
    "3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f",
  ];
  const frase =
    "Qué ilusión nos hace ir a vuestra boda, de verdad. Iremos los cuatro y nos quedaremos hasta el final; ";
  return {
    token: "desarrollo-e2e-largo-000000",
    asistencia: Object.fromEntries(ids.map((id) => [id, "confirmado"])),
    menu: Object.fromEntries(ids.map((id) => [id, "vegetariano"])),
    alergias: Object.fromEntries(
      ids.map((id) => [id, "Celíaca, y alérgica a los frutos secos"]),
    ),
    autobus: Object.fromEntries(ids.map((id) => [id, true])),
    cancion: "Bailando — Enrique Iglesias",
    mensaje: frase.repeat(30).slice(0, 2000),
  };
}

describe("cookie troceada", () => {
  it("codifica y decodifica sin perder tildes, eñes ni guiones largos", () => {
    const borrador = borradorRealista();
    expect(decodificar(codificar(borrador))).toEqual(borrador);
  });

  it("el borrador realista no cabía en una cookie, y troceado cabe en cada trozo", () => {
    const codificado = codificar(borradorRealista());

    // Lo que Next escribiría de un JSON a pelo: más de lo que admite el navegador.
    expect(encodeURIComponent(JSON.stringify(borradorRealista())).length).toBeGreaterThan(4096);

    const trozos = trocear(codificado, TROZO_COOKIE_BYTES);
    expect(trozos.length).toBeGreaterThan(1);
    for (const trozo of trozos) {
      expect(trozo.length).toBeLessThanOrEqual(TROZO_COOKIE_BYTES);
      // Y no crece al escribirse: base64url no lleva nada que se escape.
      expect(encodeURIComponent(trozo)).toBe(trozo);
    }
  });

  it("los trozos se unen por nombre y en orden, y un hueco corta", () => {
    const texto = "abcdefghij";
    const trozos = trocear(texto, 4);
    expect(trozos).toEqual(["abcd", "efgh", "ij"]);

    const tarro = new Map(trozos.map((trozo, i) => [nombreDelTrozo("boda:rsvp", i), trozo]));
    expect([...tarro.keys()]).toEqual(["boda:rsvp", "boda:rsvp.1", "boda:rsvp.2"]);
    expect(unirTrozos((nombre) => tarro.get(nombre), "boda:rsvp")).toBe(texto);

    tarro.delete("boda:rsvp.1");
    expect(unirTrozos((nombre) => tarro.get(nombre), "boda:rsvp")).toBe("abcd");
  });

  it("sabe qué trozos sobran de un borrador anterior más largo", () => {
    const nombres = [
      "otra",
      "boda:rsvp",
      "boda:rsvp.1",
      "boda:rsvp.2",
      "boda:rsvp.x",
      "boda:invitacion",
    ];
    expect(trozosSobrantes(nombres, "boda:rsvp", 2)).toEqual(["boda:rsvp.2"]);
    expect(trozosSobrantes(nombres, "boda:rsvp", 1)).toEqual(["boda:rsvp.1", "boda:rsvp.2"]);
    // Para borrar del todo: también el primero.
    expect(trozosSobrantes(nombres, "boda:rsvp", 0)).toEqual([
      "boda:rsvp",
      "boda:rsvp.1",
      "boda:rsvp.2",
    ]);
  });

  it("lee todavía el formato de antes: un JSON sin codificar", () => {
    expect(decodificar('{"token":"x","mensaje":"hola"}')).toEqual({
      token: "x",
      mensaje: "hola",
    });
    expect(decodificar("esto no es nada")).toBeNull();
    expect(trocear("", 10)).toEqual([""]);
  });
});
