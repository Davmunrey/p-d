import { describe, expect, it } from "vitest";

import {
  ANCLA_NUEVA,
  ANCLA_PLANO,
  ANCLA_REPARTO,
  ANCLA_SIN_MESA,
  ANCLA_SIN_RESPUESTA,
  anclaDeMesa,
  rutaDeAncla,
} from "../../src/app/panel/mesas/estado";
import { PESTANAS } from "../../src/config/modulos";
import { RUTA_MESAS, RUTA_MESAS_PLANO, RUTA_MESAS_REPARTO } from "../../src/config/constants";

/**
 * CADA ACCIÓN DE LAS MESAS VUELVE A LA PESTAÑA DE LA QUE SALIÓ.
 *
 * Las mesas son tres vistas, y el formulario que se envía dice desde cuál con
 * su ancla. Si una de ellas cae en la vista equivocada, el aviso no sale
 * —su sitio no está en esa pantalla— y la acción parece no haber hecho nada,
 * que es justo el fallo que llevó a poner anclas.
 */
describe("A qué vista vuelve cada ancla de las mesas", () => {
  const MESA = anclaDeMesa("8c0d4f6e-2a1b-4c3d-9e8f-7a6b5c4d3e2f");

  it("las dos bolsas vuelven a «Por sentar»", () => {
    expect(rutaDeAncla(ANCLA_SIN_MESA)).toBe(RUTA_MESAS);
    expect(rutaDeAncla(ANCLA_SIN_RESPUESTA)).toBe(RUTA_MESAS);
  });

  it("colocar y empujar vuelven al plano", () => {
    expect(rutaDeAncla(ANCLA_PLANO)).toBe(RUTA_MESAS_PLANO);
  });

  it("el bloque de una mesa, el alta y la cabecera vuelven a «Mesa a mesa»", () => {
    expect(rutaDeAncla(MESA)).toBe(RUTA_MESAS_REPARTO);
    expect(rutaDeAncla(ANCLA_NUEVA)).toBe(RUTA_MESAS_REPARTO);
    expect(rutaDeAncla(ANCLA_REPARTO)).toBe(RUTA_MESAS_REPARTO);
  });

  it("sin ancla, o con una que no es de aquí, a la raíz", () => {
    expect(rutaDeAncla(undefined)).toBe(RUTA_MESAS);
    expect(rutaDeAncla("")).toBe(RUTA_MESAS);
    expect(rutaDeAncla("cualquier-cosa")).toBe(RUTA_MESAS);
  });

  it("toda vista a la que se vuelve es una de las pestañas de las mesas", () => {
    const pestanas = PESTANAS.mesas.map((pestana) => pestana.ruta);
    for (const ancla of [ANCLA_SIN_MESA, ANCLA_PLANO, ANCLA_NUEVA, ANCLA_REPARTO, MESA]) {
      expect(pestanas).toContain(rutaDeAncla(ancla));
    }
  });
});
