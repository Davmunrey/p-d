import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLAVE_ALMACEN_DIA } from "../../src/config/constants";

/**
 * BODA-100 · La cola de marcas del guion del día, con dos toques seguidos.
 *
 * El caso: marcar un punto y, con la petición todavía en vuelo, desmarcarlo.
 * Cuando volvía la respuesta de la PRIMERA, la cola soltaba la entrada por id
 * y tiraba la marca NUEVA —la de desmarcar— sin haberla mandado. La pantalla
 * saltaba sola a «hecho» y, si la segunda petición fallaba, no quedaba nada que
 * reintentar. Soltar sólo lo que sigue siendo lo que se mandó lo evita.
 *
 * El módulo guarda la cola en memoria, así que cada test lo importa de nuevo.
 */
async function colaLimpia() {
  vi.resetModules();
  window.localStorage.clear();
  return import("../../src/app/panel/dia/cola");
}

const P = "punto-1";
const T1 = "2027-06-26T12:30:00.000Z";

describe("soltar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("suelta lo que se mandó tal cual", async () => {
    const cola = await colaLimpia();
    cola.apuntar(P, T1);
    cola.soltar([[P, T1]]);
    expect(cola.instantanea()).toEqual({});
  });

  it("EL CASO: no suelta la marca nueva cuando vuelve la respuesta de la vieja", async () => {
    const cola = await colaLimpia();
    cola.apuntar(P, T1); // marcar → se manda T1
    cola.apuntar(P, null); // desmarcar antes de que conteste → se manda null

    cola.soltar([[P, T1]]); // vuelve la respuesta de T1

    // La marca de desmarcar sigue pendiente: es lo último que hizo quien marcaba.
    expect(cola.instantanea()).toEqual({ [P]: null });

    cola.soltar([[P, null]]); // y cuando vuelve la suya, sí
    expect(cola.instantanea()).toEqual({});
  });

  it("no toca lo que no se mandó", async () => {
    const cola = await colaLimpia();
    cola.apuntar(P, T1);
    cola.apuntar("punto-2", null);
    cola.soltar([[P, T1]]);
    expect(cola.instantanea()).toEqual({ "punto-2": null });
    cola.soltar([]);
    expect(cola.instantanea()).toEqual({ "punto-2": null });
  });
});

/**
 * EL PANEL ABIERTO EN DOS PESTAÑAS DEL MISMO MÓVIL.
 *
 * Cada pestaña es una copia del módulo con su memoria, y las dos comparten el
 * almacén. Antes la memoria se leía una vez y no se volvía a leer: el aviso de
 * `storage` no repintaba nada, y la pestaña que escribía después partía de su
 * foto vieja y BORRABA del almacén la marca de la otra, que no había llegado
 * al servidor y ya no llegaba nunca.
 */
describe("dos pestañas", () => {
  const T2 = "2027-06-26T13:15:00.000Z";

  async function pestana() {
    vi.resetModules();
    return import("../../src/app/panel/dia/cola");
  }

  /** Lo que el navegador hace en las DEMÁS pestañas cuando una escribe. */
  function avisarDeOtraPestana() {
    window.dispatchEvent(new StorageEvent("storage", { key: CLAVE_ALMACEN_DIA }));
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lo que apunta una lo ve la otra al recibir el aviso, y repinta", async () => {
    const a = await pestana();
    const b = await pestana();
    expect(b.instantanea()).toEqual({});

    let avisos = 0;
    const dejar = b.suscribirse(() => (avisos += 1));

    a.apuntar("ceremonia", T1);
    avisarDeOtraPestana();

    expect(avisos).toBe(1);
    expect(b.instantanea()).toEqual({ ceremonia: T1 });
    dejar();
  });

  it("EL CASO: escribir desde una pestaña no borra lo pendiente de la otra", async () => {
    const a = await pestana();
    const b = await pestana();
    b.instantanea(); // B ya tenía su foto, vacía

    a.apuntar("ceremonia", T1);
    // Sin aviso: puede no llegar, o llegar tarde. Da igual.
    b.apuntar("coctel", T2);

    const almacen = JSON.parse(window.localStorage.getItem(CLAVE_ALMACEN_DIA) ?? "{}");
    expect(almacen).toEqual({ ceremonia: T1, coctel: T2 });

    // Y al soltar lo suyo, B deja lo de A donde estaba.
    b.soltar([["coctel", T2]]);
    expect(JSON.parse(window.localStorage.getItem(CLAVE_ALMACEN_DIA) ?? "{}")).toEqual({
      ceremonia: T1,
    });
  });

  it("un aviso de otra clave del almacén no toca la cola", async () => {
    const b = await pestana();
    let avisos = 0;
    const dejar = b.suscribirse(() => (avisos += 1));
    window.dispatchEvent(new StorageEvent("storage", { key: "otra-cosa" }));
    expect(avisos).toBe(0);
    dejar();
  });

  it("la instantánea no cambia de identidad si el almacén no ha cambiado", async () => {
    const b = await pestana();
    b.apuntar("ceremonia", T1);
    const antes = b.instantanea();
    const dejar = b.suscribirse(() => {});
    avisarDeOtraPestana();
    expect(b.instantanea()).toBe(antes);
    dejar();
  });
});
