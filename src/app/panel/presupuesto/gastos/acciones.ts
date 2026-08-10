"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  LONGITUD_MINIMA_NOMBRE,
  RUTA_ACCESO,
  RUTA_GASTOS,
  RUTA_PRESUPUESTO,
} from "@/config/constants";
import { leerImporte } from "@/lib/importe";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoGastos } from "./estado";

/**
 * BODA-61 · LOS GASTOS, UNO A UNO
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE. La política
 * `partidas_presupuesto_editor_escribir` exige `puede_editar()`; aquí sólo se
 * traduce ese «no» a una frase. Y como una escritura prohibida por RLS **no da
 * error, devuelve cero filas**, cada operación pide de vuelta lo que ha escrito
 * y mira si ha venido algo.
 *
 * LOS TOTALES NO SE TOCAN DESDE AQUÍ. Se apunta el gasto y ya está: quien suma
 * es `v_resumen_presupuesto`, que la pantalla vuelve a leer al volver. Escribir
 * un total en una columna sería tener dos verdades sobre el mismo dinero, y la
 * copia se queda vieja el primer día que alguien edita un importe por SQL.
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
  refresco repinta la página donde ya estás y la redirección, que sólo añadía
  una query, se pierde por el camino — y sin `?estado=` no sale el aviso de
  «hecho». Esta pantalla es `force-dynamic`, así que la redirección ya la vuelve
  a leer entera de la base. Se revalida sólo lo que NO se va a visitar: el
  resumen del presupuesto, que sí cambia y se mira desde otra ruta.
*/
function volver(estado: EstadoGastos): never {
  revalidatePath(RUTA_PRESUPUESTO);
  redirect(`${RUTA_GASTOS}?estado=${estado}`);
}

/**
 * Salir sin tocar el resumen.
 *
 * TODO LO QUE SE VA POR AQUÍ NO HA ESCRITO NADA: un importe ilegible, un
 * concepto corto, un «no tienes permiso» de RLS, un gasto con pagos que la base
 * se niega a borrar. Revalidar el presupuesto entero para no haber cambiado nada
 * es trabajo que se nota en una pantalla con cuarenta gastos, y además miente
 * sobre lo que ha pasado.
 */
function rechazar(estado: EstadoGastos): never {
  redirect(`${RUTA_GASTOS}?estado=${estado}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

function motivo(error: { code?: string; message?: string }): EstadoGastos {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";

  // 23503 al borrar es la clave ajena de `pagos.partida_id`, que es
  // `on delete restrict`: el gasto tiene pagos apuntados. No es un fallo, es
  // una respuesta, y merece su propia frase.
  if (error.code === "23503") return "tiene-pagos";

  console.error("Fallo escribiendo un gasto:", error);
  return "error";
}

/**
 * LOS DOS IMPORTES DE UN GASTO NO SON EL MISMO CAMPO DOS VECES.
 *
 * `importe_estimado` es `not null` con `default 0`: un gasto sin estimación es
 * un gasto que todavía no se ha calculado, y eso son cero euros previstos.
 *
 * `importe_real` es nulo a propósito, y hay que dejarlo estar nulo: es «aún no
 * cerrado». Convertirlo en cero diría que el proveedor sale gratis, y esa cifra
 * entraría en la desviación de la categoría como un ahorro que no existe.
 */
function importes(datos: FormData): { estimado: number; real: number | null } | undefined {
  const estimado = leerImporte(texto(datos, "importe_estimado"));
  if (estimado === undefined) return undefined;

  const real = leerImporte(texto(datos, "importe_real"));
  if (real === undefined) return undefined;

  return { estimado: estimado ?? 0, real };
}

/**
 * El proveedor es opcional y se guarda como `null`, no como cadena vacía.
 *
 * El desplegable manda `""` cuando se deja en «sin proveedor», y meter eso en
 * una columna `uuid` es un error de tipo de la base, no una elección.
 */
function proveedor(datos: FormData): string | null {
  return opcional(datos, "proveedor_id");
}

export async function crearGasto(datos: FormData): Promise<void> {
  const categoriaId = texto(datos, "categoria_id");
  if (!categoriaId) rechazar("categoria");

  const concepto = texto(datos, "concepto");
  if (concepto.length < LONGITUD_MINIMA_NOMBRE) rechazar("concepto");

  const cantidades = importes(datos);
  if (!cantidades) rechazar("importe");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("partidas_presupuesto")
    .insert({
      categoria_id: categoriaId,
      proveedor_id: proveedor(datos),
      concepto,
      descripcion: opcional(datos, "descripcion"),
      importe_estimado: cantidades.estimado,
      importe_real: cantidades.real,
    })
    .select("id");

  if (error) rechazar(motivo(error));
  if (!data?.length) rechazar("sin-permiso");

  volver("gasto-creado");
}

export async function editarGasto(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  const categoriaId = texto(datos, "categoria_id");
  if (!categoriaId) rechazar("categoria");

  const concepto = texto(datos, "concepto");
  if (concepto.length < LONGITUD_MINIMA_NOMBRE) rechazar("concepto");

  const cantidades = importes(datos);
  if (!cantidades) rechazar("importe");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("partidas_presupuesto")
    .update({
      categoria_id: categoriaId,
      proveedor_id: proveedor(datos),
      concepto,
      descripcion: opcional(datos, "descripcion"),
      importe_estimado: cantidades.estimado,
      importe_real: cantidades.real,
      // La casilla no viaja cuando está sin marcar: en HTML un `checkbox`
      // apagado no manda nada. Por eso se lee la presencia, no el valor.
      pagada: datos.get("pagada") !== null,
    })
    .eq("id", id)
    .select("id");

  if (error) rechazar(motivo(error));
  if (!data?.length) rechazar("sin-permiso");

  volver("gasto-editado");
}

/**
 * BORRAR UN GASTO CON PAGOS NO SE PREGUNTA, SE NIEGA.
 *
 * `pagos.partida_id` es `on delete restrict` y hace bien: un pago hecho es
 * contabilidad, no un apunte que se arrastra al borrar la línea de la que
 * colgaba. No se cuenta antes de borrar —sería un viaje más y una carrera con
 * quien esté apuntando un pago en ese momento—: se intenta, y si la base dice
 * 23503 se explica.
 */
export async function borrarGasto(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("partidas_presupuesto")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) rechazar(motivo(error));
  if (!data?.length) rechazar("sin-permiso");

  volver("gasto-borrado");
}
