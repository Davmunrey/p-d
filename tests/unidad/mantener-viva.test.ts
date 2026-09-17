import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

// El guion está en JavaScript y no trae tipos: TypeScript lo infiere solo.
import { diagnosticoDeConexion } from "../../scripts/diagnostico-conexion.mjs";

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

  /**
   * EL AVISO TIENE QUE SEÑALAR AL SITIO BUENO. Durante dos semanas el flujo
   * falló diciendo «lo más probable es que Supabase lo haya pausado» encima de
   * un `ENETUNREACH 2a05:d014:…`: el proyecto estaba despierto y lo que fallaba
   * era que `DATABASE_URL` apuntaba a la conexión directa, que es IPv6, desde
   * un runner que sólo tiene IPv4. Un aviso que manda a mirar donde no es
   * cuesta más que no tener aviso.
   *
   * Se prueba la función y no el guion entero a propósito: si esto dependiera
   * de intentar una conexión IPv6 de verdad, el resultado cambiaría según la
   * máquina que corriera los tests.
   */
  it("un fallo de red no se confunde con un proyecto pausado", () => {
    const deRed = Object.assign(new Error("connect ENETUNREACH 2a05:d014::1:5432"), {
      code: "ENETUNREACH",
    });

    expect(diagnosticoDeConexion(deRed)).toContain("Session pooler");
    expect(diagnosticoDeConexion(deRed)).not.toContain("pausado");
  });

  it("y cualquier otro fallo sigue apuntando a la pausa, que es lo habitual", () => {
    const otro = new Error("terminating connection due to administrator command");

    expect(diagnosticoDeConexion(otro)).toContain("pausado");
    expect(diagnosticoDeConexion(otro)).not.toContain("Session pooler");
  });

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
