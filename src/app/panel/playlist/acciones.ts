"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_PLAYLIST } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * BODA-113 · Retirar una canción de la web, o devolverla
 *
 * QUIÉN PUEDE LO DECIDE LA BASE. `canciones_sugeridas_gestion` exige
 * `puede_editar()`. Y como RLS no da error cuando prohíbe —devuelve cero filas
 * tocadas— se mira el recuento.
 *
 * NO SE REVALIDA LA PLAYLIST antes de volver a ella: `revalidatePath` del
 * destino y `redirect` a ese mismo destino compiten, y cuando gana el refresco
 * la redirección pierde su `?estado=` — se guarda, se repinta y el aviso de
 * «hecho» no sale nunca (BODA-71). La pantalla es `force-dynamic`: la
 * redirección ya la vuelve a leer de la base entera.
 */

type Estado = "cancion-ocultada" | "cancion-mostrada" | "no-existe" | "sin-permiso" | "error";

const texto = (datos: FormData, campo: string) => String(datos.get(campo) ?? "").trim();

function volver(estado: Estado): never {
  redirect(`${RUTA_PLAYLIST}?${new URLSearchParams({ estado })}`);
}

/**
 * NO BORRA NADA: apaga `aprobada`, y la política de lectura pública filtra por
 * ese booleano. Se le pide a doscientas personas que sugieran canciones, así
 * que alguien va a sugerir una broma — y hace falta poder quitarla sin perder
 * el rastro de quién la pidió, y poder deshacerlo si era buena y se entendió
 * mal.
 */
export async function moderarCancion(datos: FormData): Promise<void> {
  const cancionId = texto(datos, "cancion_id");
  const aprobar = texto(datos, "aprobar") === "1";
  if (!cancionId) volver("error");

  // El rol se mira antes, para que el cero de abajo signifique una sola cosa:
  // que la canción ya no existe.
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso");

  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  const supabase = await clienteServidor();
  const { error, count } = await supabase
    .from("canciones_sugeridas")
    .update({ aprobada: aprobar }, { count: "exact" })
    .eq("id", cancionId);

  if (error) {
    console.error("No se pudo moderar la canción:", error);
    volver("error");
  }
  if (count === 0) volver("no-existe");

  // La landing la lee en cada visita, pero se revalida igual por si algún día
  // deja de ser dinámica: el olvido se paga con una canción retirada que sigue
  // viéndose.
  revalidatePath("/");
  volver(aprobar ? "cancion-mostrada" : "cancion-ocultada");
}
