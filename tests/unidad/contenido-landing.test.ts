import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ORIGEN_DE_LA_SECCION } from "../../src/config/contenido-landing";
import { SECCIONES, esAncla, type Seccion } from "../../src/config/secciones";

/**
 * BODA-128 · El mapa de «qué llena cada sección» no puede despegarse de la web
 *
 * `ORIGEN_DE_LA_SECCION` dice, para cada sección de la landing, qué hace falta
 * para que aparezca y dónde se escribe. El panel lo usa para contar elementos y
 * para decir «vacía, así que no aparece», que es la mitad del valor de esa
 * pantalla.
 *
 * ES UN ESPEJO, Y LOS ESPEJOS SE DESPEGAN. La condición de pintado de verdad
 * vive en `src/app/page.tsx`, dentro del objeto `contenido`, mezclada con el
 * JSX de cada sección; sacarla de ahí sería reescribir la landing entera para
 * que el panel quede bonito. Lo que sí se puede hacer es que el espejo no se
 * despegue en silencio, y eso es este fichero.
 *
 * SE COMPRUEBAN TAMBIÉN LOS NOMBRES DE TABLA Y DE COLUMNA contra las
 * migraciones, y no es celo: escribiendo esto puse `iban` donde la columna se
 * llama `iban_regalos`. No lo caza el `typecheck` —son cadenas—, no lo caza el
 * linter, y en pantalla se habría visto como «regalos está sin escribir»
 * pasando lo contrario. Una consulta con un nombre inventado falla en tiempo de
 * ejecución y delante de quien la usa.
 */

const RAIZ = join(__dirname, "..", "..");

/** Todas las migraciones juntas. El rollback queda fuera: deshace, no define. */
const MIGRACIONES = readdirSync(join(RAIZ, "supabase/migrations"))
  .filter((nombre) => nombre.endsWith(".sql"))
  .map((nombre) => readFileSync(join(RAIZ, "supabase/migrations", nombre), "utf8"))
  .join("\n");

const LANDING = readFileSync(join(RAIZ, "src/app/page.tsx"), "utf8");

/**
 * Las secciones que la landing sabe pintar, sacadas de su propio objeto
 * `contenido`. Se lee el fichero en vez de importarlo porque importarlo
 * arrastraría media aplicación —y su conexión a la base— a un test de unidad.
 */
function seccionesQueLaLandingPinta(): Set<string> {
  const bloque = LANDING.match(
    /const contenido: Partial<Record<Seccion, ReactNode>> = \{([\s\S]*?)\n {2}\};/,
  );

  if (!bloque) {
    throw new Error(
      "No se encuentra el objeto `contenido` en src/app/page.tsx. Si se ha " +
        "renombrado, hay que actualizar este test: sin él, el panel puede " +
        "quedarse contando secciones que la web ya no pinta.",
    );
  }

  // Las claves de primer nivel están a cuatro espacios; lo de dentro, a más.
  return new Set([...bloque[1].matchAll(/^ {4}([a-z_]+):/gm)].map(([, clave]) => clave));
}

describe("el mapa de qué llena cada sección", () => {
  it("cubre las dieciséis secciones, sin sobrar ninguna", () => {
    expect(Object.keys(ORIGEN_DE_LA_SECCION).sort()).toEqual([...SECCIONES].sort());
  });

  it("el barrido de la landing encuentra sus secciones", () => {
    // Si el regex dejara de casar, todo lo de abajo pasaría en vacío.
    expect(seccionesQueLaLandingPinta().size).toBeGreaterThan(10);
  });

  it("toda sección con pantalla es una que la landing sabe pintar", () => {
    const pinta = seccionesQueLaLandingPinta();

    /*
      LAS QUE NO SON UN ANCLA QUEDAN FUERA, y no por comodidad: `reserva_la_
      fecha` es una PÁGINA PROPIA (`/reserva-la-fecha`), así que su fila de
      `secciones_landing` decide si esa ruta existe, no si hay un trozo de la
      landing. Nunca va a estar en el objeto `contenido`, y exigírselo obligaría
      a inventar una entrada falsa allí para que este test callara.
    */
    const huerfanas = SECCIONES.filter(
      (seccion) =>
        esAncla(seccion) &&
        ORIGEN_DE_LA_SECCION[seccion].clase !== "sin-hacer" &&
        !pinta.has(seccion),
    );

    expect(
      huerfanas,
      "el panel dice que estas secciones se llenan, y la landing no las pinta",
    ).toEqual([]);
  });

  it("y toda sección marcada «sin hacer» es una que la landing no pinta", () => {
    const pinta = seccionesQueLaLandingPinta();

    const mentirosas = SECCIONES.filter(
      (seccion) => ORIGEN_DE_LA_SECCION[seccion].clase === "sin-hacer" && pinta.has(seccion),
    );

    expect(
      mentirosas,
      "el panel avisa de que no existen y la landing ya las pinta: se puede quitar el aviso",
    ).toEqual([]);

    /*
      Y QUE SIGA HABIENDO ALGUNA, o lo de arriba estaría comprobando el vacío.
      Hoy es `ubicaciones`, encendida desde el primer día y sin componente
      (BODA-26). El día que se haga, este test se cae — y caerse es lo correcto:
      obliga a mirar si el aviso de la pantalla sigue teniendo sentido.
    */
    expect(
      SECCIONES.filter((seccion) => ORIGEN_DE_LA_SECCION[seccion].clase === "sin-hacer").length,
    ).toBeGreaterThan(0);
  });

  it("las tablas que se cuentan existen en las migraciones", () => {
    const inventadas = SECCIONES.filter((seccion: Seccion) => {
      const origen = ORIGEN_DE_LA_SECCION[seccion];
      if (origen.clase !== "lista") return false;
      return !MIGRACIONES.includes(`create table if not exists public.${origen.tabla}`);
    });

    expect(
      inventadas,
      "una tabla con el nombre mal falla al consultarla, no al compilar",
    ).toEqual([]);
  });

  it("las columnas que se miran existen en las migraciones", () => {
    const inventadas: string[] = [];

    for (const seccion of SECCIONES) {
      const origen = ORIGEN_DE_LA_SECCION[seccion];

      const columnas =
        origen.clase === "campo"
          ? [origen.campo]
          : origen.clase === "lista" && origen.filtro
            ? [origen.filtro.columna]
            : [];

      for (const columna of columnas) {
        /*
          Con límites de palabra a los dos lados, que es lo que distingue `iban`
          de `iban_regalos`: el guion bajo cuenta como carácter de palabra, así
          que `\biban\b` NO casa dentro de `iban_regalos`. Es exactamente la
          errata que motivó este test.
        */
        if (!new RegExp(`\\b${columna}\\b`).test(MIGRACIONES)) {
          inventadas.push(`${seccion} → ${columna}`);
        }
      }
    }

    expect(inventadas).toEqual([]);
  });

  it("toda lista se cuenta por `publicado`, que es lo que llega a la web", () => {
    /*
      El recuento de la pantalla filtra por `publicado`, así que una tabla sin
      esa columna daría cero siempre y la sección saldría como vacía teniendo
      contenido.
    */
    const sinPublicado = SECCIONES.filter((seccion) => {
      const origen = ORIGEN_DE_LA_SECCION[seccion];
      if (origen.clase !== "lista") return false;

      const definicion = MIGRACIONES.split(
        `create table if not exists public.${origen.tabla} (`,
      )[1]?.split(");")[0];

      return !definicion?.includes("publicado");
    });

    expect(sinPublicado).toEqual([]);
  });
});
