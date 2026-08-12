"use server";

import { redirect } from "next/navigation";

import {
  CAPACIDAD_MAXIMA_MESA,
  CAPACIDAD_MINIMA_MESA,
  LADO_PLANO_MESAS,
  PASO_PLANO_MESAS,
  RUTA_ACCESO,
  RUTA_MESAS,
} from "@/config/constants";
import {
  contarSentados,
  esFormaMesa,
  ESTADO_CONFIRMADO,
  FORMA_INICIAL_MESA,
  obtenerMesa,
  obtenerSentablesDelGrupo,
  obtenerSitioDeInvitado,
} from "@/lib/bbdd/mesas";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoMesas } from "./estado";

/**
 * BODA-83 y BODA-84 · COLOCAR LAS MESAS Y SENTAR A LA GENTE
 *
 * QUIÉN PUEDE ESCRIBIR LO DECIDE LA BASE, no este fichero. La política
 * `mesas_editor_escribir` exige `puede_editar()`, y `invitados_editor_escribir`
 * lo mismo para el reparto. Aquí sólo se traduce ese «no» a una frase en
 * castellano y se evita ofrecer un botón que va a fallar.
 *
 * OJO CON EL SILENCIO DE RLS: una escritura prohibida no da error, devuelve
 * cero filas tocadas. Por eso cada operación pide de vuelta lo que ha escrito y
 * mira si ha venido algo, en lugar de conformarse con que `error` sea nulo.
 *
 * PASARSE DE LA CAPACIDAD SE IMPIDE AQUÍ Y NO EN LA BASE, a propósito. La tabla
 * deja deliberadamente que una mesa se pase —lo dice su propio comentario—
 * porque durante el reparto se sobrepasa temporalmente todo el rato: se mete a
 * la familia entera y luego se saca a dos. Lo que no puede pasar es que se
 * sobrepase **sin enterarse**, así que la comprobación va en la puerta por la
 * que se sienta a la gente, con el recuento hecho EN LA BASE justo antes de
 * escribir. Contarlo sobre lo que tenía pintado la pantalla sería contar lo de
 * hace unos segundos, y la otra mitad de la pareja está sentando gente desde su
 * móvil al mismo tiempo.
 *
 * NO SE REVALIDA NINGUNA RUTA. Todas las acciones vuelven a `RUTA_MESAS`, y
 * `revalidatePath` de la ruta a la que se redirige compite con la redirección:
 * el refresco repinta la página donde ya estás y el `?estado=` se pierde por el
 * camino, así que la operación ocurre y no sale ningún aviso. La pantalla es
 * `force-dynamic`, o sea que la redirección ya la vuelve a leer entera.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/** `""` se convierte en `null`: una columna opcional vacía es ausencia, no cadena vacía. */
function opcional(datos: FormData, campo: string): string | null {
  return texto(datos, campo) || null;
}

/**
 * Vuelve a la pantalla con el resultado, y con lo que haga falta para contarlo.
 *
 * EL DETALLE VIAJA EN IDENTIFICADORES Y CIFRAS, nunca en nombres. La pantalla
 * resuelve el `id` de la mesa contra la base al pintar el aviso, así que un
 * cambio de nombre entre la acción y el repintado no deja una frase mintiendo,
 * y la barra de direcciones no acaba con el nombre de una mesa dentro.
 */
function volver(estado: EstadoMesas, detalle?: Record<string, string | number>): never {
  const parametros = new URLSearchParams({ estado });
  for (const [clave, valor] of Object.entries(detalle ?? {})) {
    parametros.set(clave, String(valor));
  }
  redirect(`${RUTA_MESAS}?${parametros.toString()}`);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * Traduce el fallo de la base a un estado de pantalla.
 *
 * `42501` y `RSV06` son «no tienes permiso»; `23505` es el índice único del
 * nombre de mesa —«Mesa 4» y «mesa 4 » son la misma para quien organiza—; y
 * `23503` es una clave ajena que impide borrar. El resto es una avería nuestra
 * y se registra entera: el mensaje de PostgREST dice qué restricción saltó.
 */
function motivo(error: { code?: string; message?: string }): EstadoMesas {
  if (error.code === "42501" || error.message?.includes("RSV06")) return "sin-permiso";
  if (error.code === "23505") return "nombre-repetido";
  if (error.code === "23503") return "en-uso";
  console.error("Fallo escribiendo en mesas:", error);
  return "error";
}

/** Una capacidad tecleada → un número entero dentro del rango de la base. */
function leerCapacidad(bruta: string): number | null {
  const numero = Number(bruta);
  if (!Number.isInteger(numero)) return null;
  if (numero < CAPACIDAD_MINIMA_MESA || numero > CAPACIDAD_MAXIMA_MESA) return null;
  return numero;
}

/**
 * Las dos coordenadas de una mesa, o ninguna.
 *
 * `null` significa «no colocada» y es un estado legítimo: una mesa puede
 * existir, tener gente y no tener todavía sitio en la sala. Media coordenada,
 * en cambio, no significa nada — y la base se niega igualmente con
 * `mesas_posicion_completa`. Aquí se dice antes y con una frase.
 */
function leerPosicion(
  datos: FormData,
): { ok: true; x: number | null; y: number | null } | { ok: false } {
  const brutoX = texto(datos, "posicion_x");
  const brutoY = texto(datos, "posicion_y");

  if (!brutoX && !brutoY) return { ok: true, x: null, y: null };
  if (!brutoX || !brutoY) return { ok: false };

  const x = Number(brutoX);
  const y = Number(brutoY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false };
  if (x < 0 || x > LADO_PLANO_MESAS || y < 0 || y > LADO_PLANO_MESAS) return { ok: false };

  return { ok: true, x, y };
}

/** Nunca fuera del lienzo: la base lo rechazaría y empujar no puede dar error. */
function dentroDelLienzo(valor: number): number {
  return Math.min(Math.max(valor, 0), LADO_PLANO_MESAS);
}

/* -------------------------------------------------------------------------- */
/*  BODA-83 · Las mesas y el plano                                            */
/* -------------------------------------------------------------------------- */

export async function crearMesa(datos: FormData): Promise<void> {
  const nombre = texto(datos, "nombre");
  // La base exige entre 1 y 60 caracteres: lo que se corta aquí es el campo
  // vacío o con un espacio, no un nombre corto de verdad («A», «1»).
  if (!nombre) volver("nombre");

  const capacidad = leerCapacidad(texto(datos, "capacidad"));
  if (capacidad === null) volver("capacidad");

  const forma = texto(datos, "forma") || FORMA_INICIAL_MESA;
  if (!esFormaMesa(forma)) volver("forma");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("mesas")
    /*
      NACE SIN COLOCAR, y no es un olvido. Una mesa se crea mientras se piensa
      cuántas hacen falta, no mientras se dibuja la sala: pedir las coordenadas
      en el alta convierte «apunta otra mesa» en «decide dónde va». Se coloca
      después, de una en una y mirando el plano.
    */
    .insert({ nombre, capacidad, forma, notas: opcional(datos, "notas") })
    .select("id");

  if (error) volver(motivo(error));
  // Cero filas y sin error es RLS callando: un lector no crea mesas.
  if (!data?.length) volver("sin-permiso");

  volver("creada");
}

export async function editarMesa(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const nombre = texto(datos, "nombre");
  if (!nombre) volver("nombre");

  const capacidad = leerCapacidad(texto(datos, "capacidad"));
  if (capacidad === null) volver("capacidad");

  const forma = texto(datos, "forma");
  if (!esFormaMesa(forma)) volver("forma");

  const posicion = leerPosicion(datos);
  if (!posicion.ok) volver("posicion", { mesa: id });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("mesas")
    .update({
      nombre,
      capacidad,
      forma,
      posicion_x: posicion.x,
      posicion_y: posicion.y,
      notas: opcional(datos, "notas"),
    })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("editada");
}

/**
 * COLOCAR EN EL CENTRO, que es lo que hace falta para empezar.
 *
 * Una mesa sin coordenadas no sale en el plano, y lo que se quiere en ese
 * momento no es teclear dos números: es verla aparecer para empujarla a su
 * sitio con las flechas. El centro es el único punto que no está encima de una
 * pared y que siempre queda a la vista.
 */
export async function colocarMesa(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const centro = LADO_PLANO_MESAS / 2;

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("mesas")
    .update({ posicion_x: centro, posicion_y: centro })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("colocada");
}

/**
 * MOVER UNA MESA SIN RATÓN Y SIN JAVASCRIPT.
 *
 * Cuatro botones dentro de un formulario, un paso fijo por pulsación. Arrastrar
 * es más cómodo con un ratón y **no funciona** con el teclado, con un lector de
 * pantalla ni con un dedo tembloroso en el móvil de la finca, que es donde se
 * abre esto el día antes. Las flechas funcionan en los cuatro sitios.
 *
 * Y el resultado se guarda en la base, no en el navegador: el plano tiene que
 * sobrevivir a una recarga y verse igual desde el otro móvil.
 */
export async function empujarMesa(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const sentido = texto(datos, "sentido");

  const mesa = await obtenerMesa(id);
  if (!mesa) volver("no-existe");
  // Una mesa sin colocar no se puede empujar: no hay desde dónde.
  if (mesa.posicionX === null || mesa.posicionY === null) volver("posicion", { mesa: id });

  let x = mesa.posicionX;
  let y = mesa.posicionY;

  switch (sentido) {
    case "arriba":
      y -= PASO_PLANO_MESAS;
      break;
    case "abajo":
      y += PASO_PLANO_MESAS;
      break;
    case "izquierda":
      x -= PASO_PLANO_MESAS;
      break;
    case "derecha":
      x += PASO_PLANO_MESAS;
      break;
    default:
      volver("posicion", { mesa: id });
  }

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("mesas")
    .update({ posicion_x: dentroDelLienzo(x), posicion_y: dentroDelLienzo(y) })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("movida");
}

/**
 * BORRAR UNA MESA AVISA ANTES SI HAY GENTE SENTADA.
 *
 * `invitados.mesa_id` es `on delete set null`: la base **no se niega**, y hace
 * bien —borrar una mesa no puede borrar personas—, pero eso significa que sus
 * ocho invitados vuelven a la bolsa de «sin mesa» sin que nadie lo haya pedido.
 * Con el reparto medio hecho, deshacer eso es media tarde.
 *
 * Así que el primer envío no borra: devuelve el aviso con cuánta gente se
 * quedaría de pie, y la pantalla enseña el botón que ya trae la confirmación.
 * Dos pasos, los dos por `POST`, y sin una línea de JavaScript.
 */
export async function borrarMesa(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe");

  const supabase = await cliente();

  if (texto(datos, "confirmar") !== "si") {
    const sentados = await contarSentados(id);
    // Sin recuento no se borra: quedaría gente de pie sin haberlo preguntado.
    if (sentados === null) volver("error");
    if (sentados > 0) volver("confirmar-borrado", { mesa: id, cuantos: sentados });
  }

  const { data, error } = await supabase.from("mesas").delete().eq("id", id).select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  volver("borrada");
}

/* -------------------------------------------------------------------------- */
/*  BODA-84 · El reparto                                                      */
/* -------------------------------------------------------------------------- */

export async function sentarInvitado(datos: FormData): Promise<void> {
  const invitadoId = texto(datos, "invitado_id");
  if (!invitadoId) volver("invitado");

  const mesaId = texto(datos, "mesa_id");
  const supabase = await cliente();

  const sitio = await obtenerSitioDeInvitado(invitadoId);
  if (!sitio) volver("invitado");

  /*
    SIN MESA ELEGIDA SE LEVANTA DE LA SILLA: es la única forma de deshacer una
    asignación, y tiene que estar en el mismo desplegable que la hizo.

    Pero sólo si estaba sentado. En la bolsa de «todavía sin mesa» el
    desplegable empieza en «Elegir mesa…», que vale lo mismo que vacío: enviar
    sin tocarlo es un olvido, y contestar «se ha quitado de la mesa» a quien
    nunca la tuvo suena a que algo se ha deshecho.
  */
  if (!mesaId) {
    if (!sitio.mesaId) volver("mesa");

    const { data, error } = await supabase
      .from("invitados")
      .update({ mesa_id: null })
      .eq("id", invitadoId)
      .select("id");

    if (error) volver(motivo(error));
    if (!data?.length) volver("sin-permiso");

    volver("levantado");
  }

  // Ya estaba en esa mesa: no se escribe nada y no se cuenta a nadie dos veces.
  if (sitio.mesaId === mesaId) volver("sentado");

  const mesa = await obtenerMesa(mesaId);
  if (!mesa) volver("mesa");

  const sentados = await contarSentados(mesaId);
  // Sin recuento no se sienta a nadie: el tope dejaría de existir en silencio.
  if (sentados === null) volver("error");
  if (sentados + 1 > mesa.capacidad) {
    volver("sin-sitio", { mesa: mesa.id, caben: mesa.capacidad, habria: sentados + 1 });
  }

  const { data, error } = await supabase
    .from("invitados")
    .update({ mesa_id: mesaId })
    .eq("id", invitadoId)
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  /*
    SENTAR A QUIEN NO HA CONTESTADO SE PERMITE. El reparto se empieza antes de
    que conteste todo el mundo o no se empieza nunca — y a la tía que seguro que
    viene hay que ponerla en algún sitio. Lo que no puede pasar es que se olvide
    que sigue sin confirmar, así que se guarda y se dice.
  */
  volver(sitio.estado === ESTADO_CONFIRMADO ? "sentado" : "sentado-sin-confirmar");
}

/**
 * SENTAR AL GRUPO ENTERO EN UNA MESA.
 *
 * Es el botón que de verdad se usa. Los invitados no llegan de uno en uno:
 * llegan en familias, y sentar a una familia de cinco de uno en uno son cinco
 * viajes en los que es facilísimo dejarse a la abuela en otra mesa.
 *
 * MUEVE A TODO EL GRUPO, también a quien ya estaba sentado en otro sitio. Es lo
 * que significa «se sientan juntos»: si media familia estaba repartida, esto lo
 * arregla de una vez en lugar de dejar el arreglo a medias.
 *
 * PARA CONTAR EL SITIO, LOS DEL PROPIO GRUPO NO CUENTAN DOS VECES. Sin excluir
 * al grupo, mover a una familia que YA está en esa mesa —para reordenarla— daría
 * «no caben» contra sí misma.
 */
export async function sentarGrupo(datos: FormData): Promise<void> {
  const grupoId = texto(datos, "grupo_id");
  if (!grupoId) volver("grupo");

  const mesaId = texto(datos, "mesa_id");
  if (!mesaId) volver("mesa");

  const mesa = await obtenerMesa(mesaId);
  if (!mesa) volver("mesa");

  const gente = await obtenerSentablesDelGrupo(grupoId);
  if (gente.length === 0) volver("grupo");

  const otros = await contarSentados(mesaId, grupoId);
  if (otros === null) volver("error");
  const habria = otros + gente.length;
  if (habria > mesa.capacidad) {
    volver("sin-sitio", { mesa: mesa.id, caben: mesa.capacidad, habria });
  }

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("invitados")
    .update({ mesa_id: mesaId })
    .in(
      "id",
      gente.map((persona) => persona.id),
    )
    .select("id");

  if (error) volver(motivo(error));
  if (!data?.length) volver("sin-permiso");

  const todosConfirmados = gente.every((persona) => persona.estado === ESTADO_CONFIRMADO);
  volver(todosConfirmados ? "sentado" : "sentado-sin-confirmar");
}
