import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * BODA-07 · EL PLAN MAESTRO NO PUEDE CITAR LO QUE NO EXISTE
 *
 * El §5 se escribió antes de construir la base y nunca se actualizó: describía
 * treinta tablas con nombres en inglés que en la base real están en castellano.
 * No era cosmético. Es el documento que lee todo el que coge un ticket, así que
 * un ticket que dijera «lee `guest_groups.invite_token`» mandaba a buscar una
 * tabla que no existe — y una columna que **nunca** existió, porque el token no
 * se guarda en claro.
 *
 * Este test es lo que impide que vuelva a separarse: saca los nombres de objetos
 * de base de datos citados en el documento y comprueba que las migraciones los
 * crean. Citar una tabla inventada pone el CI en rojo el mismo día, no seis
 * meses después.
 */

const RAIZ = join(__dirname, "..", "..");

const plan = readFileSync(join(RAIZ, "docs", "PLAN-MAESTRO.md"), "utf8");

/** Todo el SQL de las migraciones, junto: es la única verdad del esquema. */
const sql = readdirSync(join(RAIZ, "supabase", "migrations"))
  .filter((fichero) => fichero.endsWith(".sql"))
  .map((fichero) => readFileSync(join(RAIZ, "supabase", "migrations", fichero), "utf8"))
  .join("\n");

/**
 * Los nombres citados en negrita-código —**`tabla`**— son la forma en que el
 * §5 presenta cada objeto. Se buscan sólo esos y no cualquier `código`: el
 * documento menciona columnas, valores de enumerado y trozos de SQL, y
 * comprobarlos todos convertiría el test en un adivino.
 */
function objetosCitados(): string[] {
  const citados = [...plan.matchAll(/\*\*`([a-z_]+)`\*\*/g)].map(
    (coincidencia) => coincidencia[1],
  );
  return [...new Set(citados)];
}

/** Las funciones se citan con paréntesis: **`obtener_invitacion(token)`**. */
function funcionesCitadas(): string[] {
  const citadas = [...plan.matchAll(/\*\*`([a-z_]+)\([^`]*\)`\*\*/g)].map(
    (coincidencia) => coincidencia[1],
  );
  return [...new Set(citadas)];
}

describe("El plan maestro describe la base de datos que existe", () => {
  it("cita al menos las tablas y vistas principales", () => {
    // Si esto baja de golpe, alguien ha vaciado el §5 en lugar de corregirlo.
    expect(objetosCitados().length).toBeGreaterThan(20);
  });

  it("cada tabla o vista citada existe en las migraciones", () => {
    const inventadas = objetosCitados().filter((objeto) => {
      const creada = new RegExp(
        `create (table if not exists|table|or replace view|view) public\\.${objeto}\\b`,
      );
      return !creada.test(sql);
    });

    expect(
      inventadas,
      "el plan cita objetos que no crea ninguna migración: corrige el §5",
    ).toEqual([]);
  });

  it("cada función citada existe en las migraciones", () => {
    const inventadas = funcionesCitadas().filter((funcion) => {
      return !new RegExp(`create or replace function public\\.${funcion}\\b`).test(sql);
    });

    expect(inventadas, "el plan cita funciones que no existen").toEqual([]);
  });

  /**
   * REGLA 2 · Nada de nombres de base de datos en inglés.
   *
   * La lista es de los nombres que el documento traía de verdad, no un
   * diccionario: comprobar contra «cualquier palabra inglesa» daría falsos
   * positivos con `storage`, `id` o `uuid`, que sí son correctos.
   */
  it("no queda ni una referencia en inglés a un objeto de la base", () => {
    const ANTIGUOS = [
      "guest_groups",
      "guests",
      "rsvps",
      "invite_token",
      "vendors",
      "vendor_categories",
      "vendor_documents",
      "budget_items",
      "budget_categories",
      "payments",
      "tasks",
      "activity_log",
      "wedding_settings",
      "v_budget_summary",
      "v_guest_stats",
      "get_invitation",
      "submit_rsvp",
    ];

    const supervivientes = ANTIGUOS.filter((nombre) =>
      new RegExp(`\`[^\`]*\\b${nombre}\\b[^\`]*\``).test(plan),
    );

    expect(supervivientes, "regla 2: los nombres de la base van en castellano").toEqual([]);
  });

  it("explica lo que el esquema hace y el plan antiguo no contaba", () => {
    // Las tres cosas que un ticket mal escrito daba por supuestas.
    expect(plan, "falta explicar que el token va hasheado").toContain("huella_token");
    expect(plan, "falta el arranque en frío").toContain("designar_primer_propietario");
    expect(plan, "falta por qué anon lee la landing").toMatch(/anon/);
  });
});
