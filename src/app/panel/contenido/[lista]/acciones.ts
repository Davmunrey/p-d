"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_CONTENIDO, TOPE_ORDEN_CONTENIDO } from "@/config/constants";
import {
  LISTAS_DE_CONTENIDO,
  esClaveLista,
  rutaDeLista,
  type ClaveLista,
  type ListaDeContenido,
} from "@/config/contenido-landing";
import { obtenerFilasDeLista } from "@/lib/bbdd/contenido";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import type { EstadoLista } from "./estado";
import { esDireccion, permutarConElVecino } from "./reordenar";

/**
 * BODA-129 · ESCRIBIR EN LAS LISTAS DE CONTENIDO DE LA LANDING
 *
 * UNA SOLA ACCIÓN POR VERBO PARA LAS CUATRO LISTAS. Lo que cambia entre ellas
 * son los campos, y eso lo dice el descriptor; el mecanismo —validar, escribir,
 * mirar si RLS ha callado, volver con su aviso— es idéntico. Escribirlo cuatro
 * veces sería tener cuatro sitios donde arreglar el mismo despiste.
 *
 * QUIÉN PUEDE lo decide RLS: la política `<tabla>_gestion` de cada una exige
 * `puede_editar()`. Aquí se corta antes por no gastar un salto de red que ya se
 * sabe que va a devolver cero filas, y se traduce ese «no» a una frase — pero
 * si esta comprobación desapareciera, la base seguiría diciendo que no.
 *
 * Y HAY QUE MIRAR LAS FILAS TOCADAS, porque RLS no da error al prohibir una
 * escritura: devuelve cero filas. Sin comprobarlo, un lector pulsa «Guardar»,
 * no pasa nada, y la pantalla le dice «Guardado».
 */

/** A dónde vuelve cada acción, con su acuse y sin perder de qué lista era. */
function volver(
  clave: ClaveLista,
  estado: EstadoLista,
  extra: { variante?: string; campo?: string; ficha?: string } = {},
): never {
  const parametros = new URLSearchParams({ estado });
  if (extra.variante) parametros.set("variante", extra.variante);
  if (extra.campo) parametros.set("campo", extra.campo);
  if (extra.ficha) parametros.set("ficha", extra.ficha);

  /*
    `replace` y no `push`: la URL con `?estado=` es el acuse de recibo, no un
    sitio al que volver. Encadenando tres altas, el botón de atrás iría
    felicitando por fichas que ya se guardaron.
  */
  redirect(`${rutaDeLista(clave)}?${parametros}`, RedirectType.replace);
}

/**
 * La lista que viene en el formulario. Se comprueba contra el descriptor antes
 * de tocar nada: el valor viaja en un campo oculto, así que viene de fuera, y
 * una clave inventada acabaría en un `from("")` sin sentido.
 */
function listaPedida(datos: FormData): { clave: ClaveLista; lista: ListaDeContenido } {
  const clave = String(datos.get("lista") ?? "").trim();
  // Sin lista válida no hay ni a dónde volver con el error: a la raíz del módulo.
  if (!esClaveLista(clave)) redirect(RUTA_CONTENIDO, RedirectType.replace);
  return { clave, lista: LISTAS_DE_CONTENIDO[clave] };
}

/** La variante elegida, si la lista está partida y el valor es de los suyos. */
function variantePedida(lista: ListaDeContenido, datos: FormData): string | undefined {
  if (lista.destino.clase !== "partida") return undefined;
  const pedida = String(datos.get("variante") ?? "").trim();
  const valida = lista.destino.opciones.some((opcion) => opcion.valor === pedida);
  return valida ? pedida : lista.destino.opciones[0].valor;
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/** Segunda capa, no la autorización: la autorización es RLS. */
async function cortarSiEsLector(clave: ClaveLista, variante?: string): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver(clave, "sin-permiso", { variante });
}

/** Traduce el fallo de la base a uno de nuestros estados. */
function motivo(error: { code?: string; message?: string }): EstadoLista {
  if (error.code === "42501") return "sin-permiso";
  // Un CHECK de «no vacío» que se escapa de la validación de arriba.
  if (error.code === "23514") return "falta";
  return "error";
}

/**
 * Los campos del formulario, ya validados.
 *
 * SE VALIDA AQUÍ AUNQUE LA BASE YA VALIDE. Las cuatro tablas tienen sus `CHECK`
 * de «no vacío» y son ellos los que mandan, pero un `CHECK` que salta devuelve
 * un error de Postgres con el nombre de la restricción, y eso no es un mensaje
 * para nadie. Se comprueba antes para poder decir en castellano QUÉ campo
 * falta, y el `CHECK` se queda detrás como red.
 *
 * UN CAMPO OPCIONAL VACÍO ES `null`, NO CADENA VACÍA. Es lo que hacen el resto
 * de acciones del panel, y aquí además importa: `btrim(campo) <> ''` rechaza la
 * cadena vacía, así que guardarla reventaría justo lo que se quería permitir.
 */
function camposValidados(
  clave: ClaveLista,
  lista: ListaDeContenido,
  datos: FormData,
  variante: string | undefined,
): Record<string, string | null> {
  const valores: Record<string, string | null> = {};

  for (const campo of lista.campos) {
    const escrito = String(datos.get(campo.columna) ?? "").trim();

    if (campo.obligatorio && !escrito) {
      volver(clave, "falta", { variante, campo: campo.columna });
    }
    if (escrito.length > campo.largo) {
      volver(clave, "largo", { variante, campo: campo.columna });
    }

    valores[campo.columna] = escrito || null;
  }

  return valores;
}

/**
 * La landing lee estas tablas en cada petición, así que no haría falta
 * revalidar por ella. Sí por el layout: el menú de la barra sale de qué
 * secciones tienen contenido, y una sección que se queda vacía deja de estar.
 */
function refrescarLaWeb(): void {
  revalidatePath("/", "layout");
}

/** Añade una ficha al final de la lista. */
export async function crearFicha(datos: FormData): Promise<void> {
  const { clave, lista } = listaPedida(datos);
  const variante = variantePedida(lista, datos);

  await cortarSiEsLector(clave, variante);

  const valores = camposValidados(clave, lista, datos, variante);

  try {
    const supabase = await cliente();

    /*
      NACE LA ÚLTIMA Y PUBLICADA. Lo primero porque es donde la pone quien la
      escribe —se añade al final de lo que ya hay—, y lo segundo porque el
      `default` de la tabla ya es `publicado = true`: quien añade un hotel
      quiere que se vea, y para lo otro está el botón de retirar.
    */
    /*
      EL SIGUIENTE ES EL MAYOR MÁS UNO, NO CUÁNTAS HAY. Aquí ponía
      `existentes.length` y nacía en medio: el seed espacia los órdenes de diez
      en diez —0, 10, 20, para poder colar algo entre medias sin renumerar— así
      que con tres fichas la cuarta nacía con orden 3 y se colocaba **la
      segunda**. Lo destapó el E2E de mover, que encontró un botón de «bajar»
      donde no debía haberlo.
    */
    const existentes = await obtenerFilasDeLista(clave, variante);
    const ultimo = existentes.reduce((mayor, fila) => Math.max(mayor, fila.orden), -1);
    const siguiente = Math.min(ultimo + 1, TOPE_ORDEN_CONTENIDO);

    const fila: Record<string, unknown> = { ...valores, orden: siguiente };
    if (lista.destino.clase === "partida" && variante) {
      fila[lista.destino.columna] = variante;
    }

    const { data, error } = await supabase.from(lista.tabla).insert(fila).select("id");

    if (error) {
      console.error(`No se pudo añadir a «${clave}»:`, error);
      volver(clave, motivo(error), { variante });
    }
    if (!data?.length) volver(clave, "sin-permiso", { variante });
  } catch (error) {
    // `redirect` funciona lanzando: si no se deja pasar, los saltos de arriba
    // se quedarían aquí atrapados y la pantalla no diría nada.
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error(`Fallo al añadir a «${clave}»:`, error);
    volver(clave, "error", { variante });
  }

  refrescarLaWeb();
  volver(clave, "creada", { variante });
}

/** Guarda los cambios de una ficha que ya existe. */
export async function guardarFicha(datos: FormData): Promise<void> {
  const { clave, lista } = listaPedida(datos);
  const variante = variantePedida(lista, datos);
  const id = String(datos.get("ficha") ?? "").trim();

  if (!id) volver(clave, "no-encontrada", { variante });
  await cortarSiEsLector(clave, variante);

  const valores = camposValidados(clave, lista, datos, variante);

  try {
    const supabase = await cliente();
    const { data, error } = await supabase
      .from(lista.tabla)
      .update(valores)
      .eq("id", id)
      .select("id");

    if (error) {
      console.error(`No se pudo guardar en «${clave}»:`, error);
      volver(clave, motivo(error), { variante, ficha: id });
    }
    if (!data?.length) volver(clave, "sin-permiso", { variante, ficha: id });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error(`Fallo al guardar en «${clave}»:`, error);
    volver(clave, "error", { variante, ficha: id });
  }

  refrescarLaWeb();
  volver(clave, "guardada", { variante });
}

/** Retira una ficha de la web, o la vuelve a poner. Es un interruptor. */
export async function alternarPublicado(datos: FormData): Promise<void> {
  const { clave, lista } = listaPedida(datos);
  const variante = variantePedida(lista, datos);
  const id = String(datos.get("ficha") ?? "").trim();

  if (!id) volver(clave, "no-encontrada", { variante });
  await cortarSiEsLector(clave, variante);

  // Llega el valor que se quiere dejar puesto, no el actual: así el formulario
  // dice qué va a pasar y no hay que leer la fila antes de escribirla.
  const publicado = String(datos.get("publicado") ?? "") === "si";

  try {
    const supabase = await cliente();
    const { data, error } = await supabase
      .from(lista.tabla)
      .update({ publicado })
      .eq("id", id)
      .select("id");

    if (error) {
      console.error(`No se pudo cambiar la publicación en «${clave}»:`, error);
      volver(clave, motivo(error), { variante });
    }
    if (!data?.length) volver(clave, "sin-permiso", { variante });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error(`Fallo al cambiar la publicación en «${clave}»:`, error);
    volver(clave, "error", { variante });
  }

  refrescarLaWeb();
  volver(clave, publicado ? "publicada" : "retirada", { variante });
}

/**
 * EL PRIMER PASO DE BORRAR: PREGUNTAR.
 *
 * No escribe nada. Sólo lleva a la misma pantalla con la ficha señalada, que es
 * donde se pinta la pregunta y el botón que sí borra — junto con la salida
 * suave, «mejor sólo retirarla». Una ficha borrada no vuelve, y esta pantalla se
 * usa desde el móvil con una mano.
 *
 * Va por la URL y no por JavaScript para que funcione igual con el bundle a
 * medio cargar, como el resto del panel.
 */
export async function pedirBorrado(datos: FormData): Promise<void> {
  const { clave, lista } = listaPedida(datos);
  const variante = variantePedida(lista, datos);
  const id = String(datos.get("ficha") ?? "").trim();

  if (!id) volver(clave, "no-encontrada", { variante });
  await cortarSiEsLector(clave, variante);

  volver(clave, "confirmar-borrado", { variante, ficha: id });
}

/** Y el segundo: borrar de verdad. */
export async function borrarFicha(datos: FormData): Promise<void> {
  const { clave, lista } = listaPedida(datos);
  const variante = variantePedida(lista, datos);
  const id = String(datos.get("ficha") ?? "").trim();

  if (!id) volver(clave, "no-encontrada", { variante });
  await cortarSiEsLector(clave, variante);

  try {
    const supabase = await cliente();
    const { data, error } = await supabase.from(lista.tabla).delete().eq("id", id).select("id");

    if (error) {
      console.error(`No se pudo borrar de «${clave}»:`, error);
      volver(clave, motivo(error), { variante });
    }

    /*
      Cero filas aquí puede ser RLS callando o una ficha que ya no existía —dos
      pestañas abiertas y en la otra se borró hace un minuto—. Se dice lo
      segundo: es lo más probable con diferencia, y a un lector ya se le ha
      cortado antes de llegar aquí.
    */
    if (!data?.length) volver(clave, "no-encontrada", { variante });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error(`Fallo al borrar de «${clave}»:`, error);
    volver(clave, "error", { variante });
  }

  refrescarLaWeb();
  volver(clave, "borrada", { variante });
}

/**
 * Sube o baja una ficha.
 *
 * VA POR RENUMERADO Y NO POR RPC, al revés que las secciones de la landing: el
 * `orden` de estas cuatro tablas NO es único, así que no hay unicidad diferida
 * que obligue a meter las dos escrituras en el mismo commit. Es el camino de
 * `moverTarea`.
 *
 * QUIÉN DECIDE EL ORDEN ES LA PANTALLA, no la base: se permuta sobre la lista
 * tal y como se está viendo. Ordenar aquí por un criterio y allí por otro haría
 * que el botón de subir moviera la ficha a un sitio que nadie ha visto.
 */
export async function moverFicha(datos: FormData): Promise<void> {
  const { clave, lista } = listaPedida(datos);
  const variante = variantePedida(lista, datos);
  const id = String(datos.get("ficha") ?? "").trim();
  const direccion = String(datos.get("direccion") ?? "");

  if (!id) volver(clave, "no-encontrada", { variante });
  if (!esDireccion(direccion)) volver(clave, "error", { variante });
  await cortarSiEsLector(clave, variante);

  try {
    const filas = await obtenerFilasDeLista(clave, variante);
    const cambios = permutarConElVecino(filas, id, direccion);

    // Ya estaba arriba del todo, o abajo del todo. No es un error: es que no
    // hay a dónde, y la pantalla ya no pinta ese botón.
    if (cambios.length === 0) volver(clave, "movida", { variante });

    const supabase = await cliente();

    for (const cambio of cambios) {
      const { data, error } = await supabase
        .from(lista.tabla)
        .update({ orden: cambio.orden })
        .eq("id", cambio.id)
        .select("id");

      if (error) {
        console.error(`No se pudo reordenar «${clave}»:`, error);
        volver(clave, motivo(error), { variante });
      }
      if (!data?.length) volver(clave, "sin-permiso", { variante });
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error(`Fallo al reordenar «${clave}»:`, error);
    volver(clave, "error", { variante });
  }

  refrescarLaWeb();
  volver(clave, "movida", { variante });
}
