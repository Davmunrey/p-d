import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLAVES_LISTA,
  LISTAS_DE_CONTENIDO,
  ORIGEN_DE_LA_SECCION,
  rutaDeLista,
  seccionDeLista,
  variantePorDefecto,
  type ClaveLista,
} from "../../src/config/contenido-landing";
import { TOPE_ORDEN_CONTENIDO } from "../../src/config/constants";

/**
 * BODA-129 · El descriptor de las cuatro listas, contra la realidad
 *
 * `LISTAS_DE_CONTENIDO` describe con cadenas lo que una pantalla y una acción
 * hacen luego contra la base: de qué tabla se lee, qué columnas tiene una ficha
 * y con qué orden se enseña. NADA DE ESO LO MIRA EL `typecheck` —son cadenas—,
 * así que una errata no se ve al compilar: se ve en producción, delante de
 * quien acaba de escribir un hito y no lo encuentra.
 *
 * Ya pasó una vez, en BODA-128: puse `iban` donde la columna se llama
 * `iban_regalos`. Aquel test cazó aquella errata y este cierra la misma puerta
 * para lo que añade este ticket.
 *
 * Y HAY UN DATO ESCRITO DOS VECES, que es el riesgo de verdad: `ordenacion`
 * dice con qué orden pinta el panel, y el `order by` de
 * `src/lib/bbdd/landing.ts` con cuál pinta la web. Si se separan, el botón de
 * subir mueve una ficha a un sitio que quien lo pulsa no está viendo —y no da
 * error ni sale en ninguna pantalla—. Aquí se comparan.
 */

const RAIZ = join(__dirname, "..", "..");

/** Todas las migraciones juntas. El rollback queda fuera: deshace, no define. */
const MIGRACIONES = readdirSync(join(RAIZ, "supabase/migrations"))
  .filter((nombre) => nombre.endsWith(".sql"))
  .map((nombre) => readFileSync(join(RAIZ, "supabase/migrations", nombre), "utf8"))
  .join("\n");

const LANDING = readFileSync(join(RAIZ, "src/lib/bbdd/landing.ts"), "utf8");

/** El cuerpo del `create table` de una tabla, sin los `constraint`. */
function definicionDe(tabla: string): string {
  const bloque = MIGRACIONES.split(`create table if not exists public.${tabla} (`)[1];
  if (bloque === undefined) {
    throw new Error(
      `No existe la tabla «${tabla}» en las migraciones. El descriptor la nombra, ` +
        "así que la pantalla haría un `from` contra algo que no está.",
    );
  }
  return bloque.split(");")[0];
}

interface Columna {
  nombre: string;
  /** Lo que sigue al nombre: tipo, `not null`, `default`… */
  resto: string;
}

/**
 * Las columnas de una tabla.
 *
 * SE MIRAN TAMBIÉN LOS `alter table`, y no es un detalle: `momento` —la columna
 * por la que se parte el programa en dos pestañas— no está en el `create
 * table`, se añadió después (BODA-46). Leyendo sólo la definición original,
 * este fichero daría por inventada la columna que más se usa.
 */
function columnasDe(tabla: string): Columna[] {
  const columnas: Columna[] = [];

  for (const linea of definicionDe(tabla).split("\n")) {
    const casa = linea.match(/^ {2}(\w+)\s+(.*)$/);
    if (casa && casa[1] !== "constraint") columnas.push({ nombre: casa[1], resto: casa[2] });
  }

  const alteraciones = MIGRACIONES.matchAll(
    new RegExp(`alter table (?:if exists )?public\\.${tabla}\\b([\\s\\S]*?);`, "g"),
  );
  for (const [, cuerpo] of alteraciones) {
    for (const [, nombre, resto] of cuerpo.matchAll(
      /add column (?:if not exists )?(\w+)\s+([^\n]*)/g,
    )) {
      columnas.push({ nombre, resto });
    }
  }

  return columnas;
}

function nombresDe(tabla: string): string[] {
  return columnasDe(tabla).map((columna) => columna.nombre);
}

/**
 * El `order by` con el que la web pública lee esa tabla.
 *
 * Se acota al literal de la consulta —`[^\`]` no cruza las comillas invertidas
 * que la delimitan—, para no acabar leyendo el `order by` de la consulta de
 * abajo si algún día esta se queda sin él.
 */
function ordenacionDeLaWeb(tabla: string): string[] {
  const consulta = LANDING.match(
    new RegExp(`from public\\.${tabla}(?: as \\w+)?\\b[^\`]*?order by ([^\\n\`]+)`),
  );

  if (!consulta) {
    throw new Error(
      `No se encuentra el \`order by\` de public.${tabla} en src/lib/bbdd/landing.ts. ` +
        "Si la consulta se ha movido, hay que actualizar este test: sin él, el panel " +
        "puede acabar enseñando las fichas en un orden distinto al de la web.",
    );
  }

  return (
    consulta[1]
      .split(",")
      // `a.orden` y `orden` son la misma columna: lo que se compara es el criterio.
      .map((trozo) =>
        trozo
          .trim()
          .replace(/^\w+\./, "")
          .replace(/\s+(asc|desc|nulls\b.*)$/i, ""),
      )
      .map((trozo) => trozo.trim())
      .filter(Boolean)
  );
}

const LISTAS = CLAVES_LISTA.map((clave) => [clave, LISTAS_DE_CONTENIDO[clave]] as const);

describe("el descriptor de las listas de contenido", () => {
  it("describe exactamente las listas que dice haber", () => {
    expect(Object.keys(LISTAS_DE_CONTENIDO).sort()).toEqual([...CLAVES_LISTA].sort());
  });

  it.each(LISTAS)("«%s» escribe en una tabla que existe", (_clave, lista) => {
    expect(MIGRACIONES).toContain(`create table if not exists public.${lista.tabla} (`);
  });

  it.each(LISTAS)("los campos de «%s» son columnas de verdad", (_clave, lista) => {
    const columnas = nombresDe(lista.tabla);
    const inventadas = lista.campos
      .map((campo) => campo.columna)
      .filter((columna) => !columnas.includes(columna));

    expect(inventadas, `columnas que ${lista.tabla} no tiene`).toEqual([]);
  });

  it.each(LISTAS)("«%s» tiene con qué ordenarse y con qué retirarse", (_clave, lista) => {
    // Las dos las usa la pantalla para todas por igual: `orden` para mover y
    // `publicado` para el botón de retirar de la web.
    expect(nombresDe(lista.tabla)).toEqual(expect.arrayContaining(["orden", "publicado"]));
  });

  it.each(LISTAS)("la columna que parte «%s» existe, si la hay", (_clave, lista) => {
    if (lista.destino.clase !== "partida") return;
    expect(nombresDe(lista.tabla)).toContain(lista.destino.columna);
  });

  it.each(LISTAS)("«%s» ordena igual que la web", (_clave, lista) => {
    expect(
      [...lista.ordenacion],
      "el panel enseñaría un orden y un invitado vería otro",
    ).toEqual(ordenacionDeLaWeb(lista.tabla));
  });

  it.each(LISTAS)("el alta de «%s» rellena todo lo que la tabla exige", (_clave, lista) => {
    /*
      LA COMPROBACIÓN QUE EVITA UN ALTA IMPOSIBLE. Una columna `not null` sin
      `default` que no esté entre los campos del formulario hace que cada alta
      reviente con un error de Postgres — y sólo se descubre pulsando «Añadir».
      Añadir una columna así a una de estas cuatro tablas pone este test rojo en
      el mismo `commit` que la introduce.
    */
    const obligatoriasEnLaBase = columnasDe(lista.tabla)
      .filter(
        (columna) => /\bnot null\b/.test(columna.resto) && !/\bdefault\b/.test(columna.resto),
      )
      .map((columna) => columna.nombre);

    const queRellenaLaPantalla = lista.campos.map((campo) => campo.columna);

    expect(
      obligatoriasEnLaBase.filter((columna) => !queRellenaLaPantalla.includes(columna)),
    ).toEqual([]);
  });

  it.each(LISTAS)(
    "y lo que «%s» marca obligatorio es lo que la base exige",
    (_clave, lista) => {
      /*
      En el otro sentido: un campo opcional en pantalla que la base declara `not
      null` deja pasar el formulario y revienta al escribir. Se comparan los dos
      lados en vez de confiar en que alguien se acuerde de tocar los dos sitios.
    */
      const columnas = columnasDe(lista.tabla);

      for (const campo of lista.campos) {
        const enLaBase = columnas.find((columna) => columna.nombre === campo.columna);
        const exigida = /\bnot null\b/.test(enLaBase?.resto ?? "");
        expect(campo.obligatorio, `${lista.tabla}.${campo.columna}`).toBe(exigida);
      }
    },
  );

  it.each(LISTAS)("«%s» se nombra por un campo que se rellena", (_clave, lista) => {
    /*
      LA COLUMNA QUE NOMBRA UNA FICHA NO ES SIEMPRE LA QUE LA ENCABEZA —en el
      programa encabeza la hora y nombra el título—, pero sí tiene que ser un
      campo del formulario y una columna de la tabla. Si no, la pregunta de
      borrar saldría vacía: «¿Borramos «»?».
    */
    const columnas = lista.campos.map((campo) => campo.columna);

    expect(columnas, `${lista.tabla}.${lista.columnaNombre}`).toContain(lista.columnaNombre);
    expect(nombresDe(lista.tabla)).toContain(lista.columnaNombre);

    // Y obligatorio, o habría fichas sin nombre con que preguntar.
    const campo = lista.campos.find((uno) => uno.columna === lista.columnaNombre);
    expect(campo?.obligatorio, `${lista.tabla}.${lista.columnaNombre}`).toBe(true);
  });

  it("el tope de orden es el del tipo de la columna", () => {
    // `orden` es `smallint` en las cuatro: pasarse de 32767 no se trunca, revienta.
    for (const [, lista] of LISTAS) {
      const orden = columnasDe(lista.tabla).find((columna) => columna.nombre === "orden");
      expect(orden?.resto, `${lista.tabla}.orden`).toContain("smallint");
    }
    expect(TOPE_ORDEN_CONTENIDO).toBe(32767);
  });
});

describe("a qué sección de la web va cada lista", () => {
  it.each(LISTAS)("«%s» llena la tabla que su sección lee", (clave, lista) => {
    const variantes =
      lista.destino.clase === "partida"
        ? lista.destino.opciones.map((opcion) => opcion.valor)
        : [undefined];

    for (const variante of variantes) {
      const origen = ORIGEN_DE_LA_SECCION[seccionDeLista(clave, variante)];

      /*
        `transporte` no entra por aquí, y es a propósito: lo que decide si esa
        sección sale son las COORDENADAS, no las rutas. Su excepción tiene test
        propio ahí abajo, para que siga siendo una decisión y no un despiste.
      */
      if (origen.clase !== "lista") continue;

      expect(origen.tabla).toBe(lista.tabla);
      if (variante && origen.filtro) {
        expect(origen.filtro.columna).toBe(
          lista.destino.clase === "partida" ? lista.destino.columna : "",
        );
        expect(origen.filtro.valor).toBe(variante);
      }
    }
  });

  it.each(LISTAS)("y el enlace de «%s» lleva a esta misma pantalla", (clave, lista) => {
    const variantes =
      lista.destino.clase === "partida"
        ? lista.destino.opciones.map((opcion) => opcion.valor)
        : [undefined];

    for (const variante of variantes) {
      const origen = ORIGEN_DE_LA_SECCION[seccionDeLista(clave, variante)];
      if (origen.clase === "sin-hacer" || origen.donde.pantalla !== "contenido") continue;

      expect(origen.donde.ruta, `${clave} → ${variante ?? "sin variante"}`).toBe(
        rutaDeLista(clave),
      );
    }
  });

  it("la excepción es «transporte», y sigue siendo la que se decidió", () => {
    /*
      SE ESCRIBEN RUTAS EN CONTENIDO Y EL ENLACE LLEVA A AJUSTES. Parece un
      fallo y no lo es: veinte rutas escritas no hacen aparecer la sección si no
      hay coordenadas, así que el enlace tiene que llevar a lo que de verdad
      falta. Si algún día esto cambia, que cambie a la vista.
    */
    const origen = ORIGEN_DE_LA_SECCION.transporte;

    expect(origen.clase).toBe("campo");
    if (origen.clase !== "campo") return;

    expect(origen.campo).toBe("latitud_ceremonia");
    expect(origen.donde.pantalla).toBe("ajustes");
    expect(LISTAS_DE_CONTENIDO.transporte.tabla).toBe("rutas_llegada");
  });
});

describe("las variantes de una lista partida", () => {
  it("el programa nace en el día de la boda", () => {
    expect(variantePorDefecto("programa")).toBe("boda");
    expect(seccionDeLista("programa", "boda")).toBe("programa");
    expect(seccionDeLista("programa", "preboda")).toBe("preboda");
  });

  it("una variante inventada cae en la primera, no en un hueco", () => {
    // Llega por la URL, así que viene de fuera: `?variante=cumpleaños`.
    expect(seccionDeLista("programa", "cumpleaños")).toBe("programa");
    expect(seccionDeLista("programa")).toBe("programa");
  });

  it("una lista sin partir no tiene variantes que elegir", () => {
    for (const clave of CLAVES_LISTA.filter((c) => c !== "programa") as ClaveLista[]) {
      expect(variantePorDefecto(clave)).toBeUndefined();
      // Y la variante que llegue por la URL no cambia a dónde va lo escrito.
      expect(seccionDeLista(clave, "lo-que-sea")).toBe(seccionDeLista(clave));
    }
  });

  it("cada lista vive bajo el módulo de contenido", () => {
    for (const clave of CLAVES_LISTA) {
      expect(rutaDeLista(clave)).toBe(`/panel/contenido/${clave}`);
    }
  });
});
