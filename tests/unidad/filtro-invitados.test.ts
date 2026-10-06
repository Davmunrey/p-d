import { describe, expect, it } from "vitest";

import type { GrupoInvitacion } from "@/lib/bbdd/invitados";
import { filtrarGrupos, leerFiltros, ordenarGrupos } from "@/lib/filtro-invitados";

/**
 * EL FILTRO Y EL ORDEN DE LA LISTA DE INVITACIONES, que comparten la pantalla y
 * la descarga: lo que se prueba aquí es lo que acaba en los dos sitios.
 */

function grupo(campos: Partial<GrupoInvitacion> & { nombre: string }): GrupoInvitacion {
  return {
    id: campos.nombre,
    lado: "ambos",
    maximoAcompanantes: 0,
    tokenEmitidoEn: null,
    invitacionEnviadaEn: null,
    recordatorioEnviadoEn: null,
    personas: 1,
    confirmados: 0,
    rechazados: 0,
    pendientes: 1,
    nombresPersonas: [],
    ...campos,
  };
}

const ALBA = grupo({
  nombre: "Alba",
  lado: "novia",
  personas: 2,
  pendientes: 0,
  confirmados: 2,
});
const ÑAKI = grupo({
  nombre: "Ñaki",
  lado: "novio",
  personas: 4,
  pendientes: 3,
  maximoAcompanantes: 1,
});
const ÉLIA = grupo({
  nombre: "Élia",
  lado: "novio",
  personas: 1,
  pendientes: 1,
  invitacionEnviadaEn: new Date("2026-09-01"),
});
const TODOS = [ÑAKI, ÉLIA, ALBA];

const nombres = (grupos: GrupoInvitacion[]) => grupos.map((g) => g.nombre);

describe("leerFiltros", () => {
  it("sin nada en la URL, todo y por nombre", () => {
    expect(leerFiltros(() => null)).toEqual({
      busqueda: "",
      estado: "todos",
      lado: "todos",
      acompanantes: "todas",
      orden: "nombre",
    });
  });

  it("un valor que no existe cae al de siempre en vez de romper la página", () => {
    const valores: Record<string, string> = { lado_filtro: "suegra", orden: "constructor" };
    const filtros = leerFiltros((clave) => valores[clave] ?? null);
    expect(filtros.lado).toBe("todos");
    expect(filtros.orden).toBe("nombre");
  });
});

describe("filtrarGrupos", () => {
  const base = { busqueda: "", estado: "todos" as const };

  it("por lado", () => {
    expect(nombres(filtrarGrupos(TODOS, { ...base, lado: "novio" }))).toEqual(["Ñaki", "Élia"]);
  });

  it("por acompañantes, en los dos sentidos", () => {
    expect(nombres(filtrarGrupos(TODOS, { ...base, acompanantes: "con" }))).toEqual(["Ñaki"]);
    expect(nombres(filtrarGrupos(TODOS, { ...base, acompanantes: "sin" }))).toEqual([
      "Élia",
      "Alba",
    ]);
  });

  it("los filtros se combinan", () => {
    expect(
      nombres(
        filtrarGrupos(TODOS, {
          ...base,
          estado: "sin-contestar",
          lado: "novio",
          acompanantes: "sin",
        }),
      ),
    ).toEqual(["Élia"]);
  });
});

describe("ordenarGrupos", () => {
  it("por nombre, como se ordena en castellano: la Ñ tras la N, la É con la E", () => {
    expect(nombres(ordenarGrupos(TODOS, "nombre"))).toEqual(["Alba", "Élia", "Ñaki"]);
  });

  it("más por contestar primero", () => {
    expect(nombres(ordenarGrupos(TODOS, "sin-contestar"))).toEqual(["Ñaki", "Élia", "Alba"]);
  });

  it("más personas primero", () => {
    expect(nombres(ordenarGrupos(TODOS, "personas"))).toEqual(["Ñaki", "Alba", "Élia"]);
  });

  it("sin enviar primero, y entre ellos por nombre", () => {
    expect(nombres(ordenarGrupos(TODOS, "envio"))).toEqual(["Alba", "Ñaki", "Élia"]);
  });

  it("no toca la lista que recibe", () => {
    const copia = [...TODOS];
    ordenarGrupos(TODOS, "personas");
    expect(TODOS).toEqual(copia);
  });
});
