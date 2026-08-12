import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * LA VERSIÓN DE UNA MIGRACIÓN ES SU CLAVE PRIMARIA, Y NO SE PUEDE REPETIR
 *
 * Esto nace de un despliegue parado. Dos módulos escritos a la vez pusieron el
 * mismo sello —`20260812090000`— en sus migraciones, y el CI cayó con:
 *
 *     ERROR: duplicate key value violates unique constraint
 *            "schema_migrations_pkey"
 *     Key (version)=(20260812090000) already exists.
 *
 * Supabase guarda las migraciones aplicadas en `supabase_migrations.
 * schema_migrations`, cuya clave primaria es el número de delante del nombre.
 * Dos ficheros con el mismo número son dos filas con la misma clave: la
 * segunda no entra y la base se queda a medias.
 *
 * Y NO SE VE EN LOCAL. `scripts/probar-bbdd.sh` aplica los ficheros en orden
 * alfabético contra un PostgreSQL pelado, sin esa tabla, así que las dos pasan
 * tan tranquilas. El fallo sólo aparece contra un Supabase de verdad — es
 * decir, después de subir.
 *
 * Este test lo pone donde tiene que estar: en el portátil, en un segundo.
 */

const CARPETA = join(__dirname, "..", "..", "supabase", "migrations");

/** `20260812090100_documentos_boda.sql` → `20260812090100`. */
function version(fichero: string): string {
  return fichero.split("_")[0];
}

const migraciones = readdirSync(CARPETA)
  .filter((fichero) => fichero.endsWith(".sql"))
  .sort();

describe("las migraciones", () => {
  it("hay migraciones que comprobar", () => {
    expect(migraciones.length).toBeGreaterThan(0);
  });

  it("no repiten versión", () => {
    const porVersion = new Map<string, string[]>();
    for (const fichero of migraciones) {
      const clave = version(fichero);
      porVersion.set(clave, [...(porVersion.get(clave) ?? []), fichero]);
    }

    const repetidas = [...porVersion.entries()].filter(([, ficheros]) => ficheros.length > 1);

    expect(
      repetidas.map(([clave, ficheros]) => `${clave}: ${ficheros.join(", ")}`),
      "Dos migraciones con el mismo sello son dos filas con la misma clave " +
        "primaria en `schema_migrations`: la segunda no entra y el despliegue " +
        "se para. Cámbiale el sello a una de ellas.",
    ).toEqual([]);
  });

  it("empiezan por un sello con forma de fecha y hora", () => {
    const malFormadas = migraciones.filter(
      (fichero) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(fichero),
    );

    expect(
      malFormadas,
      "Una migración se llama `AAAAMMDDHHMMSS_asunto_en_castellano.sql`: el " +
        "sello ordena la aplicación y es la clave con la que Supabase la anota.",
    ).toEqual([]);
  });

  /**
   * TODA MIGRACIÓN TRAE SU DESHACER, y lo dice la regla del proyecto: «toda
   * migración de BBDD entra por PR con su SQL de rollback». Sin él, deshacer
   * un despliegue a las tres de la mañana es escribir SQL a mano contra la
   * base de la boda.
   */
  it("todas tienen su rollback, con el mismo nombre", () => {
    const rollbacks = new Set(readdirSync(join(CARPETA, "rollback")));
    const huerfanas = migraciones.filter((fichero) => !rollbacks.has(fichero));

    expect(
      huerfanas,
      "Estas migraciones no tienen su fichero en `supabase/migrations/rollback/`:",
    ).toEqual([]);
  });

  /**
   * Y AL REVÉS: un rollback sin su migración es un fichero que alguien dejó
   * atrás al renombrar. Deshacer algo que ya no existe no es peligroso, pero
   * leerlo despista a quien busca qué hace cada cosa.
   */
  it("no hay rollbacks huérfanos", () => {
    const nombres = new Set(migraciones);
    const sobrantes = readdirSync(join(CARPETA, "rollback")).filter(
      (fichero) => fichero.endsWith(".sql") && !nombres.has(fichero),
    );

    expect(sobrantes, "Estos rollbacks no corresponden a ninguna migración:").toEqual([]);
  });

  /**
   * El nombre que la migración dice tener por dentro tiene que ser el suyo.
   * Al renombrar una por una colisión de sello, la cabecera y la línea de
   * `Rollback:` se quedan apuntando al nombre viejo — y esa cabecera es lo
   * primero que lee quien la abre dentro de seis meses.
   */
  it("se nombran por dentro como se llaman por fuera", () => {
    const mentirosas = migraciones.filter((fichero) => {
      const sql = readFileSync(join(CARPETA, fichero), "utf8");
      const citados = sql.match(/\d{14}_[a-z0-9_]+\.sql/g) ?? [];
      return citados.some(
        (citado) => version(citado) === version(fichero) && citado !== fichero,
      );
    });

    expect(
      mentirosas,
      "Estas migraciones se citan a sí mismas con otro nombre (¿se renombraron?):",
    ).toEqual([]);
  });
});
