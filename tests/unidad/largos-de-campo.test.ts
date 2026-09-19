import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LARGOS_DE_CAMPO, LIMITE_TEXTO_CANCION } from "@/config/constants";

/**
 * LOS LÍMITES DE LOS CAMPOS LOS DICE LA BASE, Y AQUÍ SE COMPRUEBA QUE SE CITAN
 *
 * Cada campo de texto largo tiene su tope escrito en un `check` de la columna, y
 * el formulario lo repite en su `maxLength` para cortar antes de enviar. Son dos
 * afirmaciones de la misma verdad, y hasta ahora la del formulario era un número
 * suelto que nadie comparaba con nada.
 *
 * Separarse es fácil y el fallo es de los que no dan error:
 *
 *   · Si el formulario se queda CORTO, el campo no deja escribir algo que la
 *     base admitiría. Nadie se entera nunca; simplemente no se puede.
 *   · Si se queda LARGO, la pantalla deja escribir y el servidor lo rechaza al
 *     enviar, con el texto ya escrito. Que es la peor forma de decir que no.
 *
 * Así que este test lee las migraciones —el original— y comprueba una por una
 * que `LARGOS_DE_CAMPO` diga lo mismo. Si mañana una migración sube un tope y
 * nadie toca la constante, se pone rojo aquí.
 *
 * Y comprueba lo otro: que no quede ningún `maxLength` con un número escrito a
 * mano, porque el que se escapa es justo el que nadie vuelve a mirar.
 */

const RAIZ = join(__dirname, "..", "..");

/**
 * El fuente sin comentarios, para que un ejemplo escrito en uno no cuente.
 *
 * Un bloque de comentario se cambia por sus MISMOS saltos de línea y no por
 * nada: si desaparecieran, los números de línea que enseña el fallo apuntarían
 * a otro sitio — la primera vez que este guardián cazó algo dijo «línea 380» y
 * la constante estaba en la 554. Un aviso que señala mal obliga a buscar.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ""))
    .replace(/\/\/[^\n]*/g, "");
}

function ficheros(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const camino = join(directorio, entrada.name);
    return entrada.isDirectory() ? ficheros(camino) : [camino];
  });
}

/**
 * Los topes que escriben las migraciones, por `tabla.columna`.
 *
 * La tabla se sabe por el `create table` o el `alter table` más cercano por
 * encima, que es como está escrito el esquema. Coge las dos formas en que se
 * escribe un tope aquí: `length(x) <= N` y `length(btrim(x)) between 1 and N`.
 */
function topesDeLaBase(): Map<string, number> {
  const migraciones = join(RAIZ, "supabase", "migrations");
  const encabezado = /(?:create|alter) table(?: if (?:not )?exists)?\s+(?:public\.)?([a-z_]+)/i;
  const tope =
    /(?:char_)?length\(\s*(?:btrim\(\s*)?([a-z_]+)\s*\)?\s*\)\s*(?:<=\s*(\d+)|between\s+\d+\s+and\s+(\d+))/g;

  const topes = new Map<string, number>();

  for (const nombre of readdirSync(migraciones).sort()) {
    if (!nombre.endsWith(".sql")) continue;
    let tabla: string | null = null;

    for (const linea of readFileSync(join(migraciones, nombre), "utf8").split("\n")) {
      const cabecera = linea.match(encabezado);
      if (cabecera) tabla = cabecera[1];

      for (const encontrado of linea.matchAll(tope)) {
        const cuanto = encontrado[2] ?? encontrado[3];
        if (tabla && cuanto) topes.set(`${tabla}.${encontrado[1]}`, Number(cuanto));
      }
    }
  }

  return topes;
}

describe("LARGOS_DE_CAMPO cita a la base", () => {
  const topes = topesDeLaBase();

  it("las migraciones dan topes de sobra: si esto baja, el barrido dejó de leerlas", () => {
    expect(topes.size).toBeGreaterThanOrEqual(60);
  });

  for (const [columna, largo] of Object.entries(LARGOS_DE_CAMPO)) {
    /*
      `medios.texto_alternativo` es la única que no vive en un `check` de la
      columna: es `jsonb` con un texto por idioma, y el tope lo pone el trigger
      `validar_texto_alternativo_medio`. Se comprueba contra ese cuerpo.
    */
    if (columna === "medios.texto_alternativo") {
      it(`${columna}: el trigger del medio exige ese mismo tope`, () => {
        const organizacion = readFileSync(
          join(RAIZ, "supabase", "migrations", "20260803090300_organizacion.sql"),
          "utf8",
        );
        expect(organizacion).toContain("validar_texto_alternativo_medio");
        expect(organizacion).toMatch(
          new RegExp(`texto_alternativo[\\s\\S]{0,200}between\\s+\\d+\\s+and\\s+${largo}\\b`),
        );
      });
      continue;
    }

    it(`${columna}: dice lo mismo que su migración`, () => {
      expect(topes.get(columna), `la base no declara ningún tope para ${columna}`).toBe(largo);
    });
  }

  it("el tope de la playlist también sale de su tabla", () => {
    expect(topes.get("canciones_sugeridas.texto")).toBe(LIMITE_TEXTO_CANCION);
  });
});

describe("ningún tope se declara como constante suelta", () => {
  /*
    EL AGUJERO QUE QUEDABA: `maxLength={160}` ya no cuela, pero `const
    LARGO_TITULO = 160` seguido de `titulo.length > LARGO_TITULO` sí colaba —
    es exactamente lo que había en `tareas/acciones.ts`, con su comentario
    «lo más largo que admite tareas_titulo_longitud» y todo. Con nombre, pero
    sin que nadie lo comparara con la migración. Un tope de texto se escribe
    una vez, en `LARGOS_DE_CAMPO`, citando su columna.
  */
  it("no hay ningún «const LARGO_ALGO = número» fuera de constants.ts", () => {
    const sueltos = ficheros(join(RAIZ, "src"))
      .filter((fichero) => /\.tsx?$/.test(fichero) && !fichero.endsWith("config/constants.ts"))
      .flatMap((fichero) =>
        sinComentarios(readFileSync(fichero, "utf8"))
          .split("\n")
          .flatMap((linea, indice) =>
            /\bconst (LARGO|LONGITUD|TOPE)_[A-Z_]+ = \d+;/.test(linea)
              ? [`${fichero.slice(RAIZ.length + 1)}:${indice + 1}`]
              : [],
          ),
      );

    expect(sueltos, "el tope va en LARGOS_DE_CAMPO, citando su columna").toEqual([]);
  });
});

describe("ninguna pantalla escribe un maxLength a mano", () => {
  it("todos los maxLength del proyecto salen de una constante", () => {
    const sueltos = ficheros(join(RAIZ, "src"))
      .filter((fichero) => /\.tsx?$/.test(fichero))
      .flatMap((fichero) =>
        // Sin los comentarios: la cabecera de `LARGOS_DE_CAMPO` cita un
        // `maxLength={160}` para explicar de qué habla, y se cazaba a sí misma.
        sinComentarios(readFileSync(fichero, "utf8"))
          .split("\n")
          .flatMap((linea, indice) =>
            /maxLength=\{\d/.test(linea)
              ? [`${fichero.slice(RAIZ.length + 1)}:${indice + 1}`]
              : [],
          ),
      );

    expect(sueltos, 'usa LARGOS_DE_CAMPO["tabla.columna"]').toEqual([]);
  });
});
