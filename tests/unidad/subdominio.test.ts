import { describe, expect, it } from "vitest";

import { RUTA_RESERVA_LA_FECHA } from "@/config/constants";
import { rutaEnElSubdominio } from "@/lib/subdominio";

const SUBDOMINIO = "savethedate.ejemplo.es";

describe("El Save the Date en su subdominio", () => {
  it("la raíz del subdominio sirve el Save the Date", () => {
    expect(rutaEnElSubdominio(SUBDOMINIO, "/", SUBDOMINIO)).toBe(RUTA_RESERVA_LA_FECHA);
  });

  it("da igual cómo venga escrito el host", () => {
    expect(rutaEnElSubdominio("SaveTheDate.Ejemplo.es", "/", SUBDOMINIO)).toBe(
      RUTA_RESERVA_LA_FECHA,
    );
    expect(rutaEnElSubdominio(`${SUBDOMINIO}.`, "/", SUBDOMINIO)).toBe(RUTA_RESERVA_LA_FECHA);
  });

  it("las demás rutas del subdominio siguen en su sitio", () => {
    expect(
      rutaEnElSubdominio(SUBDOMINIO, `${RUTA_RESERVA_LA_FECHA}/evento.ics`, SUBDOMINIO),
    ).toBe(null);
    expect(rutaEnElSubdominio(SUBDOMINIO, "/panel", SUBDOMINIO)).toBe(null);
  });

  it("el dominio principal no se toca: su raíz es la web", () => {
    expect(rutaEnElSubdominio("ejemplo.es", "/", SUBDOMINIO)).toBe(null);
    expect(rutaEnElSubdominio("www.ejemplo.es", "/", SUBDOMINIO)).toBe(null);
  });

  it("sin subdominio configurado, o sin host, no hay nada que servir", () => {
    expect(rutaEnElSubdominio(SUBDOMINIO, "/", undefined)).toBe(null);
    expect(rutaEnElSubdominio(SUBDOMINIO, "/", "  ")).toBe(null);
    expect(rutaEnElSubdominio(null, "/", SUBDOMINIO)).toBe(null);
  });
});
