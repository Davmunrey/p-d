import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import copia from "../../content/copy.es.json";

/**
 * BODA-127 · Los motivos con los que la puerta te devuelve
 *
 * Cuando el acceso falla se vuelve a `/acceso?estado=<motivo>`, y la página
 * traduce ese motivo a una frase con su tabla `MENSAJES`. Son dos listas en dos
 * ficheros distintos que tienen que coincidir, y no coincidían: `sin-acceso`
 * llevaba meses en la tabla sin que ningún camino lo emitiera —copy muerto— y
 * el caso que debía usarlo devolvía `credenciales`, o sea que a quien tenía la
 * cuenta sin dar de alta la web le decía que su contraseña estaba mal.
 *
 * Eso dejó a los novios fuera de su propio panel sin una sola pista de por qué:
 * contraseña correcta, mensaje de contraseña incorrecta, y la sensación de que
 * el botón no hacía nada.
 *
 * SE COMPRUEBAN LAS DOS DIRECCIONES, y las dos importan por motivos distintos:
 * un motivo sin frase sale en pantalla como un error mudo —la página no pinta
 * nada y parece que no ha pasado nada—, y una frase sin motivo es texto que
 * nadie puede leer nunca, que es exactamente como esto se rompió.
 */

const RAIZ = join(__dirname, "..", "..");
const FUENTES = join(RAIZ, "src");

function* ficheros(carpeta: string): Generator<string> {
  for (const entrada of readdirSync(carpeta)) {
    const ruta = join(carpeta, entrada);
    if (statSync(ruta).isDirectory()) yield* ficheros(ruta);
    else if (/\.tsx?$/.test(entrada)) yield ruta;
  }
}

/** Todos los motivos que alguien manda a `/acceso`, se escriban como se escriban. */
function motivosEmitidos(): Set<string> {
  const motivos = new Set<string>();

  for (const ruta of ficheros(FUENTES)) {
    const texto = readFileSync(ruta, "utf8");

    // `aLaPuerta("credenciales", destino)` — la puerta del formulario.
    for (const [, motivo] of texto.matchAll(/aLaPuerta\(\s*"([a-z-]+)"/g)) {
      motivos.add(motivo);
    }

    // `redirect(`${RUTA_ACCESO}?estado=enlace-invalido`)` — las páginas.
    for (const [, motivo] of texto.matchAll(/RUTA_ACCESO\}\?estado=([a-z-]+)/g)) {
      motivos.add(motivo);
    }

    // `aAcceso("sin-configurar")` — la vuelta del enlace del correo.
    for (const [, motivo] of texto.matchAll(/aAcceso\(\s*"([a-z-]+)"\s*\)/g)) {
      motivos.add(motivo);
    }

    /*
      `return "sin-acceso"` — la función que DECIDE el motivo, en
      `acceso/estado.ts`. Vive aparte porque `acciones.ts` es `"use server"` y
      no puede exportar nada que no sea una función asíncrona, y porque así la
      regla se puede probar sin levantar un Supabase.

      El patrón se limita a ESE fichero a propósito: un `return "algo"` es
      demasiado común para barrerlo por todo `src/`, y si contara en cualquier
      sitio, un motivo muerto encontraría dónde esconderse.
    */
    if (ruta.endsWith(join("app", "acceso", "estado.ts"))) {
      for (const [, motivo] of texto.matchAll(/return\s+"([a-z-]+)"\s*;/g)) {
        motivos.add(motivo);
      }
    }
  }

  return motivos;
}

/** Las claves de la tabla `MENSAJES` de la página de acceso. */
function motivosConFrase(): Set<string> {
  const pagina = readFileSync(join(FUENTES, "app/acceso/page.tsx"), "utf8");
  const tabla = pagina.match(/const MENSAJES: Record<string, string> = \{([\s\S]*?)\n\};/);

  if (!tabla) throw new Error("No se encuentra la tabla MENSAJES en la página de acceso.");

  return new Set([...tabla[1].matchAll(/^\s*"?([a-z-]+)"?:/gm)].map(([, clave]) => clave));
}

describe("los motivos con los que la puerta te devuelve", () => {
  it("el barrido encuentra algo que comprobar", () => {
    // Si los dos lados salieran vacíos, todo lo de abajo pasaría en vacío.
    expect(motivosEmitidos().size).toBeGreaterThanOrEqual(4);
    expect(motivosConFrase().size).toBeGreaterThanOrEqual(4);
  });

  it("todo motivo que se emite tiene su frase", () => {
    const conFrase = motivosConFrase();
    const mudos = [...motivosEmitidos()].filter((motivo) => !conFrase.has(motivo));

    expect(mudos, "un motivo sin frase se ve como una página que no dice nada").toEqual([]);
  });

  it("y toda frase la emite alguien", () => {
    const emitidos = motivosEmitidos();
    const muertas = [...motivosConFrase()].filter((motivo) => !emitidos.has(motivo));

    expect(muertas, "una frase que nadie emite es texto que nadie puede leer").toEqual([]);
  });

  it("«sin acceso» no dice lo mismo que «credenciales»", () => {
    /*
      LA DECISIÓN DEL TICKET, ESCRITA DONDE MUERDE. Las dos frases fueron
      idénticas a propósito —para que la puerta no sirviera de comprobador de
      qué correos tienen acceso—, y el precio lo pagaron los novios: acertaban
      la contraseña y la web les respondía que estaba mal.

      Volverlas a igualar no rompería ningún otro test y dejaría `sin-acceso`
      otra vez sin decir nada, así que se comprueba aquí. Lo que sí sigue
      indistinguible es lo único que protege la lista: quien FALLA la contraseña
      lee lo mismo exista el correo o no, y de eso se ocupa `acceso-real.spec.ts`.
    */
    expect(copia.acceso.errorSinAcceso).not.toBe(copia.acceso.errorCredenciales);
  });
});
