import { describe, expect, it } from "vitest";

import { UMBRAL_AVISO_PRESUPUESTO } from "../../src/config/constants";
import { desviosDe, loQueVaCostando, type FilaDeCategoria } from "../../src/lib/desvios";

/**
 * BODA-64 · El aviso de desvío presupuestario
 *
 * ESTO SE PRUEBA AQUÍ Y NO SÓLO EN UN E2E porque lo que hay que comprobar son
 * los bordes de una decisión —justo en el umbral, justo por encima, sin
 * presupuesto— y montar media boda en la base para cada uno de ellos convierte
 * cinco comprobaciones de una línea en cinco minutos de navegador.
 *
 * El E2E comprueba lo otro: que el aviso llega de verdad a la portada.
 */

function categoria(nombre: string, previsto: number, vaCostando: number): FilaDeCategoria {
  return {
    categoriaId: `id-${nombre}`,
    categoria: nombre,
    importePrevisto: previsto,
    // La vista da la desviación, no lo que va costando: se construye la fila
    // como la construiría ella, o el test estaría probando otra cosa.
    desviacion: previsto - vaCostando,
  };
}

describe("Lo que va costando", () => {
  it("se despeja de la desviación, que es quien manda", () => {
    expect(loQueVaCostando(categoria("Flores", 1000, 850))).toBe(850);
  });

  it("también cuando se ha pasado", () => {
    expect(loQueVaCostando(categoria("Catering", 8000, 9200))).toBe(9200);
  });
});

describe("Qué categorías se están yendo de madre", () => {
  it("no dice nada de lo que va holgado", () => {
    expect(desviosDe([categoria("Flores", 1000, 400)])).toEqual([]);
  });

  it("avisa de lo que se ha pasado", () => {
    const [aviso] = desviosDe([categoria("Catering", 8000, 9200)]);
    expect(aviso.grado).toBe("superado");
    expect(aviso.vaCostando).toBe(9200);
  });

  /**
   * EL UMBRAL SE PRUEBA EN SU BORDE, que es donde un `>` en vez de un `>=`
   * dejaría pasar justo el caso que el aviso existe para coger.
   */
  it("avisa justo al llegar al umbral", () => {
    const enElBorde = 1000 * UMBRAL_AVISO_PRESUPUESTO;
    const [aviso] = desviosDe([categoria("Música", 1000, enElBorde)]);
    expect(aviso?.grado).toBe("cerca");
  });

  it("no avisa un céntimo por debajo del umbral", () => {
    const justoDebajo = 1000 * UMBRAL_AVISO_PRESUPUESTO - 0.01;
    expect(desviosDe([categoria("Música", 1000, justoDebajo)])).toEqual([]);
  });

  it("gastar exactamente lo previsto es «cerca», no «superado»", () => {
    const [aviso] = desviosDe([categoria("Fotos", 2000, 2000)]);
    expect(aviso.grado).toBe("cerca");
  });

  /**
   * SIN PRESUPUESTO NO HAY DESVÍO. Una categoría a cero no es una que se haya
   * pasado: es una que nadie ha presupuestado todavía. Avisar de ella sacaría un
   * aviso rojo el primer día, y un aviso que aparece sin que nadie haya hecho
   * nada mal enseña a no mirarlos.
   */
  it("calla sobre las categorías sin presupuesto, aunque tengan gasto", () => {
    expect(desviosDe([categoria("Sin calcular", 0, 500)])).toEqual([]);
  });

  it("lo peor va primero, y dentro de cada grado lo que más se ha pasado", () => {
    const orden = desviosDe([
      categoria("Flores", 1000, 950), // cerca
      categoria("Barra", 3000, 3100), // superado por 100
      categoria("Catering", 8000, 9200), // superado por 1200
      categoria("Coche", 500, 100), // ni se menciona
    ]).map((desvio) => desvio.categoria);

    expect(orden).toEqual(["Catering", "Barra", "Flores"]);
  });
});
