import { describe, expect, it } from "vitest";

import { construirIcs } from "@/lib/calendario";

/**
 * BODA-31 · Formato iCalendar
 *
 * Las tres cosas que rompen un `.ics` en producción no se ven en pantalla: el
 * plegado de líneas, el escapado de comas y los finales de línea. Se prueban
 * aquí, en unitarios, porque comprobarlas por E2E significaría abrir el
 * fichero en tres clientes de calendario distintos.
 */

const GENERADO = new Date("2026-08-09T10:00:00.000Z");
const INICIO = new Date("2027-02-26T11:00:00.000Z");
const FIN = new Date("2027-02-26T17:00:00.000Z");

function base() {
  return {
    identificador: "boda-2027-02-26@ejemplo.test",
    titulo: "Ana y Luis",
    inicio: INICIO,
    fin: FIN,
    generadoEn: GENERADO,
  };
}

/** Deshace el plegado, para poder comprobar el valor entero de una propiedad. */
function desplegar(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

/** Deshace el escapado. Es lo que hace un cliente de calendario al leerlo. */
function desescapar(texto: string): string {
  return texto
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

describe("construirIcs", () => {
  it("envuelve el evento en un calendario válido", () => {
    const ics = construirIcs(base());

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("VERSION:2.0");
  });

  it("todas las líneas acaban en CRLF", () => {
    const ics = construirIcs(base());

    // Un `.ics` con saltos de Unix no lo abre Outlook. Se comprueba que no
    // queda ni un `\n` suelto.
    expect(/[^\r]\n/.test(ics)).toBe(false);
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("las fechas van en UTC, sin guiones ni dos puntos", () => {
    const ics = construirIcs(base());

    expect(ics).toContain("DTSTART:20270226T110000Z");
    expect(ics).toContain("DTEND:20270226T170000Z");
    expect(ics).toContain("DTSTAMP:20260809T100000Z");
  });

  it("si no se da fin, el evento no se queda abierto", () => {
    const ics = construirIcs({ ...base(), fin: null });

    const fin = desplegar(ics).match(/DTEND:(\S+)/)?.[1];
    expect(fin).toBeDefined();
    expect(fin).not.toBe("20270226T110000Z");
  });

  it("escapa las comas y los puntos y coma del texto", () => {
    const ics = desplegar(
      construirIcs({ ...base(), lugar: "Finca El Olivar, Toledo; junto al río" }),
    );

    // Sin escapar, la coma parte la propiedad y el calendario se queda con
    // «Finca El Olivar» a secas.
    expect(ics).toContain("LOCATION:Finca El Olivar\\, Toledo\\; junto al río");
  });

  it("escapa las barras invertidas y los saltos de línea", () => {
    const ics = desplegar(construirIcs({ ...base(), descripcion: "Una\nlínea\\rara" }));

    expect(ics).toContain("DESCRIPTION:Una\\nlínea\\\\rara");
  });

  it("ninguna línea pasa de 75 octetos", () => {
    const ics = construirIcs({
      ...base(),
      titulo: "Ana y Luis",
      // Acentos y eñes a propósito: en UTF-8 ocupan dos octetos, así que un
      // plegado que cuente caracteres deja líneas demasiado largas.
      descripcion:
        "Nos casamos en una finca con muchísimos años de historia, ñoñerías incluidas, y nos encantaría que vinierais a acompañarnos ese día tan señalado.",
    });

    const codificador = new TextEncoder();
    for (const linea of ics.split("\r\n")) {
      expect(codificador.encode(linea).length).toBeLessThanOrEqual(75);
    }
  });

  it("un cliente recupera el texto original al desplegar y desescapar", () => {
    // La vuelta completa: es exactamente lo que hace un calendario al leer el
    // fichero, y la única forma de saber que plegado y escapado se llevan bien.
    const descripcion =
      "Nos casamos. Aquí tenéis todo lo que necesitáis saber, y algo más; incluida una coma, un punto y coma y una \\ barra.";
    const ics = construirIcs({ ...base(), descripcion });

    const valor = desplegar(ics).match(/DESCRIPTION:(.*)\r\n/)?.[1];
    expect(valor).toBeDefined();
    expect(desescapar(valor!)).toBe(descripcion);
  });

  it("las coordenadas van sin escapar, que son números", () => {
    const ics = desplegar(construirIcs({ ...base(), latitud: 40.416775, longitud: -3.70379 }));

    expect(ics).toContain("GEO:40.416775;-3.70379");
  });

  it("sin coordenadas no inventa una propiedad GEO", () => {
    const ics = construirIcs({ ...base(), latitud: null, longitud: null });

    expect(ics).not.toContain("GEO:");
  });

  it("el identificador es estable: reimportar no duplica el evento", () => {
    const primero = construirIcs(base());
    const segundo = construirIcs({
      ...base(),
      generadoEn: new Date("2026-09-01T00:00:00.000Z"),
    });

    const uid = (ics: string) => desplegar(ics).match(/UID:(\S+)/)?.[1];
    expect(uid(primero)).toBe(uid(segundo));
  });
});
