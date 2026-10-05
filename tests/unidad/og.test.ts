import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ESCALA_OG } from "../../src/config/tokens.generado";
import { FORMATO_FECHA_OG } from "../../src/lib/og";

/**
 * LA TARJETA DE WHATSAPP, CON TOKENS Y CON LA FECHA DE LA MARCA.
 *
 * Nombraba a mano tamaños y huecos (26, 104, 96, 30 px…) y su contenido no
 * cabía en el margen: se salía por abajo. Y las dos tarjetas escribían la misma
 * fecha de dos maneras.
 */
const RAIZ = join(__dirname, "..", "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");

describe("la imagen para compartir", () => {
  it("no escribe medidas a mano: salen de la escala de tokens", () => {
    const fuente = leer("src/lib/og.tsx");
    expect(fuente).not.toMatch(
      /(fontSize|letterSpacing|margin\w*|padding\w*|lineHeight):\s*-?\d{2,}/,
    );
    expect(fuente).not.toMatch(/padding:\s*"\d/);
  });

  it("el contenido cabe dentro del margen, con aire arriba y abajo", () => {
    const e = ESCALA_OG;
    const conPie =
      e.textoEtiqueta * 1.2 +
      e.hueco +
      e.textoNombres * 2 +
      (e.textoConector - 2 * e.solapeConector) +
      e.huecoPie +
      e.hueco +
      e.filete +
      e.textoPie * 1.2;
    expect(conPie).toBeLessThanOrEqual(630 - 2 * e.margenVertical);
  });

  it("las dos tarjetas usan la misma fecha, sin día de la semana", () => {
    const fecha = FORMATO_FECHA_OG.format(new Date("2027-04-24T10:00:00Z"));
    expect(fecha).toBe("24 de abril de 2027");
    for (const ruta of [
      "src/app/opengraph-image.tsx",
      "src/app/reserva-la-fecha/opengraph-image.tsx",
    ]) {
      const fuente = leer(ruta);
      expect(fuente, ruta).toContain("FORMATO_FECHA_OG");
      expect(fuente, ruta).not.toContain("weekday");
    }
  });
});
