import { describe, expect, it } from "vitest";

import { instanteDesdeLocal, localDesdeInstante } from "@/lib/zona-horaria";

/**
 * BODA-44 · Las horas de la boda
 *
 * Este fichero existe por un fallo que no da error: si el texto del formulario
 * se interpreta con la zona del servidor —UTC en Vercel—, una ceremonia
 * guardada «a las 13:00» sale publicada a las 15:00 en verano. Todo válido,
 * todo verde, y la hora equivocada en la web.
 *
 * Se prueba contra `Europe/Madrid`, que es la zona de la boda, y en las dos
 * mitades del año: en invierno va +1 y en verano +2.
 */

const MADRID = "Europe/Madrid";

describe("instanteDesdeLocal", () => {
  it("interpreta una hora de verano con el desfase de verano (+2)", () => {
    // 26 de junio de 2027, la boda. Madrid va +2 en junio.
    const instante = instanteDesdeLocal("2027-06-26T13:00", MADRID);
    expect(instante?.toISOString()).toBe("2027-06-26T11:00:00.000Z");
  });

  it("interpreta una hora de invierno con el desfase de invierno (+1)", () => {
    const instante = instanteDesdeLocal("2027-01-15T13:00", MADRID);
    expect(instante?.toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });

  it("no se deja arrastrar por la zona del servidor", () => {
    // La misma pared horaria en dos zonas distintas tiene que dar dos
    // instantes distintos. Si el código usara la del proceso, saldrían iguales.
    const madrid = instanteDesdeLocal("2027-06-26T13:00", MADRID);
    const canarias = instanteDesdeLocal("2027-06-26T13:00", "Atlantic/Canary");
    expect(madrid?.toISOString()).not.toBe(canarias?.toISOString());
  });

  it("acepta segundos y los respeta", () => {
    expect(instanteDesdeLocal("2027-06-26T13:00:30", MADRID)?.toISOString()).toBe(
      "2027-06-26T11:00:30.000Z",
    );
  });

  it("devuelve null cuando no hay fecha, en lugar de inventarse una", () => {
    // Un campo opcional vacío es un valor legítimo, no un error.
    for (const texto of ["", "   ", "2027-06-26", "mañana", "2027-13-45T99:99"]) {
      expect(instanteDesdeLocal(texto, MADRID), `"${texto}" debería ser null`).toBeNull();
    }
  });
});

describe("localDesdeInstante", () => {
  it("devuelve el formato exacto que espera datetime-local", () => {
    const texto = localDesdeInstante(new Date("2027-06-26T11:00:00.000Z"), MADRID);
    expect(texto).toBe("2027-06-26T13:00");
    expect(texto).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("aplica el desfase de invierno", () => {
    expect(localDesdeInstante(new Date("2027-01-15T12:00:00.000Z"), MADRID)).toBe(
      "2027-01-15T13:00",
    );
  });

  it("es la vuelta exacta de instanteDesdeLocal", () => {
    // Ida y vuelta sin perder nada: es la garantía de que abrir el formulario,
    // no tocar nada y guardar no mueve la hora de la boda.
    for (const texto of ["2027-06-26T13:00", "2027-01-15T09:30", "2027-10-30T23:59"]) {
      const instante = instanteDesdeLocal(texto, MADRID)!;
      expect(localDesdeInstante(instante, MADRID)).toBe(texto);
    }
  });

  it("con una fecha inválida devuelve cadena vacía y no «Invalid Date»", () => {
    expect(localDesdeInstante(new Date("no es una fecha"), MADRID)).toBe("");
  });
});
