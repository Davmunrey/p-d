import { describe, expect, it } from "vitest";

import { PESO_MAXIMO_DOCUMENTO_MB, TIPOS_DOCUMENTO_ADMITIDOS } from "@/config/constants";
import { admitirDocumento, componerRutaDocumento } from "@/lib/documentos";

/**
 * BODA-72 · LO QUE SE DECIDE ANTES DE TOCAR STORAGE
 *
 * Estas dos funciones son la primera línea de defensa del bucket de contratos, y
 * son puras: se pueden probar entera sin levantar nada. Lo que sigue son los
 * casos que de verdad llegan —el vídeo arrastrado por error, el escaneo de
 * cuarenta megas— y la forma de la ruta, que la base vuelve a comprobar con
 * `es_ruta_almacenamiento_valida`.
 */

const UN_MEGA = 1024 * 1024;

/** La misma expresión que `public.es_ruta_almacenamiento_valida`. */
const RUTA_VALIDA = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,254}$/;

const PROVEEDOR = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("admitirDocumento()", () => {
  it("admite todos los tipos que admite el bucket", () => {
    for (const tipo of TIPOS_DOCUMENTO_ADMITIDOS) {
      expect(admitirDocumento({ type: tipo, size: 1000 }).admitido, tipo).toBe(true);
    }
  });

  it("rechaza por TIPO lo que no es un papel, aunque pese poco", () => {
    // El caso real: se arrastra el vídeo de la finca a la carpeta de contratos.
    expect(admitirDocumento({ type: "video/mp4", size: 10 })).toEqual({
      admitido: false,
      motivo: "tipo",
    });
  });

  it("mira el tipo ANTES que el peso", () => {
    /*
      Un vídeo de cuarenta megas se rechaza por «tipo» y no por «peso»: decirle
      a alguien que pesa demasiado le hace comprimirlo y volver a intentarlo dos
      veces para nada.
    */
    const veredicto = admitirDocumento({ type: "video/mp4", size: 40 * UN_MEGA });
    expect(veredicto).toEqual({ admitido: false, motivo: "tipo" });
  });

  it("rechaza por peso justo por encima del tope, y admite justo en el tope", () => {
    const tope = PESO_MAXIMO_DOCUMENTO_MB * UN_MEGA;

    expect(admitirDocumento({ type: "application/pdf", size: tope }).admitido).toBe(true);
    expect(admitirDocumento({ type: "application/pdf", size: tope + 1 })).toEqual({
      admitido: false,
      motivo: "peso",
    });
  });

  it("la extensión sale del tipo declarado, no del nombre del fichero", () => {
    // Un JPEG llamado «contrato.pdf» se guarda como `.jpg`: la ruta describe lo
    // que hay dentro.
    expect(admitirDocumento({ type: "image/jpeg", size: 10 })).toEqual({
      admitido: true,
      extension: "jpg",
    });
  });
});

describe("componerRutaDocumento()", () => {
  it("cuelga el fichero del proveedor y la base la acepta", () => {
    const ruta = componerRutaDocumento(PROVEEDOR, "pdf", "a1b2c3d4e5f6");

    expect(ruta).toBe(`${PROVEEDOR}/a1b2c3d4e5f6.pdf`);
    expect(ruta).toMatch(RUTA_VALIDA);
  });

  it("nunca empieza por barra ni lleva travesía de directorios", () => {
    const ruta = componerRutaDocumento(PROVEEDOR, "png", "000000000000");

    expect(ruta.startsWith("/")).toBe(false);
    expect(ruta).not.toContain("..");
  });
});
