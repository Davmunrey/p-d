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
import { ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { ANCLA_ALTA_GASTO, anclaDeGasto, DESDE_EL_ALTA, type EstadoGastos } from "./estado";

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
function volver(estado: EstadoGastos, extra?: Record<string, string>, ancla?: string): never {
  revalidatePath(RUTA_PRESUPUESTO);
  redirect(destino(estado, extra, ancla));
}

/** La lista de gastos con el resultado en la URL y, si lo hay, el gasto al que volver. */
function destino(estado: EstadoGastos, extra?: Record<string, string>, ancla?: string): string {
  const parametros = new URLSearchParams({ estado, ...extra });
  return `${RUTA_GASTOS}?${parametros.toString()}${ancla ? `#${ancla}` : ""}`;
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
function rechazar(estado: EstadoGastos, extra?: Record<string, string>, ancla?: string): never {
  redirect(destino(estado, extra, ancla));
}

/**
 * CERO FILAS NO ES SIEMPRE «NO PODÉIS». Con el gasto borrado desde el otro
 * móvil, a quien sí puede editar le salía «vuestro perfil no puede hacer
 * cambios aquí». Se mira quién pregunta para decir cuál de las dos es.
 */
async function ceroFilas(): Promise<EstadoGastos> {
  return (await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "no-existe";
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
  /*
    UN 23503 NO SIGNIFICA LO MISMO EN LAS DOS DIRECCIONES. Al BORRAR, la clave
    ajena que salta es la de quien cuelga de esta fila: «tiene cosas colgando».
    Al INSERTAR o EDITAR es la contraria: la fila a la que se apunta —la
    categoría, el proveedor— ya no existe, porque la otra persona la borró con
    este formulario abierto. Con un solo mensaje para los dos, quien creaba un
    gasto leía «este gasto tiene pagos, borrad antes los pagos» sobre un gasto
    que no había llegado a existir.

    Postgres los distingue en el texto: «insert or update on table …» frente a
    «update or delete on table …». Comprobado contra la base.
  */
  if (error.code === "23503" && error.message?.startsWith("insert or update")) {
    return "referencia-rota";
  }
  if (error.code === "23503") return "tiene-pagos";
  // PAR01 es el trigger: el gasto quedaría por debajo de sus pagos. Se llega
  // aquí cuando la comprobación previa no lo vio (otro pago entró en medio).
  if (error.message?.includes("PAR01")) return "por-debajo-de-pagos";

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
  // Los errores del alta vuelven al alta, que está al final de la pantalla.
  const alAlta: (estado: EstadoGastos) => never = (estado) =>
    rechazar(estado, DESDE_EL_ALTA, ANCLA_ALTA_GASTO);

  const categoriaId = texto(datos, "categoria_id");
  if (!categoriaId) alAlta("categoria");

  const concepto = texto(datos, "concepto");
  if (concepto.length < LONGITUD_MINIMA_NOMBRE) alAlta("concepto");

  const cantidades = importes(datos);
  if (!cantidades) alAlta("importe");

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

  if (error) alAlta(motivo(error));
  if (!data?.length) alAlta("sin-permiso");

  const nuevo = data[0]!.id as string;
  volver("gasto-creado", { gasto: nuevo }, anclaDeGasto(nuevo));
}

export async function editarGasto(datos: FormData): Promise<void> {
  const id = texto(datos, "id");
  if (!id) rechazar("no-existe");

  // Los errores vuelven al gasto abierto, que es donde están los campos.
  const alGasto: (estado: EstadoGastos, extra?: Record<string, string>) => never = (
    estado,
    extra,
  ) => rechazar(estado, { editar: id, ...extra }, anclaDeGasto(id));

  const categoriaId = texto(datos, "categoria_id");
  if (!categoriaId) alGasto("categoria");

  const concepto = texto(datos, "concepto");
  if (concepto.length < LONGITUD_MINIMA_NOMBRE) alGasto("concepto");

  const cantidades = importes(datos);
  if (!cantidades) alGasto("importe");

  const supabase = await cliente();

  const apuntado = await loQueSeQuedaFuera(supabase, id, cantidades);
  if (apuntado !== null) alGasto("por-debajo-de-pagos", { apuntado: String(apuntado) });

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

  if (error) alGasto(motivo(error));
  if (!data?.length) rechazar(await ceroFilas());

  volver("gasto-editado", { gasto: id }, anclaDeGasto(id));
}

/**
 * ¿DEJARÍA ESTE IMPORTE PAGOS FUERA? Devuelve lo apuntado si sí, `null` si no.
 *
 * Bajar el gasto por debajo de lo que ya hay en pagos se aceptaba sin aviso, y
 * a partir de ahí ningún pago de ese gasto se podía editar. La base lo impide
 * ahora (PAR01); aquí se mira antes para poder decir CUÁNTO hay apuntado.
 *
 * Con la misma regla que la base: el tope es el acordado o el estimado, cero
 * no compara, y SUBIR no se impide nunca, aunque siga sin cubrir —es el camino
 * para arreglar uno que ya se había pasado—.
 */
async function loQueSeQuedaFuera(
  supabase: Awaited<ReturnType<typeof cliente>>,
  id: string,
  cantidades: { estimado: number; real: number | null },
): Promise<number | null> {
  const { data } = await supabase
    .from("partidas_presupuesto")
    .select("importe_estimado, importe_real, pagos ( importe )")
    .eq("id", id)
    .maybeSingle();

  const fila = data as {
    importe_estimado: string | number | null;
    importe_real: string | number | null;
    pagos: { importe: string | number }[] | null;
  } | null;
  // Sin poder leerlo decide la base, que es quien manda de todas formas.
  if (!fila) return null;

  const tope = cantidades.real ?? cantidades.estimado;
  const antes = Number(fila.importe_real ?? fila.importe_estimado ?? 0);
  if (tope <= 0 || tope >= antes) return null;

  const apuntado = (fila.pagos ?? []).reduce((suma, pago) => suma + Number(pago.importe), 0);
  const redondeado = Math.round(apuntado * 100) / 100;
  return redondeado > tope ? redondeado : null;
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

  /*
    Y SIN PAGOS, BORRAR PREGUNTA ANTES. «Borrar» está en la propia fila, y un
    toque de más se llevaba el gasto con su descripción sin vuelta atrás. Con
    pagos no hay nada que preguntar —no se puede—, así que eso se dice ya en el
    primer toque en vez de confirmar algo que luego se niega. Contarlos aquí no
    sustituye a la clave ajena: si alguien apunta un pago entre medias, el
    borrado de abajo sigue fallando con 23503.
  */
  if (texto(datos, "confirmar") !== "si") {
    const { count } = await supabase
      .from("pagos")
      .select("id", { count: "exact", head: true })
      .eq("partida_id", id);
    if (count) rechazar("tiene-pagos", { gasto: id }, anclaDeGasto(id));
    rechazar("confirmar-borrado", { gasto: id }, anclaDeGasto(id));
  }

  const { data, error } = await supabase
    .from("partidas_presupuesto")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) rechazar(motivo(error), { gasto: id }, anclaDeGasto(id));
  if (!data?.length) rechazar(await ceroFilas());

  volver("gasto-borrado");
}
