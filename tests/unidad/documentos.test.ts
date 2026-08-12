import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import copy from "../../content/copy.es.json";

/**
 * BODA-105 · UN ENUMERADO SIN SU COPY ES UNA PANTALLA QUE REVIENTA
 *
 * `t()` falla ruidosamente cuando la clave no existe, y eso está bien: mejor un
 * error que un hueco en blanco. Pero el fallo llega al abrir la pantalla, no al
 * compilar, porque la clave se compone —`panel.documentos.estados.<estado>`— y
 * una clave compuesta no la puede comprobar el `typecheck`.
 *
 * Así que se comprueba aquí, y contra la MIGRACIÓN y no contra una lista
 * escrita a mano: la verdad sobre qué valores tiene `estado_documento_boda` es
 * el SQL que crea el tipo. Añadir un estado y olvidar su rótulo pone el CI en
 * rojo en milisegundos en vez de romper el panel el día del despliegue.
 *
 * `src/lib/bbdd/documentos.ts` no se importa a propósito: es `server-only` y
 * ese módulo no se puede cargar desde un test unitario. Lo que hay que sujetar
 * tampoco está ahí — está entre el tipo de la base y el fichero de copys.
 */

const MIGRACION = readFileSync(
  join(__dirname, "..", "..", "supabase", "migrations", "20260812090000_documentos_boda.sql"),
  "utf8",
);

/** Los valores de un `asegurar_enum('nombre', array['a', 'b'])` de la migración. */
function valoresDelEnum(nombre: string): string[] {
  const bloque = new RegExp(
    `asegurar_enum\\(\\s*'${nombre}',\\s*array\\[([^\\]]+)\\]`,
    "s",
  ).exec(MIGRACION);

  expect(bloque, `la migración tiene que crear el enumerado ${nombre}`).not.toBeNull();

  return [...bloque![1].matchAll(/'([a-z_]+)'/g)].map((coincidencia) => coincidencia[1]);
}

const documentos = copy.panel.documentos;

describe("Los documentos de la boda y sus rótulos", () => {
  it("la migración declara los dos enumerados con sus valores", () => {
    // Si esto se queda a cero, la expresión ha dejado de encontrarlos y el
    // resto de comprobaciones estaría dándose por buena sin mirar nada.
    expect(valoresDelEnum("estado_documento_boda")).toEqual([
      "pendiente",
      "solicitado",
      "conseguido",
    ]);
    expect(valoresDelEnum("titular_documento")).toEqual(["novia", "novio", "ambos"]);
  });

  it("cada estado tiene rótulo en singular, en plural y su texto de grupo vacío", () => {
    for (const estado of valoresDelEnum("estado_documento_boda")) {
      expect(documentos.estados, `falta el rótulo de «${estado}»`).toHaveProperty(estado);
      expect(documentos.grupos, `falta el rótulo en plural de «${estado}»`).toHaveProperty(
        estado,
      );
      expect(
        documentos.grupoVacio,
        `falta qué decir cuando no hay ninguno en «${estado}»`,
      ).toHaveProperty(estado);
    }
  });

  it("cada titular tiene su rótulo", () => {
    for (const titular of valoresDelEnum("titular_documento")) {
      expect(documentos.titulares, `falta el rótulo de «${titular}»`).toHaveProperty(titular);
    }
  });

  /**
   * EL ORDEN DEL ENUMERADO ES EL ORDEN DE LA PANTALLA, y no es cosmético: el
   * `order by estado` de la vista se apoya en él, así que lo que falta por pedir
   * sale primero porque `pendiente` se declaró primero. Declararlo al revés
   * dejaría la pantalla contestando «qué tenéis» en vez de «qué os falta».
   */
  it("el enumerado va de lo que falta a lo que está", () => {
    const estados = valoresDelEnum("estado_documento_boda");
    expect(estados[0]).toBe("pendiente");
    expect(estados[estados.length - 1]).toBe("conseguido");
  });

  /**
   * El aviso que justifica el módulo tiene que decir las dos cosas: que caduca
   * antes de la boda y qué hacer al respecto. «Caducado» a secas manda a
   * averiguar si eso importa.
   */
  it("el aviso de caducidad dice qué hacer, no sólo qué pasa", () => {
    expect(documentos.caducaAntes).toMatch(/caduca antes de la boda/i);
    expect(documentos.caducaAntes).toMatch(/de nuevo/i);
  });
});
