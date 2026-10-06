"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  LARGOS_DE_CAMPO,
  RUTA_ACCESO,
  RUTA_GASTOS,
  RUTA_PAGOS,
  RUTA_PRESUPUESTO,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerDiasDeLaBoda } from "@/lib/bbdd/ajustes";
import { esMetodoPago, esPagador, obtenerGastosParaPagar } from "@/lib/bbdd/pagos";
import { leerImporte } from "@/lib/importe";
import { ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";
import { diaDelCalendario } from "@/lib/zona-horaria";

import { ANCLA_ALTA_PAGO, anclaDePago, DESDE_EL_ALTA, type EstadoPagos } from "./estado";

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
function volver(estado: EstadoPagos, extra?: Record<string, string>, ancla?: string): never {
  revalidatePath(RUTA_PRESUPUESTO);
  revalidatePath(RUTA_GASTOS);
  redirect(destino(estado, extra, ancla));
}

/** La pantalla de pagos con el resultado en la URL y, si lo hay, el pago al que volver. */
function destino(estado: EstadoPagos, extra?: Record<string, string>, ancla?: string): string {
  const parametros = new URLSearchParams({ estado, ...extra });
  return `${RUTA_PAGOS}?${parametros.toString()}${ancla ? `#${ancla}` : ""}`;
}

/**
 * Salir sin haber tocado nada.
 *
 * Un importe ilegible, una fecha vacía, un pago que no cabe, un «no tienes
 * permiso»: ninguno ha escrito, así que revalidar media aplicación para no haber
 * cambiado nada es trabajo que se nota — y además miente sobre lo que ha pasado.
 */
function rechazar(estado: EstadoPagos, extra?: Record<string, string>, ancla?: string): never {
  redirect(destino(estado, extra, ancla));
}

/**
 * CERO FILAS NO ES SIEMPRE «NO PODÉIS». Con el pago borrado desde el otro
 * móvil, a quien sí puede editar le salía «vuestro perfil no puede hacer
 * cambios aquí». Se mira quién pregunta para decir cuál de las dos es.
 */
async function ceroFilas(): Promise<EstadoPagos> {
  return (await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "no-existe";
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

  // El calendario lo pone la base (ver `fecha`): un 31 de febrero vuelve como
  // 22008, y eso es «esa fecha no existe», no una avería.
  if (error.code === "22008" || error.code === "22007") return "fecha";

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
 * EL DÍA EN QUE SE PAGÓ, QUE ES OPCIONAL Y NO ES EL DE HOY.
 *
 * «Marcar pagado» apuntaba siempre la fecha del día en que se pulsaba, y no
 * había forma de corregirla: la señal del fotógrafo, pagada en marzo y
 * apuntada en octubre, salía en la gráfica en octubre. Vacía es «todavía no se
 * ha pagado»; `null` si no vale.
 *
 * AQUÍ SÍ SE MIRA EL CALENDARIO, al revés que el vencimiento: los dos días van
 * en la misma escritura, y si la base contesta «esa fecha no existe» no dice
 * cuál de las dos. Se comprueba ésta con la vuelta de `Date` —que no inventa
 * reglas, sólo no admite un 31 de febrero— para poder señalar el campo bueno.
 */
function fechaDePago(datos: FormData): string | null | undefined {
  const escrita = texto(datos, "pagado_en");
  if (!escrita) return null;
  if (!FECHA.test(escrita)) return undefined;
  const leida = new Date(`${escrita}T12:00:00Z`);
  return Number.isNaN(leida.getTime()) || leida.toISOString().slice(0, 10) !== escrita
    ? undefined
    : escrita;
}

/** Hoy en la zona de la boda: lo que separa «ya pagado» de «pagado mañana». */
async function hoyEnLaBoda(): Promise<string> {
  const dias = await obtenerDiasDeLaBoda();
  return dias?.hoy ?? diaDelCalendario(new Date(), ZONA_HORARIA);
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
  if (detalle.length < 2 || detalle.length > LARGOS_DE_CAMPO["pagos.paga_detalle"])
    return undefined;
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
  /*
    Y SÓLO SI EL PAGO YA ESTABA EN ESTE GASTO. En «editar» se puede cambiar el
    gasto del pago, y entonces el importe anterior no ocupaba nada aquí: sumarlo
    igual le regalaba al gasto nuevo una holgura que nunca tuvo, la comprobación
    decía «cabe», y el trigger PAG01 lo paraba después sin la cifra. El dato
    quedaba bien —por el trigger— pero esta función existe precisamente para
    poder decir CUÁNTO queda, y decía que cabía.
  */
  const anterior = pagoId ? await importeDe(pagoId) : null;
  const yaOcupaba = anterior && anterior.partidaId === gastoId ? anterior.importe : 0;
  const queda = gasto.queda + yaOcupaba;
  const holgura = Math.round(queda * 100) / 100;

  return importe > holgura ? holgura : null;
}

/** Lo que ocupa hoy un pago concreto y en qué gasto. `null` si no se puede leer. */
async function importeDe(
  pagoId: string,
): Promise<{ importe: number; partidaId: string } | null> {
  const supabase = await cliente();
  const { data } = await supabase
    .from("pagos")
    .select("importe, partida_id")
    .eq("id", pagoId)
    .maybeSingle();

  const fila = data as { importe: string | number; partida_id: string } | null;
  if (!fila) return null;
  const numero = typeof fila.importe === "number" ? fila.importe : Number(fila.importe);
  return { importe: Number.isFinite(numero) ? numero : 0, partidaId: fila.partida_id };
}

/** Lo común de crear y editar: leer y validar. */
function leerPago(datos: FormData):
  | {
      gastoId: string;
      importe: number;
      vencimiento: string;
      pagadoEn: string | null;
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

  const pagadoEn = fechaDePago(datos);
  if (pagadoEn === undefined) return { fallo: "fecha-pago" };

  const quien = pagador(datos);
  if (!quien) return { fallo: "pagador" };

  return {
    gastoId,
    importe,
    vencimiento,
    pagadoEn,
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
  /*
    LOS ERRORES DEL ALTA VUELVEN AL ALTA, que está al final de la pantalla:
    el aviso salía en la cabecera, lejos del botón que se acababa de pulsar.
  */
  const alAlta: (estado: EstadoPagos, extra?: Record<string, string>) => never = (
    estado,
    extra,
  ) => rechazar(estado, { ...DESDE_EL_ALTA, ...extra }, ANCLA_ALTA_PAGO);

  const leido = leerPago(datos);
  if ("fallo" in leido) alAlta(leido.fallo);
  // Pagado «mañana» no es pagado: es un vencimiento, y para eso está su campo.
  if (leido.pagadoEn && leido.pagadoEn > (await hoyEnLaBoda())) alAlta("fecha-pago");

  const holgura = await loQueNoCabe(leido.gastoId, leido.importe);
  if (holgura !== null) alAlta("no-cabe", { queda: String(holgura) });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("pagos")
    .insert({
      partida_id: leido.gastoId,
      importe: leido.importe,
      fecha_vencimiento: leido.vencimiento,
      pagado_en: leido.pagadoEn,
      paga: leido.paga,
      paga_detalle: leido.detalle,
      metodo: leido.metodo,
      notas: leido.notas,
    })
    .select("id");

  if (error) alAlta(motivo(error));
  if (!data?.length) alAlta("sin-permiso");

  // Al pago recién apuntado, que es donde está «Marcar pagado».
  const nuevo = data[0]!.id as string;
  volver("pago-creado", { pago: nuevo }, anclaDePago(nuevo));
}

export async function editarPago(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  const leido = leerPago(datos);
  if ("fallo" in leido) rechazar(leido.fallo, { editar: id }, anclaDePago(id));
  if (leido.pagadoEn && leido.pagadoEn > (await hoyEnLaBoda())) {
    rechazar("fecha-pago", { editar: id }, anclaDePago(id));
  }

  /*
    SI NO CAMBIA EL DINERO NO HAY NADA QUE CABER. Cambiar la fecha o las notas
    de un pago de un gasto que ya se había pasado respondía «no cabe», y ese
    pago no se podía tocar. La base hace lo mismo desde 20261005120000.
  */
  const anterior = await importeDe(id);
  /*
    SIN PAGO QUE LEER, NO HAY NADA QUE GUARDAR. Borrado desde el otro móvil, se
    comparaba contra el gasto como si fuera nuevo y podía contestar «no cabe»
    sobre un pago que ya no existía.
  */
  if (anterior === null) rechazar(await ceroFilas());
  const mismoDinero =
    anterior !== null &&
    anterior.partidaId === leido.gastoId &&
    anterior.importe === leido.importe;
  if (!mismoDinero) {
    const holgura = await loQueNoCabe(leido.gastoId, leido.importe, id);
    if (holgura !== null) {
      rechazar("no-cabe", { queda: String(holgura), editar: id }, anclaDePago(id));
    }
  }

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("pagos")
    .update({
      partida_id: leido.gastoId,
      importe: leido.importe,
      fecha_vencimiento: leido.vencimiento,
      pagado_en: leido.pagadoEn,
      // Sin pago no hay justificante: lo exige `pagos_justificante_solo_si_pagado`.
      ...(leido.pagadoEn ? {} : { justificante_ruta: null }),
      paga: leido.paga,
      paga_detalle: leido.detalle,
      metodo: leido.metodo,
      notas: leido.notas,
    })
    .eq("id", id)
    .select("id");

  if (error) rechazar(motivo(error), { editar: id }, anclaDePago(id));
  if (!data?.length) rechazar(await ceroFilas());

  volver("pago-editado", { pago: id }, anclaDePago(id));
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

  /*
    EL DÍA SE LEE EN LA ZONA DE LA BODA, NO EN LA DEL SERVIDOR. La fecha la
    pone el servidor y no el navegador —un reloj mal puesto escribiría un pago
    hecho «mañana»—, pero el servidor de Vercel corre en UTC y España va por
    delante: hasta las dos de la madrugada en verano, el día en UTC todavía es
    el de ayer. Marcar un pago después de cenar, ya de madrugada, lo apuntaba
    la víspera. Si no se puede leer la configuración se usa la zona de la
    landing, que es la de esta boda: peor que eso es no dejar marcar el pago.
  */
  const hoy = await hoyEnLaBoda();

  const supabase = await cliente();
  let consulta = supabase
    .from("pagos")
    .update({
      pagado_en: hecho ? hoy : null,
      // Un justificante sin pago no puede existir —lo impide
      // `pagos_justificante_solo_si_pagado`—, así que al deshacer se va con él.
      ...(hecho ? {} : { justificante_ruta: null }),
    })
    .eq("id", id);
  /*
    MARCAR SÓLO LO QUE ESTÁ SIN PAGAR. Desde una pantalla vieja —otra pestaña,
    el móvil del otro—, «Marcar pagado» sobre un pago que ya lo estaba le
    reescribía la fecha con la de hoy, y la de verdad no se podía recuperar.
  */
  if (hecho) consulta = consulta.is("pagado_en", null);
  const { data, error } = await consulta.select("id");

  if (error) rechazar(motivo(error), { pago: id }, anclaDePago(id));
  if (!data?.length) {
    // Cero filas: o ya estaba pagado —y entonces lo pedido ya es verdad—, o
    // no existe, o RLS no deja. Se distingue leyendo, sin escribir nada.
    const { data: actual } = await supabase
      .from("pagos")
      .select("pagado_en")
      .eq("id", id)
      .maybeSingle();
    if (hecho && actual?.pagado_en) volver("marcado-pagado", { pago: id }, anclaDePago(id));
    rechazar(actual ? "sin-permiso" : "no-existe");
  }

  volver(hecho ? "marcado-pagado" : "marcado-pendiente", { pago: id }, anclaDePago(id));
}

/**
 * BORRAR PREGUNTA ANTES, como en el resto del panel. Un pago es contabilidad:
 * con «Borrar» justo debajo de «Marcar pagado», un toque de más en el móvil
 * se llevaba un pago de 3.000 € con sus notas sin vuelta atrás. El primer
 * envío no borra: vuelve al pago con la pregunta y el botón que ya trae la
 * confirmación dentro. Dos pasos, los dos por `POST`.
 */
export async function borrarPago(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  if (texto(datos, "confirmar") !== "si") {
    rechazar("confirmar-borrado", { pago: id }, anclaDePago(id));
  }

  const supabase = await cliente();
  const { data, error } = await supabase.from("pagos").delete().eq("id", id).select("id");

  if (error) rechazar(motivo(error), { pago: id }, anclaDePago(id));
  if (!data?.length) rechazar(await ceroFilas());

  volver("pago-borrado");
}
