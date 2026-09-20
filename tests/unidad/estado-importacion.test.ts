import { describe, expect, it } from "vitest";

import {
  ESTADO_INICIAL,
  estadoVigente,
  type EstadoImportacion,
} from "../../src/app/panel/invitados/importar/estado";

/**
 * Cuál de los dos estados de la importación se pinta.
 *
 * El fallo que esto cierra: tras una confirmación fallida, un análisis nuevo
 * se hacía en el servidor y se tiraba en el navegador, porque la regla miraba
 * el CONTENIDO del estado de confirmar («si trae previa o aviso, manda») y no
 * cuál de los dos era el más reciente. La pantalla se quedaba clavada hasta
 * recargar, sin decirlo.
 */
const previa = (serie: number, extra: Partial<EstadoImportacion> = {}): EstadoImportacion => ({
  ...ESTADO_INICIAL,
  fase: "previa",
  filas: [
    { grupo: `Grupo ${serie}`, nombre: "Ana", apellidos: null, lado: "ambos", nino: false },
  ],
  contenido: `csv ${serie}`,
  serie,
  ...extra,
});

describe("estadoVigente", () => {
  it("sin confirmación todavía, se pinta el análisis", () => {
    const analisis = previa(1);
    expect(estadoVigente(analisis, ESTADO_INICIAL)).toBe(analisis);
    expect(estadoVigente(ESTADO_INICIAL, ESTADO_INICIAL)).toBe(ESTADO_INICIAL);
  });

  it("una confirmación fallida del MISMO análisis manda: enseña sus errores", () => {
    const fallo = previa(1, {
      errores: [{ linea: 2, motivo: "Ya está dada de alta" }],
    });
    expect(estadoVigente(previa(1), fallo)).toBe(fallo);

    const averia = previa(1, { aviso: "No se pudo importar." });
    expect(estadoVigente(previa(1), averia)).toBe(averia);
  });

  it("EL CASO: un análisis nuevo gana a la confirmación fallida del anterior", () => {
    const falloViejo = previa(1, { errores: [{ linea: 2, motivo: "Ya está dada de alta" }] });
    const analisisNuevo = previa(2);

    expect(estadoVigente(analisisNuevo, falloViejo)).toBe(analisisNuevo);
    // Y no al revés: el contenido viejo no vuelve a aparecer.
    expect(estadoVigente(analisisNuevo, falloViejo).contenido).toBe("csv 2");
  });

  it("la regla vieja habría fallado exactamente aquí", () => {
    const falloViejo = previa(1, { aviso: "No se pudo importar." });
    const analisisNuevo = previa(2);
    const reglaVieja =
      falloViejo.fase === "previa" || falloViejo.aviso ? falloViejo : analisisNuevo;

    expect(reglaVieja).toBe(falloViejo);
    expect(estadoVigente(analisisNuevo, falloViejo)).not.toBe(reglaVieja);
  });
});
