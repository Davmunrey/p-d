import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SECCIONES, anclaDe, esAncla, esSeccionConocida } from "@/config/secciones";

/**
 * BODA-20 · La lista de secciones de TypeScript y la de SQL no pueden divergir
 *
 * Este test existe por un fallo real. La landing llevaba meses pintando el
 * programa del día y la playlist, y el enumerado `seccion_landing` no las
 * conocía: no había forma de enseñarlas en el menú ni de apagarlas desde el
 * panel, y nada avisaba. El fallo solo salió al cablear la navegación.
 *
 * Se compara contra el SQL y no contra la base de datos a propósito: así el
 * guardián funciona sin levantar PostgreSQL, y falla en el momento exacto en
 * que alguien añade un valor en un sitio y se olvida del otro.
 */

const RAIZ = join(__dirname, "..", "..");
const MIGRACIONES = join(RAIZ, "supabase", "migrations");

/** Todos los valores del enumerado, tal y como quedan tras las migraciones. */
function valoresDelEnumeradoSql(): string[] {
  const ficheros = readdirSync(MIGRACIONES)
    .filter((nombre) => nombre.endsWith(".sql"))
    .sort();

  const valores: string[] = [];

  for (const fichero of ficheros) {
    const sql = readFileSync(join(MIGRACIONES, fichero), "utf8").replace(/--[^\n]*/g, "");

    // Creación: asegurar_enum('seccion_landing', array['a', 'b', …])
    const creacion = sql.match(
      /asegurar_enum\(\s*'seccion_landing'\s*,\s*array\s*\[([\s\S]*?)\]/i,
    );
    if (creacion) {
      for (const cita of creacion[1].matchAll(/'([^']+)'/g)) valores.push(cita[1]);
    }

    // Ampliación: alter type public.seccion_landing add value … 'x'
    for (const alta of sql.matchAll(
      /alter\s+type\s+public\.seccion_landing\s+add\s+value[^;]*?'([^']+)'/gi,
    )) {
      valores.push(alta[1]);
    }
  }

  return valores;
}

describe("Secciones de la landing", () => {
  const enSql = valoresDelEnumeradoSql();

  it("el SQL declara secciones (si no, el test se estaría engañando solo)", () => {
    expect(enSql.length).toBeGreaterThan(0);
  });

  it("TypeScript conoce exactamente las mismas que SQL", () => {
    expect([...SECCIONES].sort()).toEqual([...enSql].sort());
  });

  it("ninguna sección está declarada dos veces en SQL", () => {
    expect(new Set(enSql).size).toBe(enSql.length);
  });

  it("el ancla de cada sección es un identificador válido para una URL", () => {
    for (const seccion of SECCIONES) {
      expect(anclaDe(seccion)).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("las anclas no se repiten entre secciones distintas", () => {
    const anclas = SECCIONES.map(anclaDe);
    expect(new Set(anclas).size).toBe(anclas.length);
  });

  it("la reserva de fecha es una página aparte, no un ancla de la landing", () => {
    expect(esAncla("reserva_la_fecha")).toBe(false);
    expect(esAncla("portada")).toBe(true);
  });

  it("un valor que no existe no se reconoce como sección", () => {
    expect(esSeccionConocida("seccion_inventada")).toBe(false);
    expect(esSeccionConocida("portada")).toBe(true);
  });
});
