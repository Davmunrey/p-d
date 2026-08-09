import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PALETAS } from "@/config/tokens.generado";

/**
 * BODA-32 · Los tokens generados no pueden quedarse atrás
 *
 * `src/config/tokens.generado.ts` lleva los colores de la marca en crudo, para
 * los sitios donde se pinta sin CSS: hoy la imagen que sale en WhatsApp, mañana
 * los correos. Es el único fichero de TypeScript con literales, y por eso está
 * exento de la regla de ESLint.
 *
 * El riesgo es evidente: alguien cambia la paleta en el CSS, no regenera, y la
 * web queda de un color y la tarjeta de WhatsApp de otro. Nadie lo vería hasta
 * que alguien comparte el enlace.
 *
 * Este test regenera y compara. Si difieren, el CI se pone rojo.
 */

const RAIZ = join(__dirname, "..", "..");
const GENERADO = join(RAIZ, "src", "config", "tokens.generado.ts");

describe("tokens.generado.ts", () => {
  it("está al día con el CSS", () => {
    const antes = readFileSync(GENERADO, "utf8");
    execFileSync("node", [join(RAIZ, "scripts", "generar-tokens.mjs")], { cwd: RAIZ });
    const despues = readFileSync(GENERADO, "utf8");

    expect(despues).toBe(antes);
  });

  it("los valores son literales resueltos, no referencias a var()", () => {
    // Si se colara un `var(--algo)`, la imagen saldría sin color: en un lienzo
    // sin CSS no hay nada que resuelva esa referencia.
    for (const paleta of Object.values(PALETAS)) {
      for (const valor of Object.values(paleta)) {
        expect(valor).not.toContain("var(");
        expect(valor).toMatch(/^#[0-9a-f]{3,8}$/i);
      }
    }
  });

  it("el bloque inverso de verdad se diferencia del claro", () => {
    // Si alguien rompiera la resolución de la capa semántica, lo más probable
    // es que las dos paletas acabaran siendo la misma.
    expect(PALETAS.inversa.fondo).not.toBe(PALETAS.claro.fondo);
    expect(PALETAS.inversa.tinta).not.toBe(PALETAS.claro.tinta);
  });

  it("hay contraste suficiente entre el texto y el fondo de la tarjeta", () => {
    // La tarjeta de WhatsApp también se lee: no vale que salga bonita y
    // ilegible. AA para texto grande exige 3:1.
    const luminancia = (hex: string) => {
      const n = hex.slice(1);
      const completo = n.length === 3 ? [...n].map((c) => c + c).join("") : n;
      const canales = [0, 2, 4].map((i) => parseInt(completo.slice(i, i + 2), 16) / 255);
      const lineal = canales.map((v) =>
        v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2];
    };

    const claro = Math.max(
      luminancia(PALETAS.inversa.fondo),
      luminancia(PALETAS.inversa.tinta),
    );
    const oscuro = Math.min(
      luminancia(PALETAS.inversa.fondo),
      luminancia(PALETAS.inversa.tinta),
    );

    expect((claro + 0.05) / (oscuro + 0.05)).toBeGreaterThanOrEqual(3);
  });
});
