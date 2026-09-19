import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * UNA LECTURA QUE NO SE PUDO HACER NO ES UN PERMISO
 *
 * La mayoría de los lectores de `src/lib/bbdd/` devuelven `[]` cuando la
 * consulta falla, y para casi todos está bien: alimentan una pantalla, y una
 * pantalla vacía es un mal menor.
 *
 * Unos pocos no alimentan una pantalla: DECIDEN SI SE ESCRIBE. «¿Hay ya alguien
 * contratado en esta categoría?», «¿cuánta gente está sentada en esta mesa?».
 * Para ésos, `[]` y `0` no son un valor neutro: son exactamente la respuesta que
 * concede el permiso. Una consulta que falla pasa entonces por un «adelante», y
 * el guardia que existía para preguntar antes se salta sin que nada lo diga.
 *
 * Pasó dos veces el mismo día, en sitios distintos y por el mismo motivo. De ahí
 * esta lista.
 *
 * LO QUE COMPRUEBA ES LA FIRMA, Y NO HACE FALTA MÁS. En cuanto el tipo dice
 * `| null`, TypeScript obliga a todo el que llame a decidir qué hace con ese
 * `null` antes de tocar `.length` o comparar el número — y esa parte la vigila
 * `tsc` en cada compilación, mejor de lo que la vigilaría un barrido de texto.
 * Lo único que `tsc` no puede impedir es que alguien «simplifique» la firma de
 * vuelta a `[]`, que es justo por donde volvería el fallo. Eso es lo de aquí.
 */

const RAIZ = join(__dirname, "..", "..");

/**
 * Los lectores cuyo resultado decide una escritura, con lo que decide cada uno.
 *
 * Añadir a esta lista es barato; quitar de ella tiene que doler, porque es
 * decir que ese dato ya no condiciona nada.
 */
const DECIDEN_UNA_ESCRITURA = [
  {
    fichero: "src/lib/bbdd/proveedores.ts",
    funcion: "obtenerContratadosDeCategoria",
    decide: "si se pregunta antes de contratar a un segundo de la misma categoría",
  },
  {
    fichero: "src/lib/bbdd/mesas.ts",
    funcion: "contarSentados",
    decide: "si cabe alguien más en la mesa",
  },
];

describe("las lecturas que deciden una escritura", () => {
  it("hay lecturas en la lista", () => {
    expect(DECIDEN_UNA_ESCRITURA.length).toBeGreaterThan(0);
  });

  for (const lectura of DECIDEN_UNA_ESCRITURA) {
    it(`${lectura.funcion} distingue «no hay» de «no se pudo leer»`, () => {
      const fuente = readFileSync(join(RAIZ, lectura.fichero), "utf8");
      /*
        El tipo se captura hasta el `>` de `Promise<…>` y no hasta la primera
        llave: `Promise<{ id: string }[] | null>` LLEVA llaves dentro, y un
        `[^{]+` se para en ellas — el primer intento de este test daba falso
        negativo por eso, que es la forma más tonta de tener un guardián roto.
      */
      const declaracion = fuente.match(
        new RegExp(
          `export async function ${lectura.funcion}\\b[\\s\\S]*?\\)\\s*:\\s*(Promise<[\\s\\S]*?>)\\s*\\{`,
        ),
      );

      expect(
        declaracion,
        `no se encuentra ${lectura.funcion} en ${lectura.fichero}`,
      ).not.toBeNull();

      const devuelve = declaracion![1];
      expect(
        devuelve.includes("| null"),
        `${lectura.funcion} decide ${lectura.decide}: tiene que poder decir «no lo sé» con null, ` +
          `porque una lista vacía o un cero son la respuesta que CONCEDE el permiso`,
      ).toBe(true);

      // Y que el error no se traduzca a un valor inocente por dentro.
      const cuerpo = fuente.slice(declaracion!.index!);
      const hastaElSiguiente = cuerpo.slice(0, cuerpo.indexOf("\nexport ") + 1 || undefined);
      const ramaDelError = hastaElSiguiente.match(/if \(error\)[\s\S]{0,200}?return ([^;]+);/);

      expect(
        ramaDelError,
        `${lectura.funcion} ya no mira el error de la consulta`,
      ).not.toBeNull();
      expect(
        ramaDelError![1].trim(),
        `${lectura.funcion} devuelve un valor inocente cuando la consulta falla`,
      ).toBe("null");
    });
  }
});
