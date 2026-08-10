"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_GASTOS, RUTA_PAGOS, RUTA_PRESUPUESTO } from "@/config/constants";
import { esMetodoPago, esPagador, obtenerGastosParaPagar } from "@/lib/bbdd/pagos";
import { leerImporte } from "@/lib/importe";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoPagos } from "./estado";

/**
 * BODA-62 · APUNTAR, COBRAR Y DESHACER
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE. La política `pagos_editor_escribir`
 * exige `puede_editar()`; aquí sólo se traduce ese «no» a una frase. Y como una
 * escritura prohibida por RLS **no da error, devuelve cero filas**, cada
 * operación pide de vuelta lo que ha escrito y mira si ha venido algo.
 *
 * EL TOPE DEL GASTO SE COMPRUEBA DOS VECES, Y NO SOBRA NINGUNA. El trigger
 * `pagos_dentro_del_gasto` es quien manda —vale igual si alguien escribe por
 * SQL— pero sólo sabe decir PAG01. Aquí se mira antes para poder decir CUÁNTO
 * queda, que es lo que resuelve el problema en vez de sólo nombrarlo.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

function opcional(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

/*
  NO SE REVALIDA LA RUTA A LA QUE SE VA A REDIRIGIR.

  `revalidatePath` de la ruta destino y `redirect` a esa misma ruta compiten: el
  refresco repinta la página donde ya estás y la redirección, que sólo añadía una
  query, se pierde por el camino — y sin `?estado=` no sale el aviso de «hecho».
  Esta pantalla es `force-dynamic`, así que la redirección ya la vuelve a leer
  entera. Se revalida sólo lo que NO se va a visitar y sí cambia: el resumen del
  presupuesto y la lista de gastos, que enseñan lo pagado y lo pendiente.
*/
function volver(estado: EstadoPagos, extra?: Record<string, string>): never {
  revalidatePath(RUTA_PRESUPUESTO);
  revalidatePath(RUTA_GASTOS);
  const parametros = new URLSearchParams({ estado, ...extra });
  redirect(`${RUTA_PAGOS}?${parametros.toString()}`);
}

/**
 * Salir sin haber tocado nada.
 *
 * Un importe ilegible, una fecha vacía, un pago que no cabe, un «no tienes
 * permiso»: ninguno ha escrito, así que revalidar media aplicación para no haber
 * cambiado nada es trabajo que se nota — y además miente sobre lo que ha pasado.
 */
function rechazar(estado: EstadoPagos, extra?: Record<string, string>): never {
  const parametros = new URLSearchParams({ estado, ...extra });
  redirect(`${RUTA_PAGOS}?${parametros.toString()}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

function motivo(error: { code?: string; message?: string }): EstadoPagos {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";

  // PAG01 es el trigger del tope. Se llega aquí cuando la comprobación previa
  // no lo vio —porque alguien cambió el gasto entre medias— y entonces el
  // mensaje sin cifras es lo correcto: las que teníamos ya no valen.
  if (error.message?.includes("PAG01")) return "no-cabe";

  if (error.message?.includes("pagos_detalle_solo_de_otros")) return "pagador";

  console.error("Fallo escribiendo un pago:", error);
  return "error";
}

/**
 * UNA FECHA DE VENCIMIENTO ES OBLIGATORIA, y no es burocracia.
 *
 * Un pago sin fecha no se puede recordar ni avisar, que es el motivo entero de
 * que esta tabla exista aparte del importe del gasto.
 *
 * Se valida la forma aquí y el resto lo hace la base: `date` rechaza un 31 de
 * febrero por su cuenta, y reimplementar el calendario en TypeScript para
 * adelantarse sería tener dos calendarios.
 */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fecha(datos: FormData, campo: string): string | undefined {
  const escrita = texto(datos, campo);
  return FECHA.test(escrita) ? escrita : undefined;
}

/**
 * Quién paga, con su nombre cuando es «otros».
 *
 * Devuelve `undefined` si la combinación no vale, y no la arregla por su cuenta:
 * elegir «otros» y dejar el nombre en blanco es una pregunta a medio contestar,
 * y guardarla como «ambos» sería decidir por quien la dejó a medias.
 */
function pagador(datos: FormData): { paga: string | null; detalle: string | null } | undefined {
  const elegido = texto(datos, "paga");
  if (!elegido) return { paga: null, detalle: null };
  if (!esPagador(elegido)) return undefined;

  if (elegido !== "otros") return { paga: elegido, detalle: null };

  const detalle = texto(datos, "paga_detalle");
  if (detalle.length < 2 || detalle.length > 120) return undefined;
  return { paga: elegido, detalle };
}

/**
 * ¿Cabe este pago en su gasto?
 *
 * Devuelve lo que queda cuando NO cabe, para poder decirlo. `null` significa que
 * cabe —o que el gasto no tiene tope contra el que comparar, que no es lo mismo
 * pero lleva a la misma respuesta: adelante.
 */
async function loQueNoCabe(
  gastoId: string,
  importe: number,
  pagoId?: string,
): Promise<number | null> {
  const gastos = await obtenerGastosParaPagar();
  const gasto = gastos.find((candidato) => candidato.id === gastoId);
  if (!gasto || gasto.queda === null) return null;

  /*
    Al EDITAR hay que devolver a la cuenta lo que este pago ya ocupaba, o se
    compararía contra sí mismo: cambiar un pago de 500 € a 501 € parecería que
    pide 501 € libres cuando sólo pide uno más.

    El importe anterior no se pide otra vez a la base: `obtenerGastosParaPagar`
    ya sumó todos los pagos del gasto, así que basta con no contar éste.
  */
  const queda = pagoId ? gasto.queda + (await importeDe(pagoId)) : gasto.queda;
  const holgura = Math.round(queda * 100) / 100;

  return importe > holgura ? holgura : null;
}

/** Lo que ocupa hoy un pago concreto. Cero si no se puede leer. */
async function importeDe(pagoId: string): Promise<number> {
  const supabase = await cliente();
  const { data } = await supabase
    .from("pagos")
    .select("importe")
    .eq("id", pagoId)
    .maybeSingle();

  const bruto = (data as { importe: string | number } | null)?.importe ?? 0;
  const numero = typeof bruto === "number" ? bruto : Number(bruto);
  return Number.isFinite(numero) ? numero : 0;
}

/** Lo común de crear y editar: leer y validar. */
function leerPago(datos: FormData):
  | {
      gastoId: string;
      importe: number;
      vencimiento: string;
      paga: string | null;
      detalle: string | null;
      metodo: string | null;
      notas: string | null;
    }
  | { fallo: EstadoPagos } {
  const gastoId = texto(datos, "gasto_id");
  if (!gastoId) return { fallo: "gasto" };

  const importe = leerImporte(texto(datos, "importe"));
  // Cero no es un pago: es no haber pagado. La base lo rechaza igual con
  // `pagos_importe_positivo`, pero aquí se dice con palabras.
  if (importe === undefined || importe === null || importe <= 0) return { fallo: "importe" };

  const vencimiento = fecha(datos, "fecha_vencimiento");
  if (!vencimiento) return { fallo: "fecha" };

  const quien = pagador(datos);
  if (!quien) return { fallo: "pagador" };

  return {
    gastoId,
    importe,
    vencimiento,
    paga: quien.paga,
    detalle: quien.detalle,
    // Fuera de la lista, `null`: la columna es un enumerado y meterle cualquier
    // otra cosa es un error de tipo de la base, no una elección de nadie.
    metodo: metodo(datos),
    notas: opcional(datos, "notas"),
  };
}

function metodo(datos: FormData): string | null {
  const elegido = texto(datos, "metodo");
  return elegido && esMetodoPago(elegido) ? elegido : null;
}

export async function crearPago(datos: FormData): Promise<void> {
  const leido = leerPago(datos);
  if ("fallo" in leido) rechazar(leido.fallo);

  const holgura = await loQueNoCabe(leido.gastoId, leido.importe);
  if (holgura !== null) rechazar("no-cabe", { queda: String(holgura) });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("pagos")
    .insert({
      partida_id: leido.gastoId,
      importe: leido.importe,
      fecha_vencimiento: leido.vencimiento,
      paga: leido.paga,
      paga_detalle: leido.detalle,
      metodo: leido.metodo,
      notas: leido.notas,
    })
    .select("id");

  if (error) rechazar(motivo(error));
  if (!data?.length) rechazar("sin-permiso");

  volver("pago-creado");
}

export async function editarPago(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  const leido = leerPago(datos);
  if ("fallo" in leido) rechazar(leido.fallo);

  const holgura = await loQueNoCabe(leido.gastoId, leido.importe, id);
  if (holgura !== null) rechazar("no-cabe", { queda: String(holgura) });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("pagos")
    .update({
      partida_id: leido.gastoId,
      importe: leido.importe,
      fecha_vencimiento: leido.vencimiento,
      paga: leido.paga,
      paga_detalle: leido.detalle,
      metodo: leido.metodo,
      notas: leido.notas,
    })
    .eq("id", id)
    .select("id");

  if (error) rechazar(motivo(error));
  if (!data?.length) rechazar("sin-permiso");

  volver("pago-editado");
}

/**
 * MARCAR PAGADO ES ESCRIBIR LA FECHA, no encender un booleano.
 *
 * `pagado_en` es la columna, y su presencia es lo que marca el pago hecho. Un
 * booleano al lado sería una segunda verdad sobre lo mismo, y el día que se
 * quiera saber «cuándo se pagó» habría que inventárselo.
 *
 * SE PUEDE DESHACER. Se marca la fila de al lado justo el día que se apuntan
 * cinco seguidos, y sin vuelta atrás la única salida es borrar el pago y
 * volverlo a escribir entero.
 */
export async function marcarPagado(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  const hecho = datos.get("deshacer") === null;

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("pagos")
    .update({
      // La fecha la pone el servidor y no el navegador: un reloj mal puesto
      // escribiría un pago hecho «mañana».
      pagado_en: hecho ? new Date().toISOString().slice(0, 10) : null,
      // Un justificante sin pago no puede existir —lo impide
      // `pagos_justificante_solo_si_pagado`—, así que al deshacer se va con él.
      ...(hecho ? {} : { justificante_ruta: null }),
    })
    .eq("id", id)
    .select("id");

  if (error) rechazar(motivo(error));
  if (!data?.length) rechazar("sin-permiso");

  volver(hecho ? "marcado-pagado" : "marcado-pendiente");
}

export async function borrarPago(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  const supabase = await cliente();
  const { data, error } = await supabase.from("pagos").delete().eq("id", id).select("id");

  if (error) rechazar(motivo(error));
  if (!data?.length) rechazar("sin-permiso");

  volver("pago-borrado");
}
