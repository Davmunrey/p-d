import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FORMA_TELEFONO } from "@/config/constants";
import { esTelefonoValido, paraLlamar } from "@/lib/telefono";

/**
 * EL TELÉFONO SE COMPRUEBA ANTES DE ENVIAR, CON LA MISMA REGLA QUE LA BASE
 *
 * `proveedores.telefono` y `contactos_proveedor.telefono` llevan un CHECK, y la
 * pantalla no comprobaba nada: un número escrito como se escribe en una
 * tarjeta —«600 11 22 33 / 91 555 12 12», «+34 600 112 233 ext. 4»— llegaba a
 * la base, saltaba el CHECK, y el aviso era «no se ha podido guardar» sin
 * señalar el campo. Ahora se dice antes, y se dice cuál.
 *
 * Y LA REGLA ES UNA COPIA, así que se contrasta con el original: la última
 * prueba lee la migración y exige que la expresión sea la misma letra por
 * letra. Si mañana la base admite algo más y esto no, se pone rojo aquí.
 */

const RAIZ = join(__dirname, "..", "..");

describe("esTelefonoValido", () => {
  it("acepta lo que escribe una persona copiando de una tarjeta", () => {
    for (const bueno of [
      "600112233",
      "600 11 22 33",
      "+34 600 112 233",
      "(91) 555-12-12",
      "91.555.12.12",
    ]) {
      expect(esTelefonoValido(bueno), bueno).toBe(true);
    }
  });

  it("rechaza dos números en el mismo campo: para eso hay dos contactos", () => {
    expect(esTelefonoValido("600 11 22 33 / 91 555 12 12")).toBe(false);
  });

  it("rechaza extensiones y letras, que la base tampoco admite", () => {
    expect(esTelefonoValido("+34 600 112 233 ext. 4")).toBe(false);
    expect(esTelefonoValido("llamar por la tarde")).toBe(false);
  });

  it("rechaza lo demasiado corto y lo demasiado largo", () => {
    expect(esTelefonoValido("12345")).toBe(false);
    expect(esTelefonoValido("1".repeat(26))).toBe(false);
    expect(esTelefonoValido("1".repeat(25))).toBe(true);
  });

  it("lo que acepta, `paraLlamar` lo convierte en un enlace de sólo cifras", () => {
    // Devuelve el `href` entero: es lo que va en el `<a>` de la agenda del día.
    expect(paraLlamar("+34 600 112 233")).toBe("tel:+34600112233");
  });
});

describe("la forma del teléfono es la de la base", () => {
  it("FORMA_TELEFONO es, letra por letra, el CHECK de proveedores y contactos", () => {
    const enCodigo = FORMA_TELEFONO.source;

    for (const migracion of [
      "20260803090200_economia.sql",
      "20260810220000_contactos_proveedor.sql",
    ]) {
      const sql = readFileSync(join(RAIZ, "supabase", "migrations", migracion), "utf8");
      const enBase = sql.match(/telefono ~ '([^']+)'/);

      expect(enBase, `${migracion} ya no declara la forma del teléfono`).not.toBeNull();
      expect(enBase![1], migracion).toBe(enCodigo);
    }
  });
});
