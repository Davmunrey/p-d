import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import copy from "../../content/copy.es.json";

/**
 * SIN LA CLAVE DE SERVICIO, EL GESTOR DE MEDIOS LO DICE Y NO SUBE NADA
 *
 * La configuración de Playwright deja `SUPABASE_SERVICE_ROLE_KEY` vacía fuera
 * del trabajo con Supabase y prometía que así «el camino de no está
 * configurado se recorre en cada ejecución». No se recorría: la pantalla de
 * medios exige sesión, y sin Supabase no hay sesión; donde hay sesión, la clave
 * sí llega. Es el camino que se ve el día del despliegue si falta la variable,
 * así que se prueba aquí, con la clave ausente y una sesión de editor.
 */

const redirigir = vi.fn((destino: string) => {
  throw new Error(`REDIRIGE ${destino}`);
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => redirigir(destino),
  RedirectType: { replace: "replace", push: "push" },
}));
vi.mock("@/lib/supabase/servicio", () => ({
  haySubidaDeMedios: false,
  clienteDeServicio: () => {
    throw new Error("sin clave no se crea el cliente de servicio");
  },
}));
vi.mock("@/lib/supabase/servidor", () => ({
  hayAutenticacion: true,
  clienteServidor: () => {
    throw new Error("no debería tocar la base sin clave de servicio");
  },
}));
vi.mock("@/lib/sesion", () => ({ accesoActual: async () => ({ rol: "editor" }) }));
vi.mock("@/lib/bbdd/medios", () => ({
  obtenerMediosDelPanel: async () => [{ seccion: "portada", medios: [] }],
  obtenerMediosElegidosEnFichas: async () => new Set<string>(),
}));
vi.mock("@/lib/bbdd/contenido", () => ({ obtenerEstadoDeLasSecciones: async () => null }));
vi.mock("@/lib/bbdd/landing", () => ({ obtenerConfiguracion: async () => null }));

describe("sin SUPABASE_SERVICE_ROLE_KEY", () => {
  beforeEach(() => {
    vi.resetModules();
    redirigir.mockClear();
  });

  it("la pantalla de medios avisa de que falta configurarla", async () => {
    const { default: PaginaMedios } = await import("../../src/app/panel/medios/page");
    const html = renderToStaticMarkup(
      await PaginaMedios({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain(copy.panel.medios.errorSinConfigurar);
  });

  it("subir vuelve con «sin-configurar» antes de tocar nada", async () => {
    const { subirMedio } = await import("../../src/app/panel/medios/acciones");
    const datos = new FormData();
    datos.set("seccion", "portada");
    datos.set("texto_alternativo", "Una foto de prueba");

    await expect(subirMedio(datos)).rejects.toThrow(/estado=sin-configurar/);
    expect(redirigir).toHaveBeenCalledTimes(1);
  });

  /*
    BORRAR TAMPOCO. Sin la clave se podía quitar la fila, pero el fichero se
    quedaba en el bucket público —accesible por su enlace— y la pantalla
    felicitaba con «Borrado, también el fichero».
  */
  it("borrar vuelve con «sin-configurar» sin tocar la base", async () => {
    const { borrarMedio } = await import("../../src/app/panel/medios/acciones");
    const datos = new FormData();
    datos.set("medio_id", "00000000-0000-4000-8000-000000000001");
    datos.set("confirmado", "si");

    await expect(borrarMedio(datos)).rejects.toThrow(/estado=sin-configurar/);
    expect(redirigir).toHaveBeenCalledTimes(1);
  });
});
