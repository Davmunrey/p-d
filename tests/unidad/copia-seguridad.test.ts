import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * BODA-94 · Una copia que no se ha restaurado nunca no es una copia
 *
 * Es la diferencia entre este test y el que sería fácil escribir. Comprobar
 * que `pg_dump` genera un fichero prueba que el comando existe; lo que hace
 * falta saber es si ese fichero **devuelve la base**, y eso sólo se sabe
 * restaurándolo.
 *
 * Y NO BASTA CON QUE VUELVAN LAS FILAS. Un volcado de sólo datos restauraría
 * los invitados en una base sin políticas RLS: la lista estaría ahí, y también
 * a la vista de cualquiera. Por eso el test cuenta las políticas después de
 * restaurar — es la comprobación que distingue una copia útil de una que deja
 * los datos desnudos.
 */

const ejecutar = promisify(execFile);
const RAIZ = join(__dirname, "..", "..");
const cadena = process.env.DATABASE_URL;

const BASE_RESTAURADA = "boda_restaurada_prueba";
const DIRECTORIO = join(RAIZ, "copias-de-prueba");

/** La misma conexión pero contra otra base, para restaurar sin tocar la real. */
function otraBase(nombre: string): string {
  const url = new URL(cadena!);
  url.pathname = `/${nombre}`;
  return url.toString();
}

async function enPostgres<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(otraBase("postgres"), { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

afterAll(async () => {
  rmSync(DIRECTORIO, { recursive: true, force: true });
  if (cadena) {
    await enPostgres((sql) => sql.unsafe(`drop database if exists ${BASE_RESTAURADA}`));
  }
});

describe.skipIf(!cadena)("La copia de seguridad", () => {
  it("se vuelca y se restaura, con sus filas y sus políticas RLS", async () => {
    // 1. La copia.
    const { stdout } = await ejecutar("./scripts/copia-de-seguridad.sh", [], {
      cwd: RAIZ,
      env: { ...process.env, DIRECTORIO_COPIAS: DIRECTORIO },
    });
    const fichero = stdout.trim();
    expect(existsSync(fichero), "el volcado tiene que existir").toBe(true);

    // 2. Una base vacía donde restaurarla. Vacía de verdad: restaurar sobre
    //    la original no probaría nada, porque los datos ya están.
    await enPostgres(async (sql) => {
      await sql.unsafe(`drop database if exists ${BASE_RESTAURADA}`);
      await sql.unsafe(`create database ${BASE_RESTAURADA}`);
    });

    const destino = otraBase(BASE_RESTAURADA);

    /*
        `extensions` y `auth` no vienen en el volcado —es de `public`— pero el
        esquema los da por hecho. Se crean antes, que es exactamente lo que
        habría que hacer restaurando en un Supabase nuevo.
      */
    const preparar = postgres(destino, { max: 1, prepare: false, onnotice: () => {} });
    await preparar`create schema if not exists extensions`;
    await preparar`create extension if not exists pgcrypto with schema extensions`;
    await preparar`create schema if not exists auth`;
    await preparar.unsafe(
      `create table if not exists auth.users (id uuid primary key, email text)`,
    );
    await preparar.unsafe(
      `create or replace function auth.uid() returns uuid language sql stable as
         $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$`,
    );
    for (const rol of ["anon", "authenticated", "service_role"]) {
      await preparar.unsafe(
        `do $$ begin if not exists (select 1 from pg_roles where rolname = '${rol}')
             then create role ${rol} nologin; end if; end $$`,
      );
    }
    await preparar.end();

    // 3. La restauración. `pg_restore` avisa de lo que no puede aplicar y
    //    sigue: se acepta su código de salida y se juzga por el resultado.
    await ejecutar(
      "bash",
      [
        "-c",
        `PATH="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1):$PATH" ` +
          `pg_restore --no-owner --no-privileges --dbname="${destino}" "${fichero}" 2>/dev/null || true`,
      ],
      { cwd: RAIZ },
    );

    // 4. Lo que importa: ¿está la boda dentro?
    const restaurada = postgres(destino, { max: 1, prepare: false, onnotice: () => {} });
    try {
      const [invitados] = await restaurada<{ cuantos: number }[]>`
          select count(*)::int as cuantos from public.invitados
        `;
      expect(invitados.cuantos, "los invitados tienen que volver").toBeGreaterThan(0);

      /*
          Y LAS PROTECCIONES. Sin esto, la copia devolvería la lista de
          invitados a una base donde cualquiera la lee — que es peor que no
          tener copia, porque nadie se enteraría.
        */
      const [politicas] = await restaurada<{ cuantas: number }[]>`
          select count(*)::int as cuantas from pg_policies where schemaname = 'public'
        `;
      expect(politicas.cuantas, "las políticas RLS tienen que volver").toBeGreaterThan(10);

      const [protegidas] = await restaurada<{ cuantas: number }[]>`
          select count(*)::int as cuantas
            from pg_class as c
            join pg_namespace as n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
        `;
      expect(protegidas.cuantas, "RLS tiene que seguir activado").toBeGreaterThan(10);
    } finally {
      await restaurada.end();
    }
  }, 120_000);

  it("sin DATABASE_URL no genera un fichero vacío: falla", async () => {
    // Una copia que falla en silencio es no tener copia. Lo que no puede
    // pasar es que salga en verde dejando un fichero que no sirve.
    await expect(
      ejecutar("./scripts/copia-de-seguridad.sh", [], {
        cwd: RAIZ,
        env: { ...process.env, DATABASE_URL: "", DIRECTORIO_COPIAS: DIRECTORIO },
      }),
    ).rejects.toThrow();
  }, 30_000);
});
