import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El CI tiene que ejecutar los tests que existen, no los que existían
 *
 * Este fichero nace de un fallo real y silencioso. El trabajo que levanta el
 * Supabase de verdad —el único donde pueden correr los tests con sesión—
 * enumeraba los specs a mano:
 *
 *     npx playwright test --project=escritorio tests/e2e/acceso-real.spec.ts tests/e2e/panel.spec.ts
 *
 * En cuanto apareció un tercer spec con sesión, quedó fuera de esa lista. Y
 * como fuera de ese trabajo no hay Supabase, ese spec se saltaba solo. Nadie
 * lo ejecutaba nunca, y el módulo entero pasaba por entregado y probado.
 *
 * Lo peor no es que falle: es que sale verde.
 */

const RAIZ = join(__dirname, "..", "..");

describe("flujo de CI", () => {
  const ci = readFileSync(join(RAIZ, ".github/workflows/ci.yml"), "utf8");

  it("no enumera ficheros de test a mano", () => {
    // Una lista de rutas dentro de una invocación de Playwright es una lista
    // que se queda atrás. Se ejecuta la suite y que Playwright decida.
    const invocaciones = [...ci.matchAll(/npx playwright test[^\n]*/g)].map((m) => m[0]);

    expect(
      invocaciones.length,
      "Se esperaba al menos una llamada a Playwright",
    ).toBeGreaterThan(0);

    for (const invocacion of invocaciones) {
      expect(
        invocacion,
        `Este comando nombra specs a mano y se quedará atrás:\n  ${invocacion}\n` +
          "Ejecuta la suite entera, o selecciona por proyecto o por etiqueta.",
      ).not.toMatch(/tests\/e2e\/\S+\.spec\.ts/);
    }
  });

  it("el trabajo con Supabase real sigue existiendo", () => {
    // Si alguien lo quitara, los tests con sesión se saltarían en todas
    // partes y el panel dejaría de estar probado sin que nada se pusiera rojo.
    expect(ci).toContain("supabase start");
    expect(ci).toContain("preparar-acceso-pruebas.sh");
  });
});

/**
 * El despliegue de la base no puede depender de un token que caduca
 *
 * También nace de un fallo real. `SUPABASE_ACCESS_TOKEN` es un token personal
 * y caducó; `supabase link` empezó a responder «Unauthorized» y el flujo de
 * migraciones murió en su primer paso. Dos merges salieron a producción con el
 * esquema viejo detrás, y la web se quedó en la pantalla de respaldo porque el
 * código pedía una columna que todavía no existía.
 *
 * El arreglo fue un camino de repuesto que habla directo con Postgres a través
 * de `DATABASE_URL`, sin token de por medio. Estos tests existen para que nadie
 * lo quite «porque no se usa»: precisamente, si se usa es que algo ya ha ido
 * mal, y ese es el día en que tiene que estar.
 */
describe("el flujo de migraciones tiene camino de repuesto", () => {
  const flujo = readFileSync(join(RAIZ, ".github/workflows/migraciones.yml"), "utf8");

  it("enlazar con el CLI puede fallar sin tumbar el trabajo", () => {
    expect(
      flujo,
      "sin `continue-on-error`, un token caducado vuelve a matar el trabajo en el primer paso",
    ).toMatch(/id:\s*enlace[\s\S]*?continue-on-error:\s*true/);
  });

  it("hay un paso que aplica sin el CLI cuando el enlace falla", () => {
    expect(flujo).toMatch(/steps\.enlace\.outcome == 'failure'/);
    expect(
      flujo,
      "el camino de repuesto usa DATABASE_URL, que es lo que no depende del token",
    ).toContain("DATABASE_URL: ${{ secrets.DATABASE_URL }}");
    expect(flujo).toContain("scripts/aplicar-migraciones.sh");
  });

  it("los pasos del CLI no corren si el enlace no salió bien", () => {
    // Si alguno se quedara sin la condición, correría con el enlace roto y
    // fallaría por un motivo que no es el suyo, tapando el de verdad.
    const conCli = flujo.match(/supabase (migration list|db push)[^\n]*/g) ?? [];
    expect(conCli.length, "se esperan los tres pasos del CLI").toBeGreaterThanOrEqual(3);

    const condicionados = flujo.match(/steps\.enlace\.outcome == 'success'/g) ?? [];
    expect(
      condicionados.length,
      "cada paso que usa el CLI tiene que exigir que el enlace saliera bien",
    ).toBe(3);
  });

  /**
   * FALTABA `DATABASE_URL`, Y ESO PAUSÓ EL PROYECTO.
   *
   * El secreto no existía en el repositorio. El camino de repuesto se quedó sin
   * camino, y —peor— el toque de `mantener-viva.yml`, que usa el mismo secreto,
   * llevaba desde el 1 de septiembre fallando en todas sus ejecuciones: la base
   * no recibía señal de vida y Supabase la suspendió por inactividad.
   *
   * Los dos guiones arman ahora la cadena con `SUPABASE_PROJECT_REF` y
   * `SUPABASE_DB_PASSWORD`, que sí estaban porque el CLI ya los pide. Estos
   * tests impiden que alguien deshaga esa red por «simplificar».
   */
  it("los dos guiones saben armar la cadena si falta DATABASE_URL", () => {
    for (const ruta of [
      "scripts/aplicar-migraciones.sh",
      "scripts/mantener-viva-la-base.mjs",
    ]) {
      const guion = readFileSync(join(RAIZ, ruta), "utf8");

      expect(guion, `${ruta} no mira SUPABASE_PROJECT_REF`).toContain("SUPABASE_PROJECT_REF");
      expect(guion, `${ruta} no mira SUPABASE_DB_PASSWORD`).toContain("SUPABASE_DB_PASSWORD");
      expect(guion, `${ruta} arma la cadena sin el host directo de Supabase`).toContain(
        "supabase.co",
      );
      expect(
        guion,
        `${ruta} no escapa la contraseña, y una con @ o : parte la URL en dos`,
      ).toMatch(/encodeURIComponent|urllib\.parse\.quote/);
    }
  });

  it("los dos flujos les pasan esos secretos a sus guiones", () => {
    for (const ruta of [
      ".github/workflows/migraciones.yml",
      ".github/workflows/mantener-viva.yml",
    ]) {
      const flujo = readFileSync(join(RAIZ, ruta), "utf8");

      expect(flujo, `${ruta} no pasa SUPABASE_DB_PASSWORD al guion`).toContain(
        "SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}",
      );
      expect(flujo, `${ruta} no pasa el identificador del proyecto`).toMatch(
        /SUPABASE_PROJECT_REF: \$\{\{ vars\.SUPABASE_PROJECT_REF \|\| secrets\.SUPABASE_PROJECT_REF \}\}/,
      );
    }
  });

  it("el aplicador de repuesto existe y se planta si hay demasiadas pendientes", () => {
    const guion = readFileSync(join(RAIZ, "scripts/aplicar-migraciones.sh"), "utf8");

    expect(guion).toContain("MAXIMO_PENDIENTES");
    expect(
      guion,
      "sin el tope, una tabla de control ilegible haría rehacer el esquema entero sobre datos reales",
    ).toMatch(/ABORTADO/);
    expect(guion, "y tiene que quedar una salida para el caso legítimo").toContain("FORZAR");
  });
});
