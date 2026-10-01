import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * LOS FLUJOS DE GITHUB SE PUEDEN LEER.
 *
 * Un YAML roto no falla en rojo: GitHub lo rechaza nada más leerlo y deja un
 * run de cero segundos con el nombre del fichero por título, que nadie mira.
 * Así estuvieron once días la copia nocturna y el toque a Supabase: un salto
 * de línea literal dentro de un `--body "…"` en un bloque `run: |`, con menos
 * sangría que el bloque, lo cortaba, y el resto («Registro: …», `fi`) se
 * convertía en claves sueltas del documento. El YAML seguía siendo YAML
 * válido; lo que no era, era un flujo.
 *
 * Aquí se comprueba lo que GitHub comprueba: sólo claves conocidas en la
 * raíz, cada trabajo con `runs-on` y pasos, cada paso con `uses` o `run` (uno
 * de los dos), y cada guion de shell con sus `if` cerrados.
 */
const CARPETA = join(__dirname, "..", "..", ".github", "workflows");
const CLAVES_RAIZ = new Set([
  "name",
  "on",
  "permissions",
  "concurrency",
  "env",
  "defaults",
  "jobs",
]);

type Paso = { uses?: unknown; run?: unknown; name?: unknown };
type Trabajo = { "runs-on"?: unknown; steps?: Paso[] };

export function problemasDe(fuente: string): string[] {
  const problemas: string[] = [];
  const documento = parse(fuente) as Record<string, unknown> | null;
  if (!documento || typeof documento !== "object") return ["no es un documento"];

  for (const clave of Object.keys(documento)) {
    if (!CLAVES_RAIZ.has(clave)) problemas.push(`clave suelta en la raíz: «${clave}»`);
  }

  const trabajos = (documento.jobs ?? {}) as Record<string, Trabajo>;
  if (Object.keys(trabajos).length === 0) problemas.push("sin trabajos");

  for (const [nombre, trabajo] of Object.entries(trabajos)) {
    if (!trabajo["runs-on"]) problemas.push(`${nombre}: sin runs-on`);
    if (!Array.isArray(trabajo.steps) || trabajo.steps.length === 0) {
      problemas.push(`${nombre}: sin pasos`);
      continue;
    }
    trabajo.steps.forEach((paso, indice) => {
      const rotulo = `${nombre}[${indice}] ${String(paso.name ?? "")}`.trim();
      if (Boolean(paso.uses) === Boolean(paso.run)) {
        problemas.push(`${rotulo}: tiene que llevar uses o run, y sólo uno`);
      }
      if (typeof paso.run === "string") {
        const abre = paso.run.match(/^\s*if\b/gm)?.length ?? 0;
        const cierra = paso.run.match(/^\s*fi\b/gm)?.length ?? 0;
        if (abre !== cierra) problemas.push(`${rotulo}: ${abre} if y ${cierra} fi`);
      }
    });
  }

  return problemas;
}

describe("los flujos de GitHub", () => {
  const ficheros = readdirSync(CARPETA).filter((f) => /\.ya?ml$/.test(f));

  it("hay flujos que vigilar", () => {
    expect(ficheros.length).toBeGreaterThanOrEqual(4);
  });

  for (const fichero of ficheros) {
    it(`${fichero} es un flujo que GitHub aceptaría`, () => {
      expect(problemasDe(readFileSync(join(CARPETA, fichero), "utf8"))).toEqual([]);
    });
  }

  it("y la comprobación muerde: el bloque cortado por un salto de línea se detecta", () => {
    const roto = [
      "name: x",
      "on: push",
      "jobs:",
      "  uno:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: |",
      '          if [ -n "$a" ]; then',
      '            gh issue create --body "primera línea',
      "",
      'Registro: $ENLACE"',
      "  fi",
    ].join("\n");
    const problemas = problemasDe(roto);
    expect(problemas.some((p) => p.includes("Registro"))).toBe(true);
    expect(problemas.some((p) => /1 if y 0 fi/.test(p))).toBe(true);
  });

  it("y un paso sin uses ni run, o con los dos, también", () => {
    const base = "name: x\non: push\njobs:\n  uno:\n    runs-on: ubuntu-latest\n    steps:\n";
    expect(problemasDe(`${base}      - name: nada\n`)).toHaveLength(1);
    expect(problemasDe(`${base}      - uses: a/b@v1\n        run: echo\n`)).toHaveLength(1);
    expect(problemasDe(`${base}      - run: echo\n`)).toEqual([]);
  });
});
