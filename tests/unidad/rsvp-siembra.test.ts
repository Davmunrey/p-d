import { describe, expect, it } from "vitest";

import type { PersonaInvitada } from "../../src/lib/bbdd/rsvp";
import { faltanDeLaUrl, faltanEnLaUrl } from "../../src/lib/rsvp-ancla";
import type { Borrador } from "../../src/lib/rsvp-borrador";
import { sembrarDesdeLaBase } from "../../src/lib/rsvp-siembra";

const vacio = (): Borrador => ({
  token: "t",
  asistencia: {},
  menu: {},
  alergias: {},
  autobus: {},
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
  ...extra,
});

describe("sembrarDesdeLaBase", () => {
  it("una familia que ya contestó recupera su asistencia, su menú, sus alergias y su autobús", () => {
    const familia = [
      persona("ana", {
        estado: "confirmado",
        necesitaAutobus: true,
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
      alergias: { ana: "" },
    };
    const sembrado = sembrarDesdeLaBase(escrito, [
      persona("ana", { estado: "confirmado", necesitaAutobus: true, alergias: "Lactosa" }),
    ]);
    expect(sembrado.asistencia.ana).toBe("rechazado");
    expect(sembrado.autobus.ana).toBe(false);
    expect(sembrado.alergias.ana).toBe("");
  });

  it("un borrador ya sembrado no se vuelve a sembrar: una alergia borrada a propósito no resucita", () => {
    const yaSembrado: Borrador = { ...vacio(), sembrado: true };
    const resultado = sembrarDesdeLaBase(yaSembrado, [
      persona("ana", { estado: "confirmado", alergias: "Lactosa" }),
    ]);
    expect(resultado.alergias.ana).toBeUndefined();
    expect(resultado).toBe(yaSembrado);
  });

  it("no toca el borrador que recibe", () => {
    const original = vacio();
    sembrarDesdeLaBase(original, [persona("ana", { estado: "confirmado" })]);
    expect(original.asistencia).toEqual({});
    expect(original.sembrado).toBeUndefined();
  });
});

describe("las personas que faltan, en la URL", () => {
  it("van y vuelven iguales", () => {
    const ids = ["0b1c-uno", "9f2e-dos"];
    expect([...faltanDeLaUrl(faltanEnLaUrl(ids))]).toEqual(ids);
  });

  it("una lista vacía o con comas de más no inventa a nadie", () => {
    expect(faltanDeLaUrl("").size).toBe(0);
    expect([...faltanDeLaUrl(",uno,,")]).toEqual(["uno"]);
  });
});
