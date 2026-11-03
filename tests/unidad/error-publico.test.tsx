import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorPublico from "@/app/error";
import { RUTA_RETRATO_DE_ESTRELLAS } from "@/config/constants";
import { t } from "@/lib/copy";

/**
 * LA PANTALLA DE ERROR PIDE EL RETRATO APARTE
 *
 * Se pinta en el navegador y no puede preguntar a la base, así que pide las
 * estrellas a una ruta y las dibuja cuando llegan. Lo que se comprueba es lo
 * que puede ir mal: que si llegan se dibujan, y que si no llegan —no hay
 * retrato, o ha caído justo la base— la pantalla sigue entera, sin dibujo.
 */

const RETRATO = {
  proporcion: 0.9,
  estrellas: Array.from({ length: 12 }, (_, i) => [i / 12, 0.5, i % 4 === 0 ? 1 : 0.6]),
};

async function pintar() {
  await act(async () => {
    render(<ErrorPublico error={new Error("prueba")} retry={() => {}} />);
  });
  // Deja correr la petición y el `setState` de después.
  await act(async () => {
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
}

describe("La pantalla de error de la parte pública", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("pide el retrato a su ruta y lo dibuja encima del titular", async () => {
    const pedir = vi.fn(async () => Response.json(RETRATO));
    vi.stubGlobal("fetch", pedir);

    await pintar();

    expect(pedir).toHaveBeenCalledWith(RUTA_RETRATO_DE_ESTRELLAS, expect.anything());
    const dibujo = document.querySelector("[data-retrato-estado]");
    expect(dibujo).not.toBeNull();
    expect(dibujo!.getAttribute("aria-hidden")).toBe("true");
    expect(dibujo!.querySelectorAll("circle").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      t("errores.falloTitulo"),
    );
  });

  it("si la base ha caído, sale sin dibujo y con sus dos salidas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("sin red");
      }),
    );

    await pintar();

    expect(document.querySelector("[data-retrato-estado]")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: t("errores.reintentar") })).toBeTruthy();
    expect(screen.getByRole("link", { name: t("errores.volverAlInicio") })).toBeTruthy();
  });

  it("sin retrato publicado (404), tampoco hay dibujo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    await pintar();

    expect(document.querySelector("[data-retrato-estado]")).toBeNull();
  });

  it("unas estrellas que no son un retrato no se dibujan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ proporcion: -1, estrellas: "no" })),
    );

    await pintar();

    expect(document.querySelector("[data-retrato-estado]")).toBeNull();
  });
});
