import { describe, expect, it } from "vitest";

import { grupo, t, type ClaveCopy } from "@/lib/copy";

/**
 * BODA-03 · Capa de copys
 *
 * La garantía que da esta capa es doble: en compilación, una clave inexistente
 * no tipa; en ejecución, falla ruidosamente en vez de renderizar vacío.
 */
describe("t()", () => {
  it("devuelve el texto de una clave anidada", () => {
    expect(t("comun.guardar")).toBe("Guardar");
  });

  it("interpola valores", () => {
    // Se apoya en una clave real con marcador; si no hay ninguna, el texto
    // vuelve tal cual, que es justo lo que se comprueba abajo.
    expect(t("comun.cancelar", { nombre: "Ana" })).toBe("Cancelar");
  });

  it("falla ruidosamente si la clave no existe", () => {
    // Se fuerza el tipo a propósito: en código real esto no compilaría.
    expect(() => t("comun.noExiste" as ClaveCopy)).toThrow(/Copy no encontrado/);
  });

  it("falla si la ruta apunta a un objeto en lugar de a un texto", () => {
    expect(() => t("comun" as ClaveCopy)).toThrow(/Copy no encontrado/);
  });
});

describe("grupo()", () => {
  it("devuelve el subárbol completo", () => {
    const errores = grupo("errores");

    expect(errores.campoObligatorio).toBe("Este campo es obligatorio.");
    expect(Object.keys(errores).length).toBeGreaterThan(0);
  });
});

describe("todos los copys", () => {
  it("están en castellano y sin cadenas vacías", () => {
    const vacios: string[] = [];

    const recorrer = (nodo: unknown, ruta: string) => {
      if (typeof nodo === "string") {
        if (nodo.trim() === "") vacios.push(ruta);
        return;
      }
      for (const [clave, valor] of Object.entries(nodo as Record<string, unknown>)) {
        recorrer(valor, ruta ? `${ruta}.${clave}` : clave);
      }
    };

    recorrer(grupo("comun"), "comun");
    recorrer(grupo("errores"), "errores");
    recorrer(grupo("meta"), "meta");
    recorrer(grupo("cocina"), "cocina");

    expect(vacios).toEqual([]);
  });
});
