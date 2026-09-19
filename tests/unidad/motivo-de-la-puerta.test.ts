import { describe, expect, it } from "vitest";

import { motivoDeLaPuerta } from "@/app/acceso/estado";

/**
 * «NO SE PUDO COMPROBAR» NO ES «NO TIENES ACCESO»
 *
 * Este fichero existe por un fallo que no da error, y que se coló porque las
 * dos respuestas negativas se parecen demasiado: cuando la lectura de
 * `perfiles` falla, `maybeSingle()` devuelve `data: null` — exactamente lo
 * mismo que devuelve cuando el perfil no existe. El código anotaba el error en
 * el registro, seguía de largo, y la comprobación de abajo (`!perfil?.activo`)
 * trataba las dos cosas igual.
 *
 * El efecto: quien acertaba su contraseña leía «esta cuenta existe, pero
 * todavía no tiene acceso al panel» porque la base había tardado demasiado en
 * contestar. Una afirmación sobre sus permisos, hecha sin haberlos leído, en la
 * única pantalla donde no puede comprobar nada por su cuenta — y que le manda a
 * dar de alta una cuenta que a lo mejor ya estaba dada.
 *
 * Las dos ramas SÍ cierran la sesión, las dos vuelven a la puerta, y por eso
 * nada se rompía: sólo cambiaba la frase. Por eso hace falta una prueba que
 * mire la frase.
 */

describe("motivoDeLaPuerta", () => {
  it("con el perfil activo deja pasar", () => {
    expect(motivoDeLaPuerta({ fallo: false, activo: true })).toBeNull();
  });

  it("con el perfil desactivado dice que no tiene acceso", () => {
    expect(motivoDeLaPuerta({ fallo: false, activo: false })).toBe("sin-acceso");
  });

  it("sin fila de perfil también: se miró, y no está dado de alta", () => {
    expect(motivoDeLaPuerta({ fallo: false, activo: null })).toBe("sin-acceso");
    expect(motivoDeLaPuerta({ fallo: false, activo: undefined })).toBe("sin-acceso");
  });

  it("si la lectura falla NO se afirma nada sobre sus permisos", () => {
    // Éste es el fallo entero: sin fila y con error se veía igual que sin fila
    // y sin error, y la web contestaba «no tienes acceso» sin haber mirado.
    expect(motivoDeLaPuerta({ fallo: true, activo: null })).toBe("error");
    expect(motivoDeLaPuerta({ fallo: true, activo: undefined })).toBe("error");
  });

  it("el fallo manda aunque la fila viniera: media respuesta no se interpreta", () => {
    expect(motivoDeLaPuerta({ fallo: true, activo: true })).toBe("error");
    expect(motivoDeLaPuerta({ fallo: true, activo: false })).toBe("error");
  });
});
