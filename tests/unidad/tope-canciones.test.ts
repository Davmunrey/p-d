import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TOPE_CANCIONES_POR_GRUPO } from "@/config/constants";

/**
 * EL TOPE DE CANCIONES LO PONE LA BASE Y LO ENSEÑA EL PANEL. Son dos números
 * en dos sitios, así que se comprueba que dicen lo mismo: la última migración
 * que define `sugerir_cancion()` es la que manda.
 */
describe("el tope de canciones por grupo", () => {
  it("es el mismo en la base y en el panel", () => {
    const carpeta = join(__dirname, "../../supabase/migrations");
    const ultima = readdirSync(carpeta)
      .filter((fichero) => fichero.endsWith(".sql"))
      .sort()
      .map((fichero) => readFileSync(join(carpeta, fichero), "utf8"))
      .filter((sql) => /function public\.sugerir_cancion\s*\(/.test(sql))
      .at(-1);

    expect(ultima, "alguna migración tiene que definir sugerir_cancion()").toBeDefined();
    const tope = ultima!.match(/v_cuantas\s*>=\s*(\d+)/)?.[1];
    expect(Number(tope)).toBe(TOPE_CANCIONES_POR_GRUPO);
  });
});
