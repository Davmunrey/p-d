"use server";

import { redirect } from "next/navigation";

import { LONGITUD_MINIMA_NOMBRE, RUTA_ACCESO, RUTA_PRESUPUESTO } from "@/config/constants";
import { contarGastosDeCategoria } from "@/lib/bbdd/presupuesto";
import { leerImporte } from "@/lib/importe";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoPresupuesto } from "./estado";

/**
 * BODA-60 · LAS CATEGORÍAS DEL PRESUPUESTO
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE. La política
 * `categorias_presupuesto_editor_escribir` exige `puede_editar()`; aquí sólo se
 * traduce ese «no» a una frase. Y como una escritura prohibida por RLS **no da
 * error, devuelve cero filas**, cada operación pide de vuelta lo que ha escrito
 * y mira si ha venido algo.
 *
 * LOS IMPORTES SE ESCRIBEN COMO SE ESCRIBEN EN CASTELLANO: «12.000,50» y
 * «12000.50» significan lo mismo, y el euro y los espacios se caen solos porque
 * se pegan desde un presupuesto en PDF. Es la misma normalización que en
 * proveedores, y vive aquí porque las dos pantallas la necesitan igual.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

function opcional(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

/**
 * Un importe escrito por una persona → un número, o `undefined` si no se puede.
 *
 * Vacío es cero y no `null`: `importe_previsto` es `not null` con `default 0`,
 * y una categoría sin previsión es una categoría en la que todavía no se ha
 * decidido cuánto — que es exactamente cero previsto, no «desconocido».
 */
function importe(datos: FormData, campo: string): number | undefined {
  const leido = leerImporte(texto(datos, campo));
  return leido === null ? 0 : leido;
}

/*
  NO SE REVALIDA LA RUTA A LA QUE SE VA A REDIRIGIR.

  Costó cinco vueltas de CI y el fallo era éste: al crear una categoría, la
  categoría SE CREABA y la pantalla se repintaba con ella dentro, pero la URL se
  quedaba sin el `?estado=` — y sin él no sale el aviso de «hecho». El invitado
  ve la pantalla cambiada y ningún mensaje, que es justo la duda que el aviso
  existe para quitar.

  `revalidatePath` de la ruta destino y `redirect` a esa misma ruta compiten: el
  refresco repinta la página donde ya estás y la redirección, que sólo añadía
  una query, se pierde por el camino. Y es redundante además — estas pantallas
  son `force-dynamic`, así que la redirección ya las vuelve a leer de la base
  entera. Se revalida sólo lo que NO se va a visitar.
*/
function volver(estado: EstadoPresupuesto, extra?: Record<string, string>): never {
  const parametros = new URLSearchParams({ estado, ...extra });
  redirect(`${RUTA_PRESUPUESTO}?${parametros.toString()}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

function motivo(error: { code?: string; message?: string }): EstadoPresupuesto {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";
  console.error("Fallo escribiendo en el presupuesto:", error);
  return "error";
}

/**
 * El orden lo marca la boda, no el alfabeto.
 *
 * Se admite vacío —va al final— porque obligar a decidir la posición al crear
 * una categoría es pedir una decisión que todavía no se tiene. Lo que no se
 * admite es un texto que no sea un número: eso se dice, en vez de colocar la
 * categoría en un sitio que nadie ha pedido.
 */
function orden(datos: FormData): number | undefined {
  const bruto = texto(datos, "orden");
  if (!bruto) return 99;
  const numero = Number(bruto);
  if (!Number.isInteger(numero) || numero < 0 || numero > 32767) return undefined;
  return numero;
}

export async function crearCategoria(datos: FormData): Promise<void> {
  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) volver("nombre");

  const previsto = importe(datos, "importe_previsto");
  if (previsto === undefined) volver("importe");

  const posicion = orden(datos);
  if (posicion === undefined) volver("orden");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("categorias_presupuesto")
    .insert({
      nombre,
      descripcion: opcional(datos, "descripcion"),
      importe_previsto: previsto,
      orden: posicion,
    })
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("categoria-creada");
}

export async function editarCategoria(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) volver("nombre");

  const previsto = importe(datos, "importe_previsto");
  if (previsto === undefined) volver("importe");

  const posicion = orden(datos);
  if (posicion === undefined) volver("orden");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("categorias_presupuesto")
    .update({
      nombre,
      descripcion: opcional(datos, "descripcion"),
      importe_previsto: previsto,
      orden: posicion,
    })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("categoria-editada");
}

/**
 * BORRAR UNA CATEGORÍA CON GASTOS NO ES UNA PREGUNTA DE SÍ O NO.
 *
 * `partidas_presupuesto.categoria_id` es `on delete restrict`, así que la base
 * se niega y hace bien: borrar la categoría y arrastrar sus gastos falsearía el
 * presupuesto entero, y dejarlos sin categoría no es posible —la columna es
 * `not null`—.
 *
 * Lo que hay que decidir no es «¿seguro?», es **a dónde van esos gastos**. Así
 * que el primer envío devuelve el aviso, la pantalla enseña cuántos son y un
 * desplegable con las demás categorías, y el segundo envío los mueve y borra.
 * Dos pasos, los dos por `POST`, sin una línea de JavaScript.
 */
export async function borrarCategoria(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const supabase = await cliente();
  const cuantos = await contarGastosDeCategoria(id);

  // `-1` es «no se pudo contar». Seguir adelante a ciegas sería ofrecer un
  // borrado directo sobre una categoría que quizá tiene cuarenta gastos.
  if (cuantos < 0) volver("error");

  if (cuantos > 0) {
    const destino = texto(datos, "destino");
    if (!destino) volver("decidir-gastos", { categoria: id });
    if (destino === id) volver("destino", { categoria: id });

    const { data: movidos, error: fallo } = await supabase
      .from("partidas_presupuesto")
      .update({ categoria_id: destino })
      .eq("categoria_id", id)
      .select("id");

    if (fallo) volver(motivo(fallo));
    // Cero filas movidas con gastos que contar es RLS callando: un lector no
    // reasigna gastos. Si se siguiera, el borrado fallaría después con un
    // error de clave ajena que no explica nada.
    if (!movidos?.length) volver("sin-permiso");
  }

  const { data, error } = await supabase
    .from("categorias_presupuesto")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver(cuantos > 0 ? "gastos-movidos" : "categoria-borrada");
}
