import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

/** Todos los `.tsx` de la aplicación y de los componentes. */
function componentes(): string[] {
  const encontrados: string[] = [];
  const recorrer = (carpeta: string) => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (entrada.name.endsWith(".tsx")) encontrados.push(ruta);
    }
  };
  recorrer(join(RAIZ, "src"));
  return encontrados;
}

/**
 * UN `<Boton type="submit">` SE PUEDE PULSAR DOS VECES.
 *
 * `BotonEnvio` se apaga mientras la acción corre; `Boton` a secas no. Con
 * conexión lenta, dos toques en «Quitar» mandaban dos borrados: el primero
 * borraba y el segundo tocaba cero filas y contestaba otra cosa. Se cambiaron
 * todos los botones de envío, pero cuatro con el `type` en otra línea se
 * quedaron fuera porque nada lo vigilaba.
 *
 * La expresión cruza líneas y deja pasar las flechas (`=>`) de los props, que
 * es donde una búsqueda ingenua del `>` de cierre se pararía antes de tiempo.
 */
describe("Los botones de envío no se pulsan dos veces", () => {
  it("ningún <Boton> de la aplicación es de tipo submit: para eso está BotonEnvio", () => {
    const BOTON_QUE_ENVIA = /<Boton\s(?:[^>]|=>)*?type="submit"/g;
    const infractores = componentes()
      .filter((ruta) => !ruta.endsWith(join("components", "ui", "boton-envio.tsx")))
      .flatMap((ruta) => {
        const texto = readFileSync(ruta, "utf8");
        return [...texto.matchAll(BOTON_QUE_ENVIA)].map(
          (hallado) =>
            `${relative(RAIZ, ruta)}:${texto.slice(0, hallado.index).split("\n").length}`,
        );
      });

    expect(infractores, "cámbialos por BotonEnvio").toEqual([]);
  });

  it("la búsqueda encuentra el caso que se escapó: el type en otra línea", () => {
    const BOTON_QUE_ENVIA = /<Boton\s(?:[^>]|=>)*?type="submit"/g;
    const escapado = `<Boton\n  onClick={() => hacer()}\n  type="submit"\n>`;
    expect(escapado.match(BOTON_QUE_ENVIA)).toHaveLength(1);
    expect(`<BotonEnvio\n  type="submit"\n>`.match(BOTON_QUE_ENVIA)).toBeNull();
  });
});
