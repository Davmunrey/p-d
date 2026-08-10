import { readdirSync, readFileSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BODA-17 · La tipografía es la de la entrega
 *
 * La escala tipográfica se degrada igual que la paleta y con el mismo
 * silencio: alguien baja un titular «que se salía» en un móvil concreto,
 * nadie lo mira en el grande, y al cabo de un mes la web va un 15 % por
 * debajo de lo diseñado sin que ningún test se entere.
 *
 * Estos valores están copiados de `Sistema completo de boda/Entrega para
 * Figma.dc.html`, sección 01. Si alguien cambia uno, que sea a propósito.
 */

const RAIZ = join(__dirname, "..", "..");

function leer(ruta: string) {
  return readFileSync(join(RAIZ, ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("escala tipográfica", () => {
  const css = leer("src/styles/tokens/primitives.css");

  /** `--font-size-display` → `clamp(3.625rem, 9.2vw, 7.75rem)` */
  function valor(token: string) {
    return css.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1].trim();
  }

  it("las tres familias son las de la entrega", () => {
    expect(valor("font-family-serif")).toContain("Cormorant Infant");
    expect(valor("font-family-sans")).toContain("Jost");
    expect(valor("font-family-conector")).toContain("Italianno");
  });

  it("Cormorant Garamond ya no aparece: es otra letra, no otro nombre", () => {
    expect(css).not.toContain("Cormorant Garamond");
  });

  it.each([
    // token, mínimo y máximo en px según la hoja de entrega
    ["font-size-display", 58, 124],
    ["font-size-titulo-1", 38, 68],
    ["font-size-conector", 44, 104],
  ])("--%s cubre el rango entregado (%s–%s px)", (token, minimo, maximo) => {
    const bruto = valor(token)!;
    const remes = [...bruto.matchAll(/([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);

    expect(remes.length, `--${token} debería ser un clamp con dos extremos`).toBe(2);
    expect(Math.round(remes[0])).toBe(minimo);
    expect(Math.round(remes[1])).toBe(maximo);
  });

  it.each([
    ["font-size-titulo-3", 27],
    ["font-size-cita", 24],
    ["font-size-cuerpo", 16],
    ["font-size-etiqueta", 11],
    ["font-size-pequeno", 13],
  ])("--%s mide %s px", (token, px) => {
    expect(Math.round(Number(valor(token)!.replace("rem", "")) * 16)).toBe(px);
  });

  it.each([
    ["line-height-display", "0.92"],
    ["line-height-titulo", "1.02"],
    ["line-height-titulo-corto", "1.1"],
    ["line-height-titulo-menor", "1.2"],
    ["line-height-cita", "1.5"],
    ["line-height-cuerpo", "1.65"],
  ])("--%s vale %s", (token, esperado) => {
    expect(valor(token)).toBe(esperado);
  });

  it("los títulos 2 y 3 no comparten interlínea", () => {
    // La entrega les da 1.1 y 1.2. Compartir token los igualaba, y el título
    // pequeño quedaba apretado.
    expect(valor("line-height-titulo-corto")).not.toBe(valor("line-height-titulo-menor"));
  });
});

/**
 * ITALIANNO, CON CERROJO
 *
 * «Sólo el conector «y» y el ampersand. Una vez por pieza», dice la entrega.
 * No es capricho: es una letra con tantísima personalidad que repetida deja de
 * ser un respiro y se convierte en ruido. El cerrojo es que sólo la nombre el
 * componente que existe para eso.
 */
describe("el conector", () => {
  /**
   * Tres sitios pueden nombrar Italianno, y cada uno por una razón distinta:
   *
   * - `layout.tsx` la CARGA. Alguien tiene que pedírsela a Google.
   * - `og.tsx` la PINTA SIN CSS: la tarjeta de WhatsApp se dibuja en un lienzo
   *   donde no hay hoja de estilos que resuelva un token, así que ahí el
   *   nombre de la familia va escrito a mano por fuerza.
   * - `tipografia.tsx` la USA, y es el único que puede.
   *
   * Cualquier otro fichero que la nombre la está repitiendo, que es justo lo
   * que la entrega prohíbe.
   */
  const PERMITIDOS = [
    "src/app/layout.tsx",
    "src/lib/og.tsx",
    "src/components/ui/tipografia.tsx",
  ];

  /** Todos los `.ts`/`.tsx` bajo `src/`, con la ruta en forma POSIX. */
  function ficheros(directorio: string): string[] {
    return readdirSync(join(RAIZ, directorio), { withFileTypes: true }).flatMap((entrada) => {
      const ruta = `${directorio}/${entrada.name}`;
      if (entrada.isDirectory()) return ficheros(ruta);
      return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
    });
  }

  it("ningún componente usa Italianno por su cuenta", () => {
    const culpables: string[] = [];

    for (const ruta of ficheros("src")) {
      const normalizada = ruta.split(sep).join(posix.sep);
      if (PERMITIDOS.includes(normalizada)) continue;
      if (
        /font-conector|fuente-conector|Italianno/.test(readFileSync(join(RAIZ, ruta), "utf8"))
      ) {
        culpables.push(normalizada);
      }
    }

    expect(
      culpables,
      "Italianno se usa a través de <Conector>. Si hace falta en otro sitio, es que " +
        "el componente se queda corto, no que haya que repetir la fuente: la entrega " +
        "la limita al conector y al ampersand, una vez por pieza.",
    ).toEqual([]);
  });
});
