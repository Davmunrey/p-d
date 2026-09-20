import { afterEach, describe, expect, it, vi } from "vitest";

import { leerUrl, urlDeConfirmacionDeAcceso } from "../../src/lib/url-sitio";

/**
 * UNA VARIABLE MAL ESCRITA NO PUEDE TUMBAR EL BUILD
 *
 * Esto no es una precaución teórica: pasó. `NEXT_PUBLIC_SITE_URL` se puso como
 * `midominio.com`, sin `https://`, y el despliegue entero se cayó con un
 * «invalid_url» que ni siquiera decía qué variable era. El navegador perdona
 * esa forma; `new URL()` no.
 *
 * Lo que se prueba aquí es que ningún valor —ni el descuidado, ni el absurdo—
 * consigue lanzar. Devolver `null` degrada la vista previa al compartir; lanzar
 * deja la boda sin web.
 */

describe("Leer la dirección del sitio", () => {
  it("completa el esquema cuando falta, que es el descuido de siempre", () => {
    expect(leerUrl("midominio.com")?.toString()).toBe("https://midominio.com/");
    expect(leerUrl("p-d.vercel.app")?.toString()).toBe("https://p-d.vercel.app/");
  });

  it("respeta el esquema que ya venga", () => {
    expect(leerUrl("https://midominio.com")?.protocol).toBe("https:");
    // En local se trabaja con http, y no hay que reescribírselo a nadie.
    expect(leerUrl("http://localhost:3000")?.toString()).toBe("http://localhost:3000/");
  });

  it("no se atraganta con espacios de un copiar y pegar", () => {
    expect(leerUrl("  https://midominio.com  ")?.toString()).toBe("https://midominio.com/");
  });

  it("devuelve null en lugar de lanzar cuando no hay valor", () => {
    expect(leerUrl(undefined)).toBeNull();
    expect(leerUrl(null)).toBeNull();
    expect(leerUrl("")).toBeNull();
    expect(leerUrl("   ")).toBeNull();
  });

  it("ningún disparate consigue lanzar", () => {
    // Si alguno de éstos lanzara, se llevaría por delante el despliegue.
    for (const disparate of ["https://", "http://", "://roto", "https://espacio malo", "%%%"]) {
      expect(() => leerUrl(disparate), disparate).not.toThrow();
    }
  });
});

/**
 * La vuelta del correo de recuperación de contraseña.
 *
 * Con el dominio sin esquema —como se ha escrito ya en producción— `new URL`
 * lanzaba dentro de la acción, el `catch` lo tragaba y la pantalla decía «ya
 * está en camino» sin haber pedido nada. Pasa por `urlDelSitio()`, que
 * completa el esquema, y devuelve `null` en vez de lanzar cuando no hay nada.
 */
describe("La dirección a la que vuelve el correo de recuperación", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("completa el esquema cuando la variable viene sin él", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "paloma-david.vercel.app");
    expect(urlDeConfirmacionDeAcceso("/acceso/confirmar")).toBe(
      "https://paloma-david.vercel.app/acceso/confirmar",
    );
  });

  it("respeta el dominio con esquema", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(urlDeConfirmacionDeAcceso("/acceso/confirmar")).toBe(
      "http://localhost:3000/acceso/confirmar",
    );
  });

  it("sin dominio no inventa nada: null, para que la acción no diga «enviado»", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    expect(urlDeConfirmacionDeAcceso("/acceso/confirmar")).toBeNull();
  });
});
