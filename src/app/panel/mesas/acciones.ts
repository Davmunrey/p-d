"use server";

import { redirect } from "next/navigation";

import {
  CAPACIDAD_MAXIMA_MESA,
  CAPACIDAD_MINIMA_MESA,
  LADO_PLANO_MESAS,
  PASO_PLANO_MESAS,
  RUTA_ACCESO,
  SEPARACION_COLOCAR_MESA,
} from "@/config/constants";
import {
  contarSentados,
  esFormaMesa,
  ESTADO_CONFIRMADO,
  ESTADO_RECHAZADO,
  FORMA_INICIAL_MESA,
  FORMA_PRESIDENCIA,
  obtenerMesa,
  obtenerMesas,
  obtenerSentablesDelGrupo,
  obtenerSitioDeInvitado,
  type Mesa,
} from "@/lib/bbdd/mesas";
import { ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import {
  ANCLA_NUEVA,
  ANCLA_PLANO,
  ANCLA_REPARTO,
  anclaDeMesa,
  esAnclaDeMesas,
  rutaDeAncla,
  type EstadoMesas,
} from "./estado";

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
 * NO SE REVALIDA NINGUNA RUTA. Todas las acciones vuelven a una de las vistas
 * de las mesas (`rutaDeAncla`), y `revalidatePath` de la ruta a la que se
 * redirige compite con la redirección: el refresco repinta la página donde ya
 * estás y el `?estado=` se pierde por el camino, así que la operación ocurre y
 * no sale ningún aviso. Las vistas son `force-dynamic`, o sea que la
 * redirección ya las vuelve a leer enteras.
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
function volver(
  estado: EstadoMesas,
  detalle?: Record<string, string | number>,
  /** El sitio de la pantalla al que se vuelve, y donde se pinta el aviso. */
  ancla?: string,
): never {
  const parametros = new URLSearchParams({ estado });
  for (const [clave, valor] of Object.entries(detalle ?? {})) {
    parametros.set(clave, String(valor));
  }
  if (ancla) parametros.set("ancla", ancla);
  redirect(`${rutaDeAncla(ancla)}?${parametros.toString()}${ancla ? `#${ancla}` : ""}`);
}

/** El ancla que manda el formulario, si es de las de esta pantalla. */
function anclaDelFormulario(datos: FormData): string | undefined {
  const ancla = texto(datos, "ancla");
  return esAnclaDeMesas(ancla) ? ancla : undefined;
}

/**
 * CERO FILAS NO ES SIEMPRE «NO PODÉIS»: con la mesa borrada desde el otro
 * móvil, a la propietaria le salía «sólo un editor puede tocar las mesas».
 */
async function ceroFilas(siNoEsPermiso: EstadoMesas = "no-existe"): Promise<EstadoMesas> {
  return (await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : siNoEsPermiso;
}

/**
 * LA PRESIDENCIA ES UNA SOLA. La forma «imperial» es la que la marca, y nada
 * impedía una segunda: el plano y el reparto pintaban dos «Presidencia». Se
 * comprueba aquí y no con un índice único porque una base que ya tenga dos no
 * podría aplicar la migración; se avisa al crear o al cambiar la forma.
 */
async function otraPresidencia(excepto?: string): Promise<Mesa | null | undefined> {
  const mesas = await obtenerMesas().catch(() => undefined);
  if (!mesas) return undefined;
  return mesas.find((mesa) => mesa.forma === FORMA_PRESIDENCIA && mesa.id !== excepto) ?? null;
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
  if (!nombre) volver("nombre", undefined, ANCLA_NUEVA);

  /*
    LOS ERRORES DEL ALTA VUELVEN AL ALTA. El formulario está al final de la
    pantalla, y el aviso salía en la cabecera: quien pulsaba «Crear mesa» no
    veía nada cambiar donde estaba y lo volvía a pulsar.
  */
  const capacidad = leerCapacidad(texto(datos, "capacidad"));
  if (capacidad === null) volver("capacidad", undefined, ANCLA_NUEVA);

  const forma = texto(datos, "forma") || FORMA_INICIAL_MESA;
  if (!esFormaMesa(forma)) volver("forma", undefined, ANCLA_NUEVA);

  if (forma === FORMA_PRESIDENCIA) {
    const otra = await otraPresidencia();
    if (otra === undefined) volver("error", undefined, ANCLA_NUEVA);
    if (otra) volver("presidencia-repetida", { mesa: otra.id }, ANCLA_NUEVA);
  }

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

  if (error) volver(motivo(error), undefined, ANCLA_NUEVA);
  // Cero filas y sin error es RLS callando: un lector no crea mesas.
  if (!data?.length) volver("sin-permiso", undefined, ANCLA_NUEVA);

  // A su bloque, que es donde está el botón de colocarla.
  const nueva = data[0]!.id as string;
  volver("creada", { mesa: nueva }, anclaDeMesa(nueva));
}

export async function editarMesa(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) volver("no-existe", undefined, ANCLA_REPARTO);

  const nombre = texto(datos, "nombre");
  if (!nombre) volver("nombre", { mesa: id }, anclaDeMesa(id));

  const capacidad = leerCapacidad(texto(datos, "capacidad"));
  if (capacidad === null) volver("capacidad", { mesa: id }, anclaDeMesa(id));

  const forma = texto(datos, "forma");
  if (!esFormaMesa(forma)) volver("forma", { mesa: id }, anclaDeMesa(id));

  const posicion = leerPosicion(datos);
  if (!posicion.ok) volver("posicion", { mesa: id }, anclaDeMesa(id));

  if (forma === FORMA_PRESIDENCIA) {
    const otra = await otraPresidencia(id);
    if (otra === undefined) volver("error", { mesa: id }, anclaDeMesa(id));
    if (otra) volver("presidencia-repetida", { mesa: otra.id }, anclaDeMesa(id));
  }

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

  if (error) volver(motivo(error), { mesa: id }, anclaDeMesa(id));
  if (!data?.length) volver(await ceroFilas(), { mesa: id }, anclaDeMesa(id));

  /*
    BAJAR LA CAPACIDAD POR DEBAJO DE LOS SENTADOS SE GUARDA, PERO SE DICE. Es
    la segunda puerta por la que una mesa se pasa sin enterarse —la primera es
    sentar, y ésa ya avisa—: antes salía «Mesa guardada» en verde y el «9 de 8»
    sólo se veía en su bloque.
  */
  const sentados = await contarSentados(id);
  if (sentados !== null && sentados > capacidad) {
    volver("editada-pasada", { mesa: id, caben: capacidad, habria: sentados }, anclaDeMesa(id));
  }
  volver("editada", { mesa: id }, anclaDeMesa(id));
}

/**
 * El primer hueco libre de una rejilla para colocar una mesa: recorrida de
 * arriba abajo y de izquierda a derecha, sin la zona de la pista de baile —que
 * está en el centro— y sin los huecos que ya ocupa otra mesa.
 */
function primerHuecoLibre(ocupadas: { x: number; y: number }[]): { x: number; y: number } {
  const centro = LADO_PLANO_MESAS / 2;
  const cerca = (a: number, b: number) => Math.abs(a - b) < SEPARACION_COLOCAR_MESA;

  for (let y = SEPARACION_COLOCAR_MESA; y < LADO_PLANO_MESAS; y += SEPARACION_COLOCAR_MESA) {
    for (let x = SEPARACION_COLOCAR_MESA; x < LADO_PLANO_MESAS; x += SEPARACION_COLOCAR_MESA) {
      const enLaPista = cerca(x, centro) && cerca(y, centro);
      const ocupado = ocupadas.some((otra) => cerca(x, otra.x) && cerca(y, otra.y));
      if (!enLaPista && !ocupado) return { x, y };
    }
  }
  // Sala llena de mesas: se deja en el centro y se coloca a mano.
  return { x: centro, y: centro };
}

/**
 * COLOCAR EN EL PRIMER HUECO LIBRE, que es lo que hace falta para empezar.
 *
 * Una mesa sin coordenadas no sale en el plano, y lo que se quiere en ese
 * momento no es teclear dos números: es verla aparecer para empujarla a su
 * sitio con las flechas. El centro es la pista de baile, así que se busca el
 * hueco más cercano que no pise otra mesa (`primerHuecoLibre`).
 *
 * Se coloca desde dos sitios —el bloque de la mesa en «Mesa a mesa» y la lista
 * de «sin colocar» del plano— y un fallo vuelve al que se pulsó.
 */
export async function colocarMesa(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  const ancla = anclaDelFormulario(datos) ?? (id ? anclaDeMesa(id) : ANCLA_PLANO);
  if (!id) volver("no-existe", undefined, ancla);

  const mesas = await obtenerMesas().catch(() => undefined);
  if (!mesas) volver("error", { mesa: id }, ancla);
  const hueco = primerHuecoLibre(
    mesas
      .filter((mesa) => mesa.id !== id && mesa.posicionX !== null && mesa.posicionY !== null)
      .map((mesa) => ({ x: mesa.posicionX!, y: mesa.posicionY! })),
  );

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("mesas")
    .update({ posicion_x: hueco.x, posicion_y: hueco.y })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), { mesa: id }, ancla);
  if (!data?.length) volver(await ceroFilas(), undefined, ancla);

  // Al plano, con sus flechas debajo: lo siguiente es empujarla a su sitio.
  volver("colocada", { mesa: id }, ANCLA_PLANO);
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
  if (!id) volver("no-existe", undefined, ANCLA_PLANO);

  const sentido = texto(datos, "sentido");

  const mesa = await obtenerMesa(id);
  if (mesa === undefined) volver("error", { mesa: id }, ANCLA_PLANO);
  if (!mesa) volver("no-existe", undefined, ANCLA_PLANO);
  // Una mesa sin colocar no se puede empujar: no hay desde dónde.
  if (mesa.posicionX === null || mesa.posicionY === null) {
    volver("posicion", { mesa: id }, anclaDeMesa(id));
  }

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
      volver("posicion", { mesa: id }, ANCLA_PLANO);
  }

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("mesas")
    .update({ posicion_x: dentroDelLienzo(x), posicion_y: dentroDelLienzo(y) })
    .eq("id", id)
    .select("id");

  if (error) volver(motivo(error), { mesa: id }, ANCLA_PLANO);
  if (!data?.length) volver(await ceroFilas(), undefined, ANCLA_PLANO);

  // Al plano, con las flechas de esta mesa debajo: se ven la mesa moviéndose
  // y el botón para seguir moviéndola, sin bajar veinte mil píxeles cada vez.
  volver("movida", { mesa: id }, ANCLA_PLANO);
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
  if (!id) volver("no-existe", undefined, ANCLA_REPARTO);

  const supabase = await cliente();

  if (texto(datos, "confirmar") !== "si") {
    const sentados = await contarSentados(id);
    // Sin recuento no se borra: quedaría gente de pie sin haberlo preguntado.
    if (sentados === null) volver("error", { mesa: id }, anclaDeMesa(id));
    // El aviso y el botón de confirmar, juntos en el bloque de la mesa.
    if (sentados > 0) {
      volver("confirmar-borrado", { mesa: id, cuantos: sentados }, anclaDeMesa(id));
    }
  }

  const { data, error } = await supabase.from("mesas").delete().eq("id", id).select("id");

  if (error) volver(motivo(error), { mesa: id }, anclaDeMesa(id));
  if (!data?.length) volver(await ceroFilas(), undefined, ANCLA_REPARTO);

  // Su bloque ya no existe: a la cabecera de «Mesa a mesa».
  volver("borrada", undefined, ANCLA_REPARTO);
}

/* -------------------------------------------------------------------------- */
/*  BODA-84 · El reparto                                                      */
/* -------------------------------------------------------------------------- */

export async function sentarInvitado(datos: FormData): Promise<void> {
  const ancla = anclaDelFormulario(datos);
  const invitadoId = texto(datos, "invitado_id");
  if (!invitadoId) volver("invitado", undefined, ancla);

  const mesaId = texto(datos, "mesa_id");
  const supabase = await cliente();

  const sitio = await obtenerSitioDeInvitado(invitadoId);
  if (!sitio) volver("invitado", undefined, ancla);

  /*
    SIN MESA ELEGIDA SE LEVANTA DE LA SILLA: es la única forma de deshacer una
    asignación, y tiene que estar en el mismo desplegable que la hizo.

    Pero sólo si estaba sentado. En la bolsa de «todavía sin mesa» el
    desplegable empieza en «Elegir mesa…», que vale lo mismo que vacío: enviar
    sin tocarlo es un olvido, y contestar «se ha quitado de la mesa» a quien
    nunca la tuvo suena a que algo se ha deshecho.
  */
  if (!mesaId) {
    if (!sitio.mesaId) volver("mesa", undefined, ancla);

    const { data, error } = await supabase
      .from("invitados")
      .update({ mesa_id: null })
      .eq("id", invitadoId)
      .select("id");

    if (error) volver(motivo(error), undefined, ancla);
    // Sin filas y con permiso, a esa persona la han quitado mientras tanto.
    if (!data?.length) volver(await ceroFilas("invitado"), undefined, ancla);

    volver("levantado", undefined, ancla);
  }

  // Ya estaba en esa mesa: no se escribe nada y no se cuenta a nadie dos veces.
  if (sitio.mesaId === mesaId) volver("sentado", undefined, ancla);

  const mesa = await obtenerMesa(mesaId);
  if (mesa === undefined) volver("error", undefined, ancla);
  // Se eligió una mesa, y ya no está: la borró alguien desde el otro móvil.
  if (!mesa) volver("no-existe", undefined, ancla);

  /*
    QUIEN DIJO QUE NO VIENE NO OCUPA SILLA, como en el resto del módulo: si se
    le cambia de mesa, no se le cuenta, y no se contesta que «todavía no ha
    confirmado», porque sí contestó.
  */
  const noViene = sitio.estado === ESTADO_RECHAZADO;
  const sentados = await contarSentados(mesaId);
  // Sin recuento no se sienta a nadie: el tope dejaría de existir en silencio.
  if (sentados === null) volver("error", undefined, ancla);
  if (!noViene && sentados + 1 > mesa.capacidad) {
    volver("sin-sitio", { mesa: mesa.id, caben: mesa.capacidad, habria: sentados + 1 }, ancla);
  }

  const { data, error } = await supabase
    .from("invitados")
    .update({ mesa_id: mesaId })
    .eq("id", invitadoId)
    .select("id");

  if (error) volver(motivo(error), undefined, ancla);
  if (!data?.length) volver(await ceroFilas("invitado"), undefined, ancla);

  /*
    SENTAR A QUIEN NO HA CONTESTADO SE PERMITE. El reparto se empieza antes de
    que conteste todo el mundo o no se empieza nunca — y a la tía que seguro que
    viene hay que ponerla en algún sitio. Lo que no puede pasar es que se olvide
    que sigue sin confirmar, así que se guarda y se dice.
  */
  volver(
    noViene
      ? "sentado-no-viene"
      : sitio.estado === ESTADO_CONFIRMADO
        ? "sentado"
        : "sentado-sin-confirmar",
    undefined,
    ancla,
  );
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
  const ancla = anclaDelFormulario(datos);
  const grupoId = texto(datos, "grupo_id");
  if (!grupoId) volver("grupo", undefined, ancla);

  const mesaId = texto(datos, "mesa_id");
  if (!mesaId) volver("mesa", undefined, ancla);

  const mesa = await obtenerMesa(mesaId);
  if (mesa === undefined) volver("error", undefined, ancla);
  if (!mesa) volver("no-existe", undefined, ancla);

  const gente = await obtenerSentablesDelGrupo(grupoId);
  if (gente.length === 0) volver("grupo", undefined, ancla);

  const otros = await contarSentados(mesaId, grupoId);
  if (otros === null) volver("error", undefined, ancla);
  const habria = otros + gente.length;
  if (habria > mesa.capacidad) {
    volver("sin-sitio", { mesa: mesa.id, caben: mesa.capacidad, habria }, ancla);
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

  if (error) volver(motivo(error), undefined, ancla);
  if (!data?.length) volver(await ceroFilas("grupo"), undefined, ancla);

  // Con la cifra: mueve a todo el grupo, también a quien ya estaba en otra
  // mesa, y el aviso tiene que decir a cuántos ha sentado.
  const todosConfirmados = gente.every((persona) => persona.estado === ESTADO_CONFIRMADO);
  volver(
    todosConfirmados ? "grupo-sentado" : "grupo-sentado-sin-confirmar",
    { mesa: mesa.id, cuantos: gente.length },
    ancla,
  );
}
