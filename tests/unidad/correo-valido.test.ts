import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FORMA_CORREO } from "@/config/constants";
import { esCorreoValido } from "@/lib/correo-valido";

/**
 * EL CORREO SE COMPRUEBA ANTES DE ESCRIBIR, CON LA MISMA REGLA QUE LA BASE
 *
 * Cinco tablas guardan correo y todas lo pasan por `es_correo_valido()` en un
 * CHECK. El navegador, con `type="email"`, da por bueno «info@fincalasierra»,
 * que la base rechaza: el aviso era «no se ha podido guardar» y el alta de un
 * proveedor volvía con el formulario vacío. Ahora se dice antes, y se dice cuál.
 *
 * Y LA REGLA ES UNA COPIA, así que se contrasta con el original.
 */

const RAIZ = join(__dirname, "..", "..");

describe("esCorreoValido", () => {
  it("acepta un correo de los de siempre", () => {
    for (const bueno of [
      "ana@ejemplo.es",
      "info@finca-la-sierra.com",
      "nombre.apellido+boda@correo.ejemplo.org",
      "  ana@ejemplo.es  ",
    ]) {
      expect(esCorreoValido(bueno), bueno).toBe(true);
    }
  });

  it("rechaza lo que el navegador deja pasar y la base no", () => {
    // Sin punto en el dominio: válido para `type="email"`, no para la base.
    expect(esCorreoValido("info@fincalasierra")).toBe(false);
    // Un solo carácter tras el punto.
    expect(esCorreoValido("a@b.c")).toBe(false);
  });

  it("rechaza lo que no es un correo", () => {
    for (const malo of ["ana", "ana@", "@ejemplo.es", "ana @ejemplo.es", "ana@@ejemplo.es"]) {
      expect(esCorreoValido(malo), malo).toBe(false);
    }
  });
});

describe("la forma del correo es la de la base", () => {
  it("FORMA_CORREO es la expresión de es_correo_valido(), con \\s por [:space:]", () => {
    const sql = readFileSync(
      join(RAIZ, "supabase", "migrations", "20260803090000_base.sql"),
      "utf8",
    );
    const enBase = sql.match(/p_correo ~ '([^']+)'/);

    expect(enBase, "la migración base ya no declara la forma del correo").not.toBeNull();
    expect(enBase![1].replaceAll("[:space:]", "\\s")).toBe(FORMA_CORREO.source);
  });

  it("ninguna migración posterior redefine es_correo_valido", () => {
    const carpeta = join(RAIZ, "supabase", "migrations");
    const redefinida = readdirSync(carpeta)
      .filter((fichero) => fichero.endsWith(".sql"))
      .filter(
        (fichero) =>
          fichero !== "20260803090000_base.sql" &&
          /function public\.es_correo_valido/.test(
            readFileSync(join(carpeta, fichero), "utf8"),
          ),
      );
    expect(redefinida, "si cambia la regla, hay que cambiar FORMA_CORREO").toEqual([]);
  });
});
