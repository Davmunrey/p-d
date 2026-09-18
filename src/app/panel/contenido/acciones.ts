"use server";

import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_CONTENIDO } from "@/config/constants";
import { esSeccionConocida } from "@/config/secciones";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import type { EstadoContenido } from "./estado";

/**
 * BODA-128 · ENCENDER, APAGAR Y ORDENAR LAS SECCIONES DE LA LANDING
 *
 * Dos escrituras y nada más: `visible` y `orden`. El conjunto de secciones no
 * se toca desde aquí —lo fija el enumerado `seccion_landing`, y por eso la
 * tabla sólo tiene `grant update`, sin `insert` ni `delete`—.
 *
 * QUIÉN PUEDE lo decide RLS, no este fichero. `secciones_landing_editor_
 * actualizar` exige `puede_editar()`. Un lector llega hasta aquí —la pantalla
 * se le enseña, para que vea cómo está la web— y la base no le deja escribir.
 * Lo que se hace aquí es traducir ese «no» a una frase.
 *
 * Y HAY QUE MIRARLO, PORQUE RLS NO DA ERROR: una escritura prohibida devuelve
 * cero filas. Sin comprobarlo, un lector pulsaba «mostrar», no pasaba nada, y
 * la pantalla le decía «ya se ve en la web».
 */

/**
 * `replace` y no `push`, como en Medios: la URL con `?estado=` es el acuse de
 * recibo, no un sitio al que volver. Sin esto, encadenar tres cambios deja tres
 * entradas en el historial y el botón de atrás va felicitando por cosas que ya
 * pasaron.
 */
function volver(estado: EstadoContenido): never {
  redirect(`${RUTA_CONTENIDO}?estado=${estado}`, RedirectType.replace);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * Segunda capa, no la autorización. La autorización es RLS —`secciones_landing_
 * editor_actualizar` exige `puede_editar()`— y aquí sólo se corta antes de
 * gastar un salto de red que ya sabemos que va a devolver cero filas. Si esta
 * comprobación desapareciera, la base seguiría diciendo que no.
 */
async function cortarSiEsLector(): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso");
}

/**
 * Traduce el fallo de la base a uno de nuestros estados.
 *
 * Los códigos `SEC01` y `SEC02` los levanta `reordenar_seccion_landing()` y por
 * eso se miran por nombre y no por el texto, que es traducible y cambia.
 * `42501` es el mismo «no» dicho por Postgres cuando la escritura ni siquiera
 * llega a la función.
 */
function motivo(error: { code?: string; message?: string }): EstadoContenido {
  if (error.code === "42501" || error.message?.includes("SEC02")) return "sin-permiso";
  if (error.message?.includes("SEC01")) return "seccion-desconocida";
  // Un valor que el enumerado `seccion_landing` no conoce llega como error de
  // sintaxis de entrada; ya se filtra antes, pero la red vale de todos modos.
  if (error.code === "22P02") return "seccion-desconocida";
  return "error";
}

/**
 * La sección que viene en el formulario, o fuera.
 *
 * Se comprueba contra el enumerado del frontend antes de mandarla a la base.
 * No es paranoia: el valor viaja en un campo oculto, así que viene de fuera, y
 * un valor que el tipo `seccion_landing` no conoce llega a Postgres como error
 * de sintaxis (22P02) — un fallo genérico donde debería haber una frase.
 */
function seccionPedida(datos: FormData): string {
  const seccion = String(datos.get("seccion") ?? "").trim();
  if (!esSeccionConocida(seccion)) volver("seccion-desconocida");
  return seccion;
}

/**
 * La landing lee `secciones_landing` en cada petición, así que no haría falta
 * revalidar por ella. Sí por lo que cuelga del layout —el menú de la barra sale
 * de la misma tabla— y por las rutas propias, como `/reserva-la-fecha`, que
 * dejan de existir al apagar su sección.
 */
function refrescarLaWeb(): void {
  revalidatePath("/", "layout");
}

/** Enciende o apaga una sección. Es un interruptor, no dos acciones. */
export async function alternarVisible(datos: FormData): Promise<void> {
  const seccion = seccionPedida(datos);

  // Llega el valor que se quiere dejar puesto, no el actual: así el formulario
  // dice qué va a pasar y no hay que leer la fila antes de escribirla.
  const visible = String(datos.get("visible") ?? "") === "si";

  await cortarSiEsLector();

  try {
    const supabase = await cliente();

    const { data, error } = await supabase
      .from("secciones_landing")
      .update({ visible })
      .eq("seccion", seccion)
      .select("seccion");

    if (error) {
      console.error("No se pudo cambiar la visibilidad de una sección:", error);
      volver(motivo(error));
    }

    // Cero filas y sin error es RLS callando: un lector no enciende nada.
    if (!data?.length) volver("sin-permiso");
  } catch (error) {
    // `redirect` funciona lanzando: si no se deja pasar, los saltos de arriba
    // se quedarían aquí atrapados y la pantalla no diría nada.
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al cambiar la visibilidad de una sección:", error);
    volver("error");
  }

  refrescarLaWeb();
  volver(visible ? "mostrada" : "ocultada");
}

/**
 * Sube o baja una sección, permutándola con la de al lado.
 *
 * VA POR `reordenar_seccion_landing()` Y NO POR DOS `UPDATE`, porque la
 * unicidad de `orden` es diferida: las dos escrituras tienen que caer en el
 * mismo commit y dos llamadas por PostgREST son dos transacciones. Es el mismo
 * motivo por el que mover una foto va por `reordenar_medio()`.
 */
export async function moverSeccion(datos: FormData): Promise<void> {
  const seccion = seccionPedida(datos);

  const direccion = String(datos.get("direccion") ?? "");
  if (direccion !== "subir" && direccion !== "bajar") volver("error");

  await cortarSiEsLector();

  try {
    const supabase = await cliente();

    const { error } = await supabase.rpc("reordenar_seccion_landing", {
      p_seccion: seccion,
      p_hacia_arriba: direccion === "subir",
    });

    if (error) {
      console.error("No se pudo reordenar una sección:", error);
      volver(motivo(error));
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al reordenar una sección:", error);
    volver("error");
  }

  refrescarLaWeb();
  volver("movida");
}
