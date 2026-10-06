import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import copy from "../../content/copy.es.json";
import type { EstadoDeSeccion } from "../../src/lib/bbdd/contenido";

/**
 * LA PANTALLA DE SECCIONES CUANDO LA BASE NO DA LO ESPERADO
 *
 * Dos casos que el E2E no alcanza sin romper una base que comparten todos: que
 * no se puedan leer las secciones, y encender una que no tiene con qué
 * pintarse. Los dos acababan en una pantalla que no decía la verdad: en blanco
 * sin explicación, y «Ya se ve en la web» de algo que no sale.
 */

const secciones = vi.fn<() => Promise<EstadoDeSeccion[] | null>>();

vi.mock("@/lib/sesion", () => ({ accesoActual: async () => ({ rol: "editor" }) }));
vi.mock("@/lib/bbdd/contenido", () => ({ obtenerEstadoDeLasSecciones: () => secciones() }));
vi.mock("../../src/app/panel/contenido/acciones", () => ({
  alternarVisible: vi.fn(),
  moverSeccion: vi.fn(),
}));

async function pintar(consulta: Record<string, string> = {}): Promise<string> {
  const { default: PaginaContenido } = await import("../../src/app/panel/contenido/page");
  return renderToStaticMarkup(
    await PaginaContenido({ searchParams: Promise.resolve(consulta) }),
  );
}

const galeria = (llena: boolean): EstadoDeSeccion => ({
  seccion: "galeria",
  visible: true,
  orden: 1,
  elementos: llena ? 3 : 0,
  llena,
});

describe("las secciones de la web en el panel", () => {
  beforeEach(() => secciones.mockReset());

  it("si no se pueden leer, lo dice en vez de enseñar una lista vacía", async () => {
    secciones.mockResolvedValue(null);
    const html = await pintar();

    expect(html).toContain('role="alert"');
    expect(html).toContain(copy.panel.contenido.errorLeer);
    expect(html).not.toContain("<ol");
  });

  it("encender una sección vacía no dice que ya se ve", async () => {
    secciones.mockResolvedValue([galeria(false)]);
    const html = await pintar({ estado: "mostrada", seccion: "galeria" });

    expect(html).not.toContain(copy.panel.contenido.avisoMostrada);
    expect(html).toContain(
      copy.panel.contenido.avisoMostradaSinContenido.replace(
        "{seccion}",
        copy.navegacion.secciones.galeria,
      ),
    );
  });

  it("encender una con contenido sí dice que ya se ve", async () => {
    secciones.mockResolvedValue([galeria(true)]);
    const html = await pintar({ estado: "mostrada", seccion: "galeria" });

    expect(html).toContain(copy.panel.contenido.avisoMostrada);
  });
});
