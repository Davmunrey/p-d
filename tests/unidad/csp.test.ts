import { describe, expect, it } from "vitest";

import { construirCsp } from "../../src/lib/csp";

/**
 * La Content-Security-Policy que emite el middleware.
 *
 * Se prueba la función pura: que cada origen real de la web esté donde toca,
 * que lo que no se usa no se abra, y que el nonce viaje. Que Next lo mete en
 * sus scripts y que ninguna pantalla lo viola lo prueba el E2E.
 */
const ORIGENES = {
  supabase: "https://abc.supabase.co",
  posthog: "https://eu.i.posthog.com",
  sentry: "https://o1.ingest.sentry.io/api/2/envelope/",
  mapa: "https://www.openstreetmap.org/export/embed.html?bbox=1",
  desarrollo: false,
};

describe("construirCsp", () => {
  const csp = construirCsp("nonce-de-prueba", ORIGENES);
  const directiva = (nombre: string) =>
    csp
      .split("; ")
      .find((d) => d.startsWith(`${nombre} `))
      ?.slice(nombre.length + 1);

  it("los scripts van con nonce y strict-dynamic, sin unsafe-inline ni eval en producción", () => {
    expect(directiva("script-src")).toContain("'nonce-nonce-de-prueba'");
    expect(directiva("script-src")).toContain("'strict-dynamic'");
    expect(directiva("script-src")).toContain("https://eu.i.posthog.com");
    expect(directiva("script-src")).not.toContain("'unsafe-inline'");
    expect(directiva("script-src")).not.toContain("'unsafe-eval'");
  });

  it("en desarrollo sí admite eval, que es lo que necesita el modo de desarrollo de Next", () => {
    expect(construirCsp("n", { ...ORIGENES, desarrollo: true })).toContain("'unsafe-eval'");
  });

  it("las imágenes y el vídeo vienen del bucket; la conexión, de la analítica y los avisos", () => {
    expect(directiva("img-src")).toBe("'self' data: blob: https://abc.supabase.co");
    expect(directiva("media-src")).toBe("'self' https://abc.supabase.co");
    expect(directiva("connect-src")).toBe(
      "'self' https://eu.i.posthog.com https://o1.ingest.sentry.io",
    );
    expect(directiva("frame-src")).toBe("https://www.openstreetmap.org");
  });

  it("nadie nos enmarca, ningún plugin, ningún formulario a otro sitio", () => {
    expect(directiva("frame-ancestors")).toBe("'none'");
    expect(directiva("object-src")).toBe("'none'");
    expect(directiva("form-action")).toBe("'self'");
    expect(directiva("base-uri")).toBe("'self'");
  });

  it("sin un servicio configurado, su origen no se abre", () => {
    const sinNada = construirCsp("n", { mapa: ORIGENES.mapa, desarrollo: false });
    expect(sinNada).toContain("connect-src 'self';");
    expect(sinNada).toContain("img-src 'self' data: blob:;");
    expect(sinNada).not.toContain("undefined");
    expect(sinNada).not.toContain("null");
  });

  it("un origen mal escrito no rompe la cabecera: se omite", () => {
    const roto = construirCsp("n", { ...ORIGENES, supabase: "esto no es una url" });
    expect(roto).toContain("img-src 'self' data: blob:;");
  });
});
