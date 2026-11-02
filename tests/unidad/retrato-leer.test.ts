// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { retratoDeLaFoto, siluetaDeLaFoto } from "../../src/lib/retrato/leer";

/**
 * LO QUE SUBE EL PANEL, LEÍDO DE VERDAD: ficheros fabricados con `sharp`, la
 * misma librería con la que se leen. Un círculo opaco sobre fondo
 * transparente es una foto recortada; la misma foto en JPG no lo es.
 */
const LADO = 300;
const circuloSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}">` +
    `<circle cx="150" cy="150" r="110" fill="#c8a165"/></svg>`,
);

async function recortada(formato: "png" | "webp"): Promise<Uint8Array> {
  const imagen = sharp(circuloSvg);
  return new Uint8Array(await (formato === "png" ? imagen.png() : imagen.webp()).toBuffer());
}

describe("retratoDeLaFoto", () => {
  it("de un PNG recortado salen sus estrellas", async () => {
    const retrato = await retratoDeLaFoto(await recortada("png"));
    expect(retrato).not.toBeNull();
    expect(retrato!.proporcion).toBeCloseTo(1, 1);
    expect(retrato!.estrellas.length).toBeGreaterThan(30);
  });

  it("y de un WebP recortado, también", async () => {
    expect(await retratoDeLaFoto(await recortada("webp"))).not.toBeNull();
  });

  it("se lee reducida: el lado mayor no pasa del de análisis", async () => {
    const grande = new Uint8Array(await sharp(circuloSvg).resize(1200, 1200).png().toBuffer());
    const silueta = await siluetaDeLaFoto(grande, 200);
    expect(Math.max(silueta!.ancho, silueta!.alto)).toBeLessThanOrEqual(200);
  });

  // CASOS DE ERROR: el panel lo rechaza con «no está recortada».
  it("una foto sin canal alfa —un JPG— no tiene retrato", async () => {
    const jpg = new Uint8Array(
      await sharp(circuloSvg).flatten({ background: "#0e1424" }).jpeg().toBuffer(),
    );
    expect(await retratoDeLaFoto(jpg)).toBeNull();
  });

  it("un PNG con canal alfa pero sin recortar, tampoco", async () => {
    const opaco = new Uint8Array(
      await sharp({
        create: {
          width: 120,
          height: 120,
          channels: 4,
          background: { r: 9, g: 9, b: 9, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
    );
    expect(await retratoDeLaFoto(opaco)).toBeNull();
  });

  it("y unos bytes que no son una imagen, tampoco, sin lanzar", async () => {
    expect(await retratoDeLaFoto(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
