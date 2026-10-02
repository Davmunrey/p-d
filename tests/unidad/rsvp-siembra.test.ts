import { describe, expect, it } from "vitest";

import type { PersonaInvitada } from "../../src/lib/bbdd/rsvp";
import type { Borrador } from "../../src/lib/rsvp-borrador";
import { sembrarDesdeLaBase } from "../../src/lib/rsvp-siembra";

const vacio = (): Borrador => ({
  token: "t",
  asistencia: {},
  menu: {},
  alergias: {},
  autobus: {},
  cancion: "",
  mensaje: "",
});

const persona = (id: string, extra: Partial<PersonaInvitada> = {}): PersonaInvitada => ({
  id,
  nombre: id,
  apellidos: null,
  esNino: false,
  esAcompanante: false,
  tipoMenu: "estandar",
  alergias: null,
  estado: null,
  respondidoEn: null,
  necesitaAutobus: null,
  cancionSolicitada: null,
  mensaje: null,
  ...extra,
});

describe("sembrarDesdeLaBase", () => {
  it("una familia que ya contestó recupera su autobús, su canción y su mensaje", () => {
    const familia = [
      persona("ana", {
        estado: "confirmado",
        necesitaAutobus: true,
        cancionSolicitada: "Una canción",
        mensaje: "Allí estaremos",
        tipoMenu: "vegetariano",
        alergias: "Celíaca",
      }),
      persona("luis", { estado: "rechazado" }),
    ];

    const sembrado = sembrarDesdeLaBase(vacio(), familia);

    expect(sembrado.asistencia).toEqual({ ana: "confirmado", luis: "rechazado" });
    expect(sembrado.autobus.ana).toBe(true);
    expect(sembrado.menu.ana).toBe("vegetariano");
    expect(sembrado.alergias.ana).toBe("Celíaca");
    expect(sembrado.cancion).toBe("Una canción");
    expect(sembrado.mensaje).toBe("Allí estaremos");
    expect(sembrado.sembrado).toBe(true);
  });

  it("la persona nueva, que nunca contestó, sigue sin marcar", () => {
    const sembrado = sembrarDesdeLaBase(vacio(), [
      persona("ana", { estado: "confirmado" }),
      persona("nueva", { estado: "pendiente" }),
    ]);
    expect(sembrado.asistencia.nueva).toBeUndefined();
    expect(sembrado.autobus.nueva).toBeUndefined();
  });

  it("lo que el invitado ya escribió manda sobre la base", () => {
    const escrito: Borrador = {
      ...vacio(),
      asistencia: { ana: "rechazado" },
      autobus: { ana: false },
      mensaje: "Otro mensaje",
    };
    const sembrado = sembrarDesdeLaBase(escrito, [
      persona("ana", { estado: "confirmado", necesitaAutobus: true, mensaje: "El de antes" }),
    ]);
    expect(sembrado.asistencia.ana).toBe("rechazado");
    expect(sembrado.autobus.ana).toBe(false);
    expect(sembrado.mensaje).toBe("Otro mensaje");
  });

  it("un borrador ya sembrado no se vuelve a sembrar: un mensaje borrado a propósito no resucita", () => {
    const yaSembrado: Borrador = { ...vacio(), sembrado: true, mensaje: "" };
    const resultado = sembrarDesdeLaBase(yaSembrado, [
      persona("ana", { estado: "confirmado", mensaje: "El de antes" }),
    ]);
    expect(resultado.mensaje).toBe("");
    expect(resultado).toBe(yaSembrado);
  });

  it("no toca el borrador que recibe", () => {
    const original = vacio();
    sembrarDesdeLaBase(original, [persona("ana", { estado: "confirmado" })]);
    expect(original.asistencia).toEqual({});
    expect(original.sembrado).toBeUndefined();
  });
});
