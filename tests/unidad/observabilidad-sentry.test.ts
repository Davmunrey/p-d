import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RUTA_RSVP } from "../../src/config/constants";
import { limpiarTexto, TAPADO } from "../../src/lib/observabilidad/limpiar";
import { OPCIONES_SENTRY } from "../../src/lib/observabilidad/opciones-sentry";
import { antesDeMandar } from "../../src/lib/observabilidad/sentry";

/**
 * LO QUE SALE HACIA SENTRY, CON LA FORMA REAL DE LO QUE SALE.
 *
 * Tres fallos en el mismo sitio, y los tres invisibles en el CI porque allí no
 * hay DSN:
 *
 *   · Las TRAZAS no pasaban por el filtro: `beforeSend` sólo ve errores, y con
 *     el muestreo encendido una de cada diez visitas al RSVP mandaba la URL
 *     con el token en `request.url`, en el nombre de la transacción y en los
 *     tramos.
 *   · El filtro de teléfonos se comía los IDENTIFICADORES: cualquier tramo de
 *     seis cifras dentro de un hexadecimal era «un teléfono», y Sentry rechaza
 *     el sobre de un `event_id` que no es un UUID.
 *   · El navegador no arrancaba Sentry con la configuración documentada.
 */

const RAIZ = join(__dirname, "..", "..");
const TOKEN = "aB3-dEf_GhI9jKlMnOpQrStU";
const URL_CON_TOKEN = `https://boda.example${RUTA_RSVP}/${TOKEN}?paso=detalles`;

/** Identificadores con la forma de los de Sentry, elegidos para que tengan
 * tramos largos de cifras: los que el filtro viejo destrozaba. */
const EVENT_ID = "c0ffee1234567890deadbeef00112233";
const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "a123456789012345";

describe("el filtro de teléfonos no toca lo que no es un teléfono", () => {
  it("un identificador hexadecimal sale entero, con y sin guiones", () => {
    expect(limpiarTexto(EVENT_ID)).toBe(EVENT_ID);
    expect(limpiarTexto("c0ffee12-3456-7890-dead-beef00112233")).toBe(
      "c0ffee12-3456-7890-dead-beef00112233",
    );
  });

  it("ninguno de miles de UUID al azar sale alterado", () => {
    for (let vez = 0; vez < 5000; vez += 1) {
      const uuid = crypto.randomUUID();
      expect(limpiarTexto(uuid)).toBe(uuid);
      expect(limpiarTexto(uuid.replaceAll("-", ""))).toBe(uuid.replaceAll("-", ""));
    }
  });

  it("una fecha con su hora se queda como estaba, también en ISO", () => {
    expect(limpiarTexto("falló el 2026-08-12 14:30")).toBe("falló el 2026-08-12 14:30");
    expect(limpiarTexto("2026-08-12T14:30:00.000Z")).toBe("2026-08-12T14:30:00.000Z");
  });

  it("y un teléfono sigue sin salir, también detrás de dos puntos o antes de un punto", () => {
    expect(limpiarTexto("tel:600112233")).not.toContain("600112233");
    expect(limpiarTexto("llamad al 600 11 22 33.")).not.toContain("600 11 22 33");
  });
});

describe("un error de Sentry", () => {
  it("sale sin el token y con sus identificadores intactos", () => {
    const informe = {
      event_id: EVENT_ID,
      request: { url: URL_CON_TOKEN, headers: { referer: URL_CON_TOKEN } },
      contexts: { trace: { trace_id: TRACE_ID, span_id: SPAN_ID } },
      message: `falló al leer ${RUTA_RSVP}/${TOKEN}`,
    };

    const limpio = antesDeMandar(informe);

    expect(JSON.stringify(limpio)).not.toContain(TOKEN);
    expect(limpio.event_id).toBe(EVENT_ID);
    expect(limpio.contexts.trace.trace_id).toBe(TRACE_ID);
    expect(limpio.contexts.trace.span_id).toBe(SPAN_ID);
  });

  it("y lo que no tiene forma de identificador no se cuela por esa puerta", () => {
    const limpio = antesDeMandar({ event_id: `${RUTA_RSVP}/${TOKEN}` });
    expect(limpio.event_id).not.toContain(TOKEN);
  });
});

describe("las trazas", () => {
  it("los dos arranques llevan el filtro de errores, de transacciones, de tramos y de migas", () => {
    for (const gancho of [
      "beforeSend",
      "beforeSendTransaction",
      "beforeSendSpan",
      "beforeBreadcrumb",
    ] as const) {
      expect(OPCIONES_SENTRY[gancho], gancho).toBe(antesDeMandar);
    }
    expect(OPCIONES_SENTRY.sendDefaultPii).toBe(false);
  });

  it("una transacción del RSVP sale sin el token en la URL, el nombre ni los tramos", () => {
    const transaccion = {
      type: "transaction",
      event_id: EVENT_ID,
      transaction: `GET ${RUTA_RSVP}/${TOKEN}`,
      request: { url: URL_CON_TOKEN },
      contexts: { trace: { trace_id: TRACE_ID, span_id: SPAN_ID } },
      spans: [
        {
          span_id: SPAN_ID,
          trace_id: TRACE_ID,
          description: `GET ${RUTA_RSVP}/${TOKEN}`,
          data: { "url.path": `${RUTA_RSVP}/${TOKEN}`, "http.target": URL_CON_TOKEN },
        },
      ],
    };

    const limpia = OPCIONES_SENTRY.beforeSendTransaction(transaccion);

    expect(JSON.stringify(limpia)).not.toContain(TOKEN);
    expect(JSON.stringify(limpia)).toContain(encodeURIComponent(TAPADO));
    expect(limpia.event_id).toBe(EVENT_ID);
    expect(limpia.spans[0]!.span_id).toBe(SPAN_ID);
    expect(limpia.spans[0]!.trace_id).toBe(TRACE_ID);
  });

  it("un tramo suelto también", () => {
    const tramo = {
      span_id: SPAN_ID,
      trace_id: TRACE_ID,
      description: `GET ${RUTA_RSVP}/${TOKEN}`,
      data: { "url.full": URL_CON_TOKEN },
    };
    const limpio = OPCIONES_SENTRY.beforeSendSpan(tramo);
    expect(JSON.stringify(limpio)).not.toContain(TOKEN);
    expect(limpio.span_id).toBe(SPAN_ID);
  });

  it("y los dos ficheros de arranque usan esas opciones, no unas propias", () => {
    for (const fichero of ["instrumentation.ts", "instrumentation-client.ts"]) {
      const fuente = readFileSync(join(RAIZ, fichero), "utf8");
      expect(fuente, fichero).toContain("...OPCIONES_SENTRY");
      expect(fuente, fichero).not.toMatch(/beforeSend\w*\s*:/);
    }
  });
});

describe("el DSN del navegador", () => {
  it("next.config.ts lo copia de SENTRY_DSN al compilar, que es la variable documentada", () => {
    const configuracion = readFileSync(join(RAIZ, "next.config.ts"), "utf8");
    expect(configuracion).toMatch(/NEXT_PUBLIC_SENTRY_DSN:[^\n]*process\.env\.SENTRY_DSN/);
  });
});
