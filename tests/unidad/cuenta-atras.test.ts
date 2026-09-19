import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * LA CUENTA ATRÁS NO PUEDE MIRAR EL RELOJ MIENTRAS PINTA
 *
 * El componente presume —con razón, y está escrito en su cabecera— de que el
 * servidor entrega el HTML con los números ya puestos, para que se vea antes de
 * que cargue ningún JavaScript. Eso sólo es verdad si al hidratar sale lo
 * MISMO: el servidor pinta unos segundos y, si el cliente calcula los suyos con
 * `Date.now()`, casi nunca coinciden. React encuentra entonces un HTML distinto
 * del que esperaba, tira el árbol entero y lo repinta en el cliente (#418), que
 * es justo perder el beneficio que se buscaba.
 *
 * MEDIDO ANTES DE ARREGLARLO: 7 de cada 30 cargas de la landing daban el
 * desajuste, y de ahí salía además el «Element is not attached to the DOM» que
 * hacía inestable a `navegacion.spec.ts` — el árbol se rehacía debajo de los
 * nodos que la prueba ya tenía cogidos. Con el instante del servidor, 0 de 30.
 *
 * ESTE TEST MIRA EL FUENTE Y NO EL NAVEGADOR, y es a propósito. El fallo sólo
 * aparece cuando la hidratación cruza el límite de un segundo: una prueba que
 * cargue la página una vez pasaría cuatro de cada cinco veces SIN el arreglo, y
 * eso no es un guardián, es una moneda al aire. La condición que de verdad hay
 * que sostener es estructural —el primer pintado no depende del reloj— y eso sí
 * se puede afirmar de una vez.
 */

const RUTA = join(__dirname, "..", "..", "src", "components", "marketing", "cuenta-atras.tsx");
const FUENTE = readFileSync(RUTA, "utf8");

/**
 * Sin comentarios, que es lo único que se puede afirmar de verdad: la cabecera
 * del componente EXPLICA el fallo y para explicarlo escribe `Date.now()`. Un
 * test que contara las apariciones en el fichero entero estaría contando prosa.
 */
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("la cuenta atrás y la hidratación", () => {
  it("siembra su estado con el instante que le da el servidor", () => {
    expect(CODIGO).toContain("ahoraIso: string");

    /*
      Se afirma sobre el CÁLCULO, no sobre la línea entera: dónde parte la línea
      y si lleva coma final lo decide prettier, y un test que persiga eso se
      rompe el día que cambie el ancho de columna sin que nada esté mal.
    */
    const sinEspacios = CODIGO.replace(/\s+/g, " ");

    expect(sinEspacios, "el estado sigue sembrándose con una función").toContain(
      "useState(() =>",
    );
    expect(
      sinEspacios,
      "el primer valor tiene que salir de una propiedad, no del reloj del cliente",
    ).toContain("calcular(objetivo, new Date(ahoraIso).getTime())");
  });

  it("y sólo mira el reloj dentro del efecto, nunca al pintar", () => {
    const inicioDelEfecto = CODIGO.indexOf("useEffect(");
    expect(inicioDelEfecto, "ya no hay efecto: este test hay que repensarlo").toBeGreaterThan(
      0,
    );

    const antesDelEfecto = CODIGO.slice(0, inicioDelEfecto);

    expect(
      [...antesDelEfecto.matchAll(/Date\.now\(\)/g)].length,
      "un `Date.now()` antes del efecto vuelve a romper la hidratación",
    ).toBe(0);
  });
});
