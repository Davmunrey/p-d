"use server";

import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_RECUENTO } from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoDia, type ResultadoDeMarcar } from "./estado";

/**
 * BODA-100 y BODA-103 · LO QUE SE ESCRIBE EL DÍA DE LA BODA
 *
 * Sólo dos cosas se escriben ese día, y las dos son correcciones sobre algo ya
 * decidido: marcar un punto del guion como hecho, y ajustar el recuento del
 * catering cuando alguien falla a última hora.
 *
 * LAS DOS SE COMPORTAN DISTINTO A PROPÓSITO. La corrección del recuento
 * redirige con su aviso, como el resto del panel: se hace una vez, sentado, y
 * conviene ver el resultado escrito. Marcar un punto del guion devuelve un
 * resultado y no redirige — se explica en `estado.ts`, y el motivo de fondo es
 * que sin cobertura hay que poder distinguir «no llegó» de «no puedes».
 *
 * EL SILENCIO DE RLS VALE AQUÍ IGUAL QUE EN TODO EL PANEL: una escritura
 * prohibida no da error, devuelve cero filas. Por eso las dos piden de vuelta
 * lo que han escrito en vez de conformarse con que `error` sea nulo.
 */

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

function esSinPermiso(error: { code?: string; message?: string }): boolean {
  return error.code === "42501" || Boolean(error.message?.includes("RSV06"));
}

/**
 * Marca —o desmarca— un punto del guion.
 *
 * ES UN INTERRUPTOR Y NO DOS ACCIONES. Marcar por error pasa constantemente
 * cuando se pulsa de pie y con el móvil en una mano; si deshacer costara abrir
 * otra pantalla, la lista acabaría mintiendo antes del postre.
 *
 * LA HORA LA PONE EL SERVIDOR, con `now()` en la base. El reloj del móvil que
 * marca es el de un invitado, y puede ir diez minutos adelantado; la marca dice
 * cuándo pasó algo en la boda, no qué hora creía que era un teléfono.
 */
export async function marcarPuntoDelGuion(
  id: string,
  hecho: boolean,
): Promise<ResultadoDeMarcar> {
  if (!id) return { ok: false, motivo: "error" };

  const supabase = await cliente();

  /*
    `now()` no se puede escribir desde PostgREST como valor, así que la hora
    viaja desde aquí. No es el reloj del móvil —esto corre en el servidor—, que
    es lo que importaba evitar.
  */
  const { data, error } = await supabase
    .from("guion_dia")
    .update({ hecho_en: hecho ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");

  if (error) {
    if (esSinPermiso(error)) return { ok: false, motivo: "sin-permiso" };
    console.error("Fallo marcando un punto del guion:", error);
    return { ok: false, motivo: "error" };
  }

  // Cero filas y sin error es RLS callando: un lector no marca nada.
  if (!data?.length) return { ok: false, motivo: "sin-permiso" };

  return { ok: true };
}

function volver(estado: EstadoDia): never {
  redirect(`${RUTA_RECUENTO}?estado=${estado}`);
}

/**
 * LA CORRECCIÓN DE ÚLTIMA HORA, que es media razón de ser del módulo.
 *
 * Dos horas antes del banquete llama alguien diciendo que no va. Cambiar su
 * confirmación sería lo lógico y es justo lo que no se quiere hacer: esa
 * confirmación es lo que esa persona contestó, y reescribirla borra el dato de
 * que dijo que sí. Lo que cambia es lo que se le pide al catering, y por eso la
 * corrección vive en su propia tabla y se suma en la vista.
 *
 * UNA CORRECCIÓN POR MENÚ, que lo garantiza `correcciones_recuento_menu_unico`
 * en la base. Aquí se traduce a un `upsert`: corregir dos veces el mismo menú
 * es cambiar la corrección, no apilar dos.
 */
export async function corregirRecuento(datos: FormData): Promise<void> {
  const tipoMenu = String(datos.get("tipo_menu") ?? "").trim();
  if (!tipoMenu) volver("menu-invalido");

  const escrito = String(datos.get("ajuste") ?? "").trim();

  /*
    SE ACEPTA EL MENOS DE VERDAD Y EL GUION DEL TECLADO. «−2» con el signo
    matemático es lo que escribe un móvil cuando alguien mantiene pulsada la
    tecla, y rechazarlo sería rechazar un dato correcto por un carácter que ni
    se distingue a simple vista.
  */
  const ajuste = Number(escrito.replace("−", "-"));
  if (!Number.isInteger(ajuste) || ajuste < -500 || ajuste > 500) {
    volver("ajuste-invalido");
  }

  const nota = String(datos.get("nota") ?? "").trim() || null;

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("correcciones_recuento")
    .upsert({ tipo_menu: tipoMenu, ajuste, nota }, { onConflict: "tipo_menu" })
    .select("id");

  if (error) {
    if (esSinPermiso(error)) volver("sin-permiso");
    // Un menú que no existe en el enumerado llega como error de tipo.
    if (error.code === "22P02") volver("menu-invalido");
    if (error.message?.includes("correcciones_recuento_ajuste_rango")) {
      volver("ajuste-invalido");
    }
    console.error("Fallo corrigiendo el recuento:", error);
    volver("error");
  }

  if (!data?.length) volver("sin-permiso");

  volver("corregido");
}
