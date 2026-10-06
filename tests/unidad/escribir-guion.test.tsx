import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import copy from "../../content/copy.es.json";
import { ORDEN_MAXIMO } from "../../src/config/constants";

/**
 * LA PANTALLA DONDE SE ESCRIBE EL GUION, PINTADA CON CADA ROL
 *
 * El E2E recorre el ciclo entero con la cuenta de propietario. Lo que no puede
 * recorrer sin otra cuenta es lo que ve un lector —el guion sin formularios—,
 * ni el número que se propone al añadir, que depende de lo que ya haya.
 */

const guion = vi.fn();
const acceso = vi.fn();

vi.mock("@/lib/bbdd/dia", () => ({ obtenerGuion: () => guion() }));
vi.mock("@/lib/sesion", () => ({ accesoActual: () => acceso() }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));
vi.mock("../../src/app/panel/dia/guion/acciones", () => ({
  crearPunto: async () => {},
  editarPunto: async () => {},
  borrarPunto: async () => {},
}));

const PUNTOS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    hora: "12:30",
    titulo: "(DES) Salida del autobús",
    responsable: "(DES) El conductor",
    notas: null,
    orden: 3,
    hechoEn: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    hora: "al acabar el cóctel",
    titulo: "(DES) Brindis",
    responsable: null,
    notas: "(DES) Copas en la mesa de los novios",
    orden: 7,
    hechoEn: "2026-10-06T10:00:00Z",
  },
];

async function pintar(consulta: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import("../../src/app/panel/dia/guion/page");
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(consulta) }));
}

const escribir = copy.panel.dia.escribir;

describe("escribir el guion", () => {
  beforeEach(() => {
    vi.resetModules();
    guion.mockResolvedValue(PUNTOS);
    acceso.mockResolvedValue({ rol: "editor" });
  });

  it("un editor ve el alta, y cada punto con su corrección y su botón de quitar", async () => {
    const html = await pintar();
    expect(html).toContain(escribir.nuevoTitulo);
    expect(html).toContain(escribir.editarEste.replace("{titulo}", "(DES) Brindis"));
    expect(html).toContain(escribir.borrarEste.replace("{titulo}", "(DES) Salida del autobús"));
    expect(html).not.toContain(escribir.soloMirar);
  });

  it("el alta propone el orden siguiente al último", async () => {
    const html = await pintar();
    // El primer campo de orden de la página es el del alta.
    expect(html).toMatch(/name="orden"[^>]*value="8"/);
  });

  it("el orden propuesto no pasa del tope de la columna", async () => {
    guion.mockResolvedValue([{ ...PUNTOS[0], orden: ORDEN_MAXIMO }]);
    const html = await pintar();
    expect(html).toMatch(new RegExp(`name="orden"[^>]*value="${ORDEN_MAXIMO}"`));
  });

  it("un lector ve el guion sin un solo formulario", async () => {
    acceso.mockResolvedValue({ rol: "lector" });
    const html = await pintar();
    expect(html).toContain(escribir.soloMirar);
    expect(html).toContain("(DES) Brindis");
    expect(html).not.toContain("<form");
  });

  it("al volver de un error, el punto que se corregía sigue abierto", async () => {
    const html = await pintar({ estado: "largo", punto: PUNTOS[1].id });
    expect(html).toContain(escribir.avisos.largo);
    expect((html.match(/<details open=""/g) ?? []).length).toBe(1);
  });

  it("sin puntos lo dice, en vez de una lista vacía", async () => {
    guion.mockResolvedValue([]);
    const html = await pintar();
    expect(html).toContain(escribir.vacio);
  });
});
