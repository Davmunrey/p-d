import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * EL DOCUMENTO DEL ESQUEMA HABLA DE TODAS LAS TABLAS, NO DE LAS QUE HABÍA
 *
 * `docs/MODELO-DATOS.md` se presenta como documento vivo —«cualquier cambio de
 * esquema se documenta en la misma PR que lo introduce»— y se había quedado
 * atrás sin que nada lo dijera: describía veinticuatro tablas cuando ya había
 * treinta y siete, y abría con una línea de cifras que llevaba trece tablas
 * equivocada. Un documento con esa promesa escrita y sin nada que la sostenga
 * es peor que uno sin promesa, porque se lee como si estuviera al día.
 *
 * El otro lado —que no cite tablas inventadas— ya lo comprueba
 * `plan-maestro.test.ts` para el plan. Éste mira en la dirección que faltaba:
 * de la base al documento.
 *
 * LAS CIFRAS NO SE MIRAN AQUÍ, porque no se pueden contar leyendo el SQL: los
 * enumerados y parte de las políticas se crean con `execute format(...)` dentro
 * de un bucle, así que contar `create type` da cero. Las cuenta
 * `scripts/probar-bbdd.sh` contra la base recién migrada, que es el único sitio
 * donde el número es un hecho y no una estimación.
 */

const RAIZ = join(__dirname, "..", "..");
const MIGRACIONES = join(RAIZ, "supabase", "migrations");

const sql = readdirSync(MIGRACIONES)
  .filter((fichero) => fichero.endsWith(".sql"))
  .sort()
  .map((fichero) => readFileSync(join(MIGRACIONES, fichero), "utf8"))
  .join("\n");

const doc = readFileSync(join(RAIZ, "docs", "MODELO-DATOS.md"), "utf8");

/** Las tablas que crea alguna migración, por su nombre. */
function tablasDelEsquema(): string[] {
  const creadas = [
    ...sql.matchAll(/create table(?: if not exists)?\s+public\.([a-z_]+)/gi),
  ].map((encontrada) => encontrada[1]);
  const borradas = new Set(
    [...sql.matchAll(/drop table(?: if exists)?\s+public\.([a-z_]+)/gi)].map((m) => m[1]),
  );

  return [...new Set(creadas)].filter((tabla) => !borradas.has(tabla)).sort();
}

describe("docs/MODELO-DATOS.md", () => {
  const tablas = tablasDelEsquema();

  it("hay tablas que comprobar", () => {
    expect(tablas.length).toBeGreaterThanOrEqual(35);
  });

  it("cita todas las tablas del esquema", () => {
    const sinContar = tablas.filter((tabla) => !doc.includes(`\`${tabla}\``));

    expect(
      sinContar,
      "una tabla nueva se documenta en la misma PR que la trae, como dice su cabecera",
    ).toEqual([]);
  });

  it("sigue prometiendo que se documenta en la misma PR", () => {
    // Si alguien quita la promesa, que sea a propósito y no de pasada.
    expect(doc).toContain("en la misma PR");
  });

  it("detecta de verdad una tabla sin citar", () => {
    const inventada = ["tabla", "que", "nadie", "documenta"].join("_");
    expect(doc.includes(`\`${inventada}\``)).toBe(false);
  });
});
