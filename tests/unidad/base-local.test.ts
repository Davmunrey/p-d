import { describe, expect, it } from "vitest";

import { esBaseLocal, exigirBaseLocal } from "../e2e/utiles/base-local";

describe("los E2E sólo hablan con una base local", () => {
  it("acepta las de esta máquina, como las levanta el CI", () => {
    expect(esBaseLocal("postgresql://postgres:clave@127.0.0.1:5433/boda_desarrollo")).toBe(
      true,
    );
    expect(esBaseLocal("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(true);
    expect(esBaseLocal("postgres://yo@localhost/boda")).toBe(true);
  });

  it("rechaza la de producción y lo que no se entiende", () => {
    expect(
      esBaseLocal(
        "postgresql://postgres.abc:clave@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
      ),
    ).toBe(false);
    expect(esBaseLocal("postgresql://postgres@db.abc.supabase.co:5432/postgres")).toBe(false);
    expect(esBaseLocal("no es una cadena")).toBe(false);
    // Un subdominio que EMPIEZA por localhost no es esta máquina.
    expect(esBaseLocal("postgresql://u@localhost.ejemplo.com/boda")).toBe(false);
  });

  it("sin DATABASE_URL no lanza: los specs que la necesitan se saltan solos", () => {
    expect(() => exigirBaseLocal(undefined)).not.toThrow();
    expect(() => exigirBaseLocal("postgresql://u@db.abc.supabase.co/postgres")).toThrow(
      /no está en esta máquina/,
    );
  });
});
