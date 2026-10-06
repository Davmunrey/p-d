import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SECCIONES } from "@/config/secciones";
import { TIPOS_MEDIBLES } from "@/lib/dimensiones";
import {
  seccionEnsenaMedios,
  tiposQuePinta,
  visibilidadEnLaWeb,
  type MedioParaPintar,
} from "@/lib/medios-en-la-web";

/**
 * «PUBLICADO» NO ES «SE VE EN LA WEB».
 *
 * El gestor de medios marcaba «En la web» todo lo publicado, y la landing
 * pinta mucho menos: una foto en la portada, las que tienen medidas en la
 * galería, las elegidas en fichas en historia y alojamiento, y ninguna en el
 * resto. Aquí se prueba la regla, y abajo que sigue diciendo lo que la web lee.
 */

const foto = (id: string, extra: Partial<MedioParaPintar> = {}): MedioParaPintar => ({
  id,
  publicado: true,
  tipo: "imagen",
  ancho: 1200,
  alto: 800,
  ...extra,
});

const nadie = new Set<string>();

describe("visibilidadEnLaWeb", () => {
  it("en la portada sólo se ve la primera publicada", () => {
    const v = visibilidadEnLaWeb(
      "portada",
      [foto("borrador", { publicado: false }), foto("a"), foto("b")],
      nadie,
    );
    expect(v.get("a")).toEqual({ seVe: true });
    expect(v.get("b")).toEqual({ seVe: false, motivo: "solo-la-primera" });
    expect(v.get("borrador")).toEqual({ seVe: false, motivo: "borrador" });
  });

  it("en la tarjeta del Save the Date, la primera FOTO: un vídeo delante no cuenta", () => {
    const v = visibilidadEnLaWeb(
      "reserva_la_fecha",
      [foto("video", { tipo: "video" }), foto("foto")],
      nadie,
    );
    expect(v.get("foto")).toEqual({ seVe: true });
    expect(v.get("video")).toEqual({ seVe: false, motivo: "solo-la-primera-foto" });
  });

  it("en la galería, todas las fotos con medidas y ningún vídeo", () => {
    const v = visibilidadEnLaWeb(
      "galeria",
      [
        foto("a"),
        foto("b"),
        foto("avif", { ancho: null, alto: null }),
        foto("v", { tipo: "video" }),
      ],
      nadie,
    );
    expect(v.get("a")).toEqual({ seVe: true });
    expect(v.get("b")).toEqual({ seVe: true });
    expect(v.get("avif")).toEqual({ seVe: false, motivo: "sin-medidas" });
    // Un vídeo no es una foto sin medir: no sale nunca, y se dice así.
    expect(v.get("v")).toEqual({ seVe: false, motivo: "solo-fotos" });
  });

  it("en historia y alojamiento, sólo la que elige una ficha", () => {
    const v = visibilidadEnLaWeb(
      "alojamiento",
      [foto("elegida"), foto("suelta")],
      new Set(["elegida"]),
    );
    expect(v.get("elegida")).toEqual({ seVe: true });
    expect(v.get("suelta")).toEqual({ seVe: false, motivo: "sin-ficha" });
  });

  it("un vídeo en historia no «sale cuando se elige»: el selector sólo ofrece fotos", () => {
    const v = visibilidadEnLaWeb("historia", [foto("v", { tipo: "video" })], nadie);
    expect(v.get("v")).toEqual({ seVe: false, motivo: "solo-fotos" });
  });

  it("con la sección apagada no se ve nada de lo publicado, y lo demás sigue en borrador", () => {
    const v = visibilidadEnLaWeb(
      "portada",
      [foto("a"), foto("borrador", { publicado: false })],
      nadie,
      false,
    );
    expect(v.get("a")).toEqual({ seVe: false, motivo: "seccion-oculta" });
    expect(v.get("borrador")).toEqual({ seVe: false, motivo: "borrador" });
  });

  it("en las secciones que no enseñan fotos, ninguna, aunque esté publicada", () => {
    const v = visibilidadEnLaWeb("programa", [foto("a")], nadie);
    expect(v.get("a")).toEqual({ seVe: false, motivo: "seccion-sin-medios" });
    expect(seccionEnsenaMedios("programa")).toBe(false);
  });

  it("sólo seis partes de la web enseñan medios", () => {
    expect(SECCIONES.filter(seccionEnsenaMedios).sort()).toEqual(
      ["alojamiento", "galeria", "historia", "paisaje", "portada", "reserva_la_fecha"].sort(),
    );
  });
});

describe("tiposQuePinta: sólo se deja subir lo que esa parte de la web enseña", () => {
  it("portada y paisaje, foto o vídeo", () => {
    expect(tiposQuePinta("portada")).toContain("video/mp4");
    expect(tiposQuePinta("paisaje")).toContain("image/avif");
  });

  it("la tarjeta, historia y alojamiento, sólo fotos", () => {
    for (const seccion of ["reserva_la_fecha", "historia", "alojamiento"] as const) {
      expect(
        tiposQuePinta(seccion).every((tipo) => tipo.startsWith("image/")),
        seccion,
      ).toBe(true);
      expect(tiposQuePinta(seccion), seccion).toContain("image/jpeg");
    }
  });

  it("la galería, sólo lo que se sabe medir: ni vídeo ni AVIF", () => {
    expect([...tiposQuePinta("galeria")].sort()).toEqual([...TIPOS_MEDIBLES].sort());
  });

  it("y donde la web no enseña medios, nada", () => {
    expect(tiposQuePinta("programa")).toEqual([]);
  });
});

describe("la regla es la que lee la web", () => {
  const RAIZ = join(__dirname, "..", "..");
  const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");

  it("la portada y el paisaje pintan la primera de su lista", () => {
    const portada = leer("src/app/page.tsx");
    expect(portada).toMatch(/fotosPortada\[0\]/);
    expect(portada).toMatch(/fotosPaisaje\[0\]/);
  });

  it("el Save the Date pinta la primera foto", () => {
    expect(leer("src/app/reserva-la-fecha/page.tsx")).toMatch(
      /fotos\.find\(\(medio\) => medio\.tipo === "imagen"\)/,
    );
  });

  it("la galería exige foto con medidas", () => {
    const landing = leer("src/lib/bbdd/landing.ts");
    const galeria = landing.slice(landing.indexOf("export async function obtenerGaleria"));
    expect(galeria).toMatch(/tipo = 'imagen'/);
    expect(galeria).toMatch(/ancho is not null/);
    expect(galeria).toMatch(/alto is not null/);
  });
});
