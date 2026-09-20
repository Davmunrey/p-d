import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BODA-09 · Ninguna página que lea de la base se puede prerenderizar
 *
 * Este test existe por un fallo real en producción. La landing llevaba
 * `export const revalidate = 3600`, así que se generaba en el despliegue y se
 * servía desde caché. El caso bueno iba bien; el malo, no: el despliegue del 9
 * de agosto se hizo sin `DATABASE_URL`, horneó la pantalla de «estamos
 * preparando la web» y la sirvió **durante una hora**, aunque la base hubiera
 * vuelto en diez segundos.
 *
 * Es un fallo silencioso —build en verde, tests en verde, web sin datos— y por
 * eso lleva guardián, y en la causa y no en el síntoma. Si alguien vuelve a
 * poner `revalidate` en una página que lee de la base, esto se pone rojo.
 */

const RAIZ = join(__dirname, "..", "..");

/** Lee un fichero fuente sin comentarios, para no dispararse con uno. */
function leer(ruta: string) {
  return readFileSync(join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * LA LISTA SE BUSCA, NO SE ESCRIBE.
 *
 * Estaban enumeradas a mano dos páginas, y por ahí se coló el fallo: `/cocina`
 * pasó a leer la configuración para enseñar el monograma de verdad, nadie la
 * añadió aquí, y al no ser dinámica Next intentó prerenderizarla. La base iba
 * por detrás del código, la lectura falló, y se cayó el DESPLIEGUE ENTERO por
 * una página de catálogo que nadie visita.
 *
 * Una lista escrita a mano sólo protege de lo que ya conocías. Ahora se
 * recorren todas las páginas que importan de `@/lib/bbdd/`, que es la
 * definición exacta de «lee de la base».
 */
/**
 * Si un fichero lee de la base, DIRECTA O INDIRECTAMENTE. Mirar sólo la
 * importación directa dejaba fuera a toda página que leyera a través de un
 * componente —seis componentes importan de `@/lib/bbdd/`—, y una página así
 * sin `force-dynamic` se prerrenderizaría en el despliegue con lo que hubiera
 * en la base, que es exactamente el fallo que este test existe para cazar.
 * Se siguen las importaciones (`@/` y relativas) hasta encontrar `lib/bbdd/`.
 */
function leeDeLaBase(ruta: string, vistos = new Set<string>()): boolean {
  if (vistos.has(ruta)) return false;
  vistos.add(ruta);
  const fuente = leer(ruta);
  if (fuente.includes("@/lib/bbdd/")) return true;

  for (const [, especificador] of fuente.matchAll(/from\s+"([^"]+)"/g)) {
    const destino = especificador.startsWith("@/")
      ? `src/${especificador.slice(2)}`
      : especificador.startsWith(".")
        ? join(dirname(ruta), especificador)
        : null;
    if (!destino) continue;
    const fichero = [".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((sufijo) => `${destino}${sufijo}`)
      .find((candidato) => existsSync(join(RAIZ, candidato)));
    if (fichero && leeDeLaBase(fichero, vistos)) return true;
  }
  return false;
}

function paginasQueLeenDeLaBase(): string[] {
  const encontradas: string[] = [];

  const recorrer = (carpeta: string) => {
    for (const entrada of readdirSync(join(RAIZ, carpeta), { withFileTypes: true })) {
      const ruta = `${carpeta}/${entrada.name}`;
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name === "page.tsx" && leeDeLaBase(ruta)) encontradas.push(ruta);
    }
  };

  recorrer("src/app");
  return encontradas.sort();
}

const PAGINAS_CON_DATOS = paginasQueLeenDeLaBase();

it("se encuentran las páginas que leen de la base", () => {
  // Si un día no encuentra ninguna, el barrido se ha roto y los tests de abajo
  // pasarían en vacío, que es la forma de fallar que no se ve.
  expect(PAGINAS_CON_DATOS.length).toBeGreaterThan(20);
  expect(PAGINAS_CON_DATOS).toContain("src/app/page.tsx");
  expect(PAGINAS_CON_DATOS).toContain("src/app/cocina/page.tsx");
  // Ésta lee sólo a través de su formulario y sus acciones: sin seguir las
  // importaciones no aparecía.
  expect(PAGINAS_CON_DATOS).toContain("src/app/panel/invitados/importar/page.tsx");
});

describe.each(PAGINAS_CON_DATOS)("%s", (ruta) => {
  const fuente = leer(ruta);

  it("se declara dinámica", () => {
    expect(fuente).toMatch(/export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  });

  it("no revalida por tiempo: eso cachearía también los fallos", () => {
    expect(fuente).not.toMatch(/export\s+const\s+revalidate/);
  });
});

describe("La ruta del calendario", () => {
  const fuente = leer("src/app/reserva-la-fecha/evento.ics/route.ts");

  it("también es dinámica", () => {
    expect(fuente).toMatch(/export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
  });

  it("responde 503 y no 404 cuando la base falla", () => {
    // Un 404 le diría a un cliente de calendario que el evento ya no existe, y
    // hay clientes que lo borran. Un 503 le dice que vuelva a intentarlo.
    expect(fuente).toContain("status: 503");
  });
});

describe("La capa de acceso a la base", () => {
  const fuente = leer("src/lib/bbdd/cliente.ts");

  it("propaga la avería en lugar de devolver un hueco", () => {
    // Devolviendo `null` tanto para «no hay filas» como para «no he podido
    // preguntar», quien llama no puede distinguirlas y acaba tratando una
    // avería como un resultado válido — que es lo que se cacheaba.
    expect(fuente).toContain("throw new ErrorDeLectura");
    expect(fuente).toMatch(/Promise<T>/);
  });
});
