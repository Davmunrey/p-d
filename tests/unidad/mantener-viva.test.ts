import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

/**
 * BODA-95 · El toque a la base tiene que fallar cuando la base no está
 *
 * Lo importante de este flujo no es que funcione: es que **se entere alguien
 * cuando no funciona**. Si el proyecto ya está pausado y el script sale con
 * cero, el flujo aparece en verde y nadie mira — que es lo mismo que no tener
 * flujo, sólo que con la falsa tranquilidad de creer que se vigila.
 *
 * Por eso el caso de error se prueba SIEMPRE, sin base de datos: apuntando a
 * un puerto cerrado. El camino feliz necesita una base de verdad y se salta
 * donde no la hay.
 */

const ejecutar = promisify(execFile);
const GUION = join(__dirname, "..", "..", "scripts", "mantener-viva-la-base.mjs");

interface Resultado {
  codigo: number;
  salida: string;
}

async function correr(entorno: Record<string, string>): Promise<Resultado> {
  try {
    const { stdout, stderr } = await ejecutar("node", [GUION], {
      env: { ...process.env, ...entorno },
      timeout: 30_000,
    });
    return { codigo: 0, salida: `${stdout}${stderr}` };
  } catch (error) {
    const fallo = error as { code?: number; stdout?: string; stderr?: string };
    return { codigo: fallo.code ?? 1, salida: `${fallo.stdout ?? ""}${fallo.stderr ?? ""}` };
  }
}

describe("El toque que mantiene viva la base", () => {
  it("con la base inalcanzable, falla y dice que puede estar pausada", async () => {
    // Un puerto cerrado: la conexión falla de verdad, no simulada.
    const resultado = await correr({
      DATABASE_URL: "postgres://nadie:nada@127.0.0.1:1/vacio",
    });

    expect(resultado.codigo, "un fallo en verde es no tener vigilancia").not.toBe(0);
    expect(resultado.salida).toContain("pausado");
  }, 40_000);

  it("sin DATABASE_URL tampoco pasa en verde", async () => {
    const resultado = await correr({ DATABASE_URL: "" });

    expect(resultado.codigo).not.toBe(0);
    expect(resultado.salida).toContain("DATABASE_URL");
  }, 40_000);

  it.skipIf(!process.env.DATABASE_URL)(
    "contra la base real, dice que está despierta",
    async () => {
      const resultado = await correr({ DATABASE_URL: process.env.DATABASE_URL! });

      expect(resultado.codigo, resultado.salida).toBe(0);
      expect(resultado.salida).toContain("despierta");
    },
    40_000,
  );
});
