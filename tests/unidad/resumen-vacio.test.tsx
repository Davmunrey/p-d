import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import copy from "../../content/copy.es.json";
import { DIAS_VENCE_PRONTO, IDIOMA } from "../../src/config/constants";
import { formateadorDeImporte } from "../../src/lib/importe";

/**
 * EL RESUMEN DEL PANEL SIN FECHA Y SIN INVITADOS
 *
 * Las dos ramas que dicen «todavía no hay» en vez de enseñar ceros. El E2E del
 * resumen corre contra la semilla —con fecha y con invitados— y no puede
 * llegar a ninguna sin vaciar una base que comparten todos los demás tests;
 * su título prometía las dos y no recorría ninguna. Aquí se pinta la página
 * con los datos de cada caso.
 */

const configuracion = vi.fn();
const resumen = vi.fn();
const presupuesto = vi.fn();
const moneda = vi.fn();
const pagos = vi.fn();
const tareas = vi.fn();

vi.mock("@/lib/bbdd/landing", () => ({ obtenerConfiguracion: () => configuracion() }));
vi.mock("@/lib/bbdd/resumen", () => ({ obtenerResumen: () => resumen() }));
vi.mock("@/lib/bbdd/presupuesto", async () => {
  const real = await vi.importActual<typeof import("@/lib/desvios")>("@/lib/desvios");
  return {
    obtenerResumenPresupuesto: () => presupuesto(),
    desviosDe: () => [],
    totalesDelPresupuesto: real.totalesDelPresupuesto,
  };
});
vi.mock("@/lib/bbdd/ajustes", () => ({ obtenerMonedaBoda: () => moneda() }));
vi.mock("@/lib/bbdd/pagos", () => ({ obtenerPagos: () => pagos() }));
vi.mock("@/lib/bbdd/tareas", () => ({
  ESTADO_HECHA: "hecha",
  obtenerTareas: () => tareas(),
  estaVencida: (tarea: { estado: string; diasParaVencer: number | null }) =>
    tarea.estado !== "hecha" && tarea.diasParaVencer !== null && tarea.diasParaVencer < 0,
}));

const INVITADOS = {
  personas: 12,
  confirmados: 5,
  adultosConfirmados: 4,
  ninosConfirmados: 1,
  rechazados: 2,
  pendientes: 5,
  plazasAutobus: 3,
};

async function pintar(): Promise<string> {
  const { default: PaginaResumen } = await import("../../src/app/panel/page");
  return renderToStaticMarkup(await PaginaResumen());
}

describe("el resumen del panel", () => {
  beforeEach(() => {
    vi.resetModules();
    configuracion.mockResolvedValue({ fechaCeremonia: new Date(Date.now() + 40 * 86_400_000) });
    resumen.mockResolvedValue({ invitados: INVITADOS, menus: [] });
    presupuesto.mockResolvedValue([]);
    moneda.mockResolvedValue("EUR");
    pagos.mockResolvedValue([]);
    tareas.mockResolvedValue([]);
  });

  it("con fecha e invitados enseña la cuenta atrás y las cifras", async () => {
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.bloqueInvitados);
    expect(html).not.toContain(copy.panel.resumen.sinFecha);
    expect(html).not.toContain(copy.panel.resumen.sinInvitados);
  });

  it("si no se puede leer la fecha, lo dice en vez de inventar una cuenta atrás", async () => {
    configuracion.mockRejectedValue(new Error("sin configuración"));
    const html = await pintar();
    // Y no dice que no la hay: la fecha es obligatoria, lo que falló es leerla.
    expect(html).toContain(copy.panel.resumen.fechaSinLeer);
    expect(html).not.toContain(copy.panel.resumen.sinFecha);
    // Y lo demás sigue: no saber la fecha no deja el panel en blanco.
    expect(html).toContain(copy.panel.resumen.bloqueInvitados);
  });

  it("sin configuración todavía, dice que no hay fecha", async () => {
    configuracion.mockResolvedValue(null);
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.sinFecha);
  });

  it("si no se puede leer la moneda, el presupuesto lo dice y no desaparece", async () => {
    moneda.mockResolvedValue(null);
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.bloquePresupuesto);
    expect(html).toContain(copy.panel.resumen.importesSinLeer);
  });

  it("con uno sin contestar no dice que han contestado todos", async () => {
    resumen.mockResolvedValue({
      invitados: {
        ...INVITADOS,
        personas: 200,
        confirmados: 199,
        rechazados: 0,
        pendientes: 1,
      },
      menus: [],
    });
    const html = await pintar();
    expect(html).toMatch(/199 de 200: el 99\s%/);
    expect(html).not.toMatch(/el 100\s%/);
  });

  it("sin invitados lo dice, enlaza a darlos de alta y no pinta ceros", async () => {
    resumen.mockResolvedValue({
      invitados: { ...INVITADOS, personas: 0, confirmados: 0, pendientes: 0 },
      menus: [],
    });
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.sinInvitados);
    expect(html).toContain(copy.panel.resumen.irAInvitados);
    expect(html).not.toContain(copy.panel.resumen.bloqueInvitados);
    expect(html).not.toContain(copy.panel.resumen.bloqueLogistica);
  });

  it("dice qué parte de los invitados ha contestado", async () => {
    const html = await pintar();
    // 5 que sí y 2 que no, de 12.
    expect(html).toContain(
      copy.panel.resumen.respuesta
        .replace("{contestados}", "7")
        .replace("{personas}", "12")
        .replace(
          "{porcentaje}",
          new Intl.NumberFormat(IDIOMA, { style: "percent" }).format(7 / 12),
        ),
    );
  });

  it("sin presupuesto, pagos ni tareas, cada bloque lo explica en vez de enseñar ceros", async () => {
    const html = await pintar();
    expect(html).toContain(copy.panel.resumen.sinPresupuesto);
    expect(html).toContain(copy.panel.resumen.sinPagos);
    expect(html).toContain(
      copy.panel.resumen.sinTareas.replace("{dias}", String(DIAS_VENCE_PRONTO)),
    );
    expect(html).not.toContain(copy.panel.resumen.quedaPorPagar);
  });

  it("con datos, suma el presupuesto, marca lo vencido y cuenta lo que no cabe", async () => {
    const euros = formateadorDeImporte("EUR");
    presupuesto.mockResolvedValue([
      {
        categoriaId: "a",
        categoria: "Catering",
        importePrevisto: 10000,
        desviacion: 1000,
        pagado: 3000,
      },
      {
        categoriaId: "b",
        categoria: "Flores",
        importePrevisto: 500,
        desviacion: -100,
        pagado: 0,
      },
    ]);
    const pendiente = (n: number, vencido = false) => ({
      id: `p${n}`,
      concepto: `Pago ${n}`,
      importe: 100 * n,
      fechaVencimiento: "2027-03-0" + n,
      pagadoEn: null,
      vencido,
    });
    pagos.mockResolvedValue([
      pendiente(1, true),
      ...[2, 3, 4, 5, 6].map((n) => pendiente(n)),
      { ...pendiente(7), id: "hecho", concepto: "Ya pagado", pagadoEn: "2027-01-01" },
    ]);
    tareas.mockResolvedValue([
      {
        id: "t1",
        titulo: "Llamar a la finca",
        estado: "pendiente",
        fechaLimite: "2027-03-01",
        diasParaVencer: -2,
      },
      {
        id: "t2",
        titulo: "Probar el menú",
        estado: "en_curso",
        fechaLimite: "2027-03-05",
        diasParaVencer: 3,
      },
      {
        id: "t3",
        titulo: "Lejana",
        estado: "pendiente",
        fechaLimite: "2027-06-01",
        diasParaVencer: 90,
      },
      {
        id: "t4",
        titulo: "Terminada",
        estado: "hecha",
        fechaLimite: "2027-03-02",
        diasParaVencer: 1,
      },
    ]);

    const html = await pintar();
    // Previsto 10500; va costando 9000 + 600 = 9600; pagado 3000; quedan 6600.
    for (const cifra of [10500, 9600, 3000, 6600]) expect(html).toContain(euros(cifra));
    // Seis pendientes: cuatro a la vista y «y 2 más». El pagado no sale.
    expect(html).toContain(copy.panel.resumen.yMas.replace("{cuantos}", "2"));
    expect(html).not.toContain("Ya pagado");
    expect(html).toContain(copy.panel.presupuesto.pagos.vencido);
    // De las tareas, la vencida y la de esta semana; ni la lejana ni la hecha.
    expect(html).toContain("Llamar a la finca");
    expect(html).toContain("Probar el menú");
    expect(html).toContain(copy.panel.tareas.vencida);
    expect(html).not.toContain("Lejana");
    expect(html).not.toContain("Terminada");
  });

  it("sin moneda no enseña importes: un número suelto invita a leerlo en euros", async () => {
    moneda.mockResolvedValue(null);
    presupuesto.mockResolvedValue([
      {
        categoriaId: "a",
        categoria: "Catering",
        importePrevisto: 10000,
        desviacion: 1000,
        pagado: 3000,
      },
    ]);
    const html = await pintar();
    expect(html).not.toContain(copy.panel.resumen.quedaPorPagar);
  });
});
