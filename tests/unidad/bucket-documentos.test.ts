import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUCKET_DOCUMENTOS,
  PESO_MAXIMO_DOCUMENTO_MB,
  TIPOS_DOCUMENTO_ADMITIDOS,
} from "@/config/constants";

/**
 * BODA-72 · EL BUCKET DE DOCUMENTOS Y LAS CONSTANTES DICEN LO MISMO
 *
 * El mismo pacto que con el bucket de medios: el tope y los tipos viven en dos
 * sitios a propósito —la aplicación corta antes de subir, el bucket vuelve a
 * comprobarlo— y lo que no puede pasar es que se separen.
 *
 * Y una afirmación más que allí no existe: que el bucket es PRIVADO. Aquí
 * dentro van contratos con datos bancarios y firmas; ponerlo en público es un
 * cambio de una palabra que no rompe nada a la vista — los ficheros
 * simplemente pasan a poder leerse por URL directa.
 *
 * Se lee el SQL como texto y no se consulta la base: este test tiene que
 * correr en el trabajo de unitarios, que no levanta ningún PostgreSQL.
 */

const CARPETA = join(__dirname, "..", "..", "supabase", "migrations");
const FICHERO = "20260811140800_bucket_documentos.sql";

const sql = readFileSync(join(CARPETA, FICHERO), "utf8");
const rollback = readFileSync(join(CARPETA, "rollback", FICHERO), "utf8");

/** Un mega, en bytes. Storage habla en bytes; las constantes, en megas. */
const BYTES_POR_MEGA = 1024 * 1024;

describe("el bucket de documentos", () => {
  it("se llama igual en el código que en la migración", () => {
    expect(sql).toContain(`'${BUCKET_DOCUMENTOS}'`);
  });

  it("el tope del bucket es el de la constante", () => {
    const encontrado = sql.match(/^\s*(\d+), -- \d+ MB/m);
    expect(encontrado, "no se encuentra el tope en la migración").not.toBeNull();

    expect(Number(encontrado![1])).toBe(PESO_MAXIMO_DOCUMENTO_MB * BYTES_POR_MEGA);
  });

  it("admite exactamente los mismos tipos, y en el mismo orden", () => {
    const bloque = sql.match(/allowed_mime_types[\s\S]*?array\[([\s\S]*?)\]/);
    expect(bloque, "no se encuentra la lista de tipos en la migración").not.toBeNull();

    const enLaMigracion = [...bloque![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(enLaMigracion).toEqual([...TIPOS_DOCUMENTO_ADMITIDOS]);
  });

  it("el bucket es PRIVADO, y eso es la mitad del ticket", () => {
    /*
      `anon` no lee un contrato ni conociendo la ruta exacta. La descarga
      legítima pasa por una acción de servidor que firma una URL de caducidad
      corta. Si alguien cambia este `false`, no falla nada a la vista — por
      eso se afirma aquí.
    */
    expect(sql).toMatch(/values \(\s*'documentos',\s*'documentos',\s*false,/);
  });

  it("no usa sentencias que exijan ser dueño de las tablas de Storage", () => {
    // La lección de la migración de medios: `storage.*` es de
    // `supabase_storage_admin`, y `postgres` tiene DML pero no propiedad.
    const sinComentarios = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    expect(sinComentarios).not.toMatch(/comment\s+on\s+table\s+storage\./i);
    expect(sinComentarios).not.toMatch(/create\s+policy[\s\S]*?on\s+storage\./i);
    expect(sinComentarios).not.toMatch(/alter\s+table\s+storage\./i);
  });

  it("el rollback quita el bucket sólo si está vacío", () => {
    expect(rollback).toMatch(/delete from storage\.buckets/);
    expect(rollback).toMatch(/not exists[\s\S]*storage\.objects/);

    const sinComentarios = rollback.replace(/--[^\n]*/g, "");
    expect(sinComentarios).not.toMatch(/drop\s+policy[\s\S]*?on\s+storage\./i);
  });
});
