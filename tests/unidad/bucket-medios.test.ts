import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUCKET_MEDIOS,
  PESO_MAXIMO_IMAGEN_MB,
  PESO_MAXIMO_VIDEO_MB,
  TIPOS_MEDIO_ADMITIDOS,
} from "@/config/constants";

/**
 * BODA-29 · EL BUCKET Y LAS CONSTANTES DICEN LO MISMO
 *
 * El tope de peso y los tipos admitidos viven en dos sitios a propósito: el
 * navegador corta antes de subir y el bucket vuelve a comprobarlo. Lo que NO
 * puede pasar es que se separen — y separarse es facilísimo, porque el día que
 * alguien admita `image/heic` lo hará donde le duela (el formulario que rechaza
 * la foto del iPhone de su madre) y no en la migración.
 *
 * Cuando eso ocurre, el fallo es de los peores: la pantalla deja elegir el
 * fichero, la subida arranca, y Storage la rechaza al final. El usuario ve una
 * barra de progreso llegar al cien por cien y luego un error.
 *
 * Se lee el SQL como texto y no se consulta la base: este test tiene que correr
 * en el trabajo de unitarios, que no levanta ningún PostgreSQL.
 */

const MIGRACION = join(
  __dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "20260811090000_bucket_medios.sql",
);

const sql = readFileSync(MIGRACION, "utf8");

/** Un mega, en bytes. Storage habla en bytes; las constantes, en megas. */
const BYTES_POR_MEGA = 1024 * 1024;

describe("el bucket de medios", () => {
  it("se llama igual en el código que en la migración", () => {
    expect(sql).toContain(`'${BUCKET_MEDIOS}'`);
  });

  it("el tope del bucket es el del vídeo, que es el mayor", () => {
    const encontrado = sql.match(/^\s*(\d+), -- \d+ MB$/m);
    expect(encontrado, "no se encuentra el tope en la migración").not.toBeNull();

    expect(Number(encontrado![1])).toBe(PESO_MAXIMO_VIDEO_MB * BYTES_POR_MEGA);

    // Y que siga siendo el mayor: si alguien sube el de las imágenes por encima
    // del del vídeo, el bucket rechazaría fotos que la aplicación admite.
    expect(PESO_MAXIMO_VIDEO_MB).toBeGreaterThanOrEqual(PESO_MAXIMO_IMAGEN_MB);
  });

  it("admite exactamente los mismos tipos, y en el mismo orden", () => {
    const bloque = sql.match(/allowed_mime_types[\s\S]*?array\[([\s\S]*?)\]/);
    expect(bloque, "no se encuentra la lista de tipos en la migración").not.toBeNull();

    const enLaMigracion = [...bloque![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(enLaMigracion).toEqual([...TIPOS_MEDIO_ADMITIDOS]);
  });

  it("el bucket es público, y eso es una decisión escrita, no un descuido", () => {
    /*
      Si alguien lo pone en privado, la landing deja de ver las fotos sin que
      falle nada: `<img>` recibe un 400 y se queda el hueco. Es un cambio de una
      palabra con consecuencias invisibles, así que se afirma aquí.
    */
    expect(sql).toMatch(/values \(\s*'medios',\s*'medios',\s*true,/);
  });

  it("tiene su rollback, como toda migración", () => {
    const rollback = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "supabase",
        "migrations",
        "rollback",
        "20260811090000_bucket_medios.sql",
      ),
      "utf8",
    );

    // Quita las tres políticas y NO borra el bucket: deshacer un despliegue no
    // puede llevarse por delante las fotos de la boda.
    expect(rollback).toContain("drop policy if exists medios_objetos_publica_leer");
    expect(rollback).toContain("drop policy if exists medios_objetos_colaborador_leer");
    expect(rollback).toContain("drop policy if exists medios_objetos_editor_escribir");
    expect(rollback).not.toMatch(/^\s*delete from storage\.buckets/m);
  });
});
