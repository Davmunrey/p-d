import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const PAGINAS_CON_DATOS = ["src/app/page.tsx", "src/app/reserva-la-fecha/page.tsx"];

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
