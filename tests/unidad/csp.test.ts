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
  whatsapp: "https://wa.me/",
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

  it("las imágenes y el vídeo vienen del bucket; la conexión, del bucket, la analítica y los avisos", () => {
    expect(directiva("img-src")).toBe("'self' data: blob: https://abc.supabase.co");
    expect(directiva("media-src")).toBe("'self' https://abc.supabase.co");
    // El bucket, porque el panel sube las fotos del navegador a Storage.
    expect(directiva("connect-src")).toBe(
      "'self' https://abc.supabase.co https://eu.i.posthog.com https://o1.ingest.sentry.io",
    );
    expect(directiva("frame-src")).toBe("https://www.openstreetmap.org");
  });

  it("nadie nos enmarca, ningún plugin, ningún formulario a otro sitio que no sea nuestro", () => {
    expect(directiva("frame-ancestors")).toBe("'none'");
    expect(directiva("object-src")).toBe("'none'");
    expect(directiva("base-uri")).toBe("'self'");
  });

  /*
    «Descargar» un documento es un formulario cuya acción redirige a la URL
    firmada de Storage, y el navegador aplica `form-action` también a esa
    redirección. Con sólo `'self'`, sin JavaScript —o pulsando antes de que
    cargue— el contrato no se descargaba.
  */
  it("los formularios pueden acabar en el bucket, que es adonde redirigen las descargas", () => {
    expect(directiva("form-action")).toBe("'self' https://abc.supabase.co https://wa.me");
  });

  /*
    Y WhatsApp: «Abrir WhatsApp» anota el envío y redirige a `wa.me`. Sin su
    origen, sin JavaScript, la invitación quedaba «mandada» y WhatsApp no se
    abría nunca.
  */
  it("los formularios pueden acabar en WhatsApp, que es adonde lleva repartir", () => {
    expect(directiva("form-action")).toContain("https://wa.me");
  });

  it("y sin Supabase configurado, sólo en la propia web", () => {
    const sinNada = construirCsp("n", {
      mapa: ORIGENES.mapa,
      whatsapp: ORIGENES.whatsapp,
      desarrollo: false,
    });
    expect(sinNada).toContain("form-action 'self' https://wa.me;");
  });

  it("sin un servicio configurado, su origen no se abre", () => {
    const sinNada = construirCsp("n", {
      mapa: ORIGENES.mapa,
      whatsapp: ORIGENES.whatsapp,
      desarrollo: false,
    });
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
