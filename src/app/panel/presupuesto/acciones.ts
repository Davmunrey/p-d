"use server";

import { redirect } from "next/navigation";

import {
  LONGITUD_MINIMA_NOMBRE,
  ORDEN_AL_FINAL,
  ORDEN_MAXIMO,
  RUTA_ACCESO,
  RUTA_PRESUPUESTO,
} from "@/config/constants";
import { contarGastosDeCategoria } from "@/lib/bbdd/presupuesto";
import { leerImporte } from "@/lib/importe";
import { ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import {
  ANCLA_ALTA_CATEGORIA,
  anclaDeCategoria,
  DESDE_EL_ALTA,
  type EstadoPresupuesto,
} from "./estado";

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
function volver(
  estado: EstadoPresupuesto,
  extra?: Record<string, string>,
  /** El sitio de la pantalla al que se vuelve, y donde se pinta el aviso. */
  ancla?: string,
): never {
  const parametros = new URLSearchParams({ estado, ...extra });
  redirect(`${RUTA_PRESUPUESTO}?${parametros.toString()}${ancla ? `#${ancla}` : ""}`);
}

/** Volver a una categoría de la lista de ajuste, con su aviso al lado. */
function aLaCategoria(
  id: string,
  estado: EstadoPresupuesto,
  extra?: Record<string, string>,
): never {
  volver(estado, { categoria: id, ...extra }, anclaDeCategoria(id));
}

/**
 * CERO FILAS NO ES SIEMPRE «NO PODÉIS». Con la categoría borrada desde el otro
 * móvil, a quien sí puede editar le salía «vuestro perfil no puede hacer
 * cambios aquí». Se mira quién pregunta para decir cuál de las dos es.
 */
async function ceroFilas(): Promise<EstadoPresupuesto> {
  return (await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "no-existe";
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

function motivo(error: { code?: string; message?: string }): EstadoPresupuesto {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";
  // El índice único va sobre `lower(btrim(nombre))`: «Banquete» y « banquete »
  // son la misma categoría. Antes acababa en «No se ha podido guardar».
  if (error.code === "23505" && error.message?.includes("categorias_presupuesto_nombre")) {
    return "nombre-repetido";
  }
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
  if (!bruto) return ORDEN_AL_FINAL;
  const numero = Number(bruto);
  if (!Number.isInteger(numero) || numero < 0 || numero > ORDEN_MAXIMO) return undefined;
  return numero;
}

export async function crearCategoria(datos: FormData): Promise<void> {
  // Los errores del alta vuelven al alta, que está al final de la pantalla.
  const alAlta: (estado: EstadoPresupuesto) => never = (estado) =>
    volver(estado, DESDE_EL_ALTA, ANCLA_ALTA_CATEGORIA);

  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) alAlta("nombre");

  const previsto = importe(datos, "importe_previsto");
  if (previsto === undefined) alAlta("importe");

  const posicion = orden(datos);
  if (posicion === undefined) alAlta("orden");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("categorias_presupuesto")
    .insert({
      nombre,
      importe_previsto: previsto,
      orden: posicion,
    })
    .select("id");

  if (error) alAlta(motivo(error));
  if (!data?.length) alAlta("sin-permiso");

  aLaCategoria(data[0]!.id as string, "categoria-creada");
}

export async function editarCategoria(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const nombre = texto(datos, "nombre");
  if (nombre.length < LONGITUD_MINIMA_NOMBRE) aLaCategoria(id, "nombre");

  const previsto = importe(datos, "importe_previsto");
  if (previsto === undefined) aLaCategoria(id, "importe");

  const posicion = orden(datos);
  if (posicion === undefined) aLaCategoria(id, "orden");

  /*
    LA DESCRIPCIÓN NO SE TOCA. La categoría la tiene en la base, pero esta
    pantalla no la enseña ni la pide: mandarla vacía en cada guardado borraba
    la que hubiera, sin que nadie la hubiera visto para echarla de menos.
  */
  const supabase = await cliente();
  const { data, error } = await supabase
    .from("categorias_presupuesto")
    .update({
      nombre,
      importe_previsto: previsto,
      orden: posicion,
    })
    .eq("id", id)
    .select("id");

  if (error) aLaCategoria(id, motivo(error));
  if (!data?.length) volver(await ceroFilas());

  aLaCategoria(id, "categoria-editada");
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
  if (cuantos < 0) aLaCategoria(id, "error");

  if (cuantos > 0) {
    // La decisión se pinta en la propia categoría, con su nombre y la cifra.
    const destino = texto(datos, "destino");
    if (!destino) aLaCategoria(id, "decidir-gastos", { cuantos: String(cuantos) });
    if (destino === id) aLaCategoria(id, "destino", { cuantos: String(cuantos) });

    const { data: movidos, error: fallo } = await supabase
      .from("partidas_presupuesto")
      .update({ categoria_id: destino })
      .eq("categoria_id", id)
      .select("id");

    if (fallo) aLaCategoria(id, motivo(fallo));
    // Cero filas movidas con gastos que contar es RLS callando: un lector no
    // reasigna gastos. Si se siguiera, el borrado fallaría después con un
    // error de clave ajena que no explica nada.
    if (!movidos?.length) volver(await ceroFilas());
  } else if (texto(datos, "confirmar") !== "si") {
    /*
      SIN GASTOS, BORRAR PREGUNTA ANTES. Un toque en «Borrar» se llevaba la
      categoría con su previsto sin vuelta atrás. El primer envío vuelve a la
      categoría con la pregunta y el botón que ya trae la confirmación.
    */
    aLaCategoria(id, "confirmar-borrado");
  }

  const { data, error } = await supabase
    .from("categorias_presupuesto")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) aLaCategoria(id, motivo(error));
  if (!data?.length) volver(await ceroFilas());

  volver(cuantos > 0 ? "gastos-movidos" : "categoria-borrada");
}
