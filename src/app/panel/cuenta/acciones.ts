"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  LARGOS_DE_CAMPO,
  LONGITUD_MINIMA_NOMBRE,
  RUTA_ACCESO,
  RUTA_CUENTA,
  RUTA_PANEL,
} from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * Cambia el nombre con el que aparece uno en el panel.
 *
 * Escribe de verdad en `perfiles`, y quien decide si puede es RLS: la política
 * `perfiles_propio_actualizar` deja tocar el nombre y **sólo** el nombre. Ni
 * siquiera hace falta comprobar aquí de quién es la fila — la base no
 * permitiría escribir en otra.
 */
export async function guardarNombre(datos: FormData) {
  const nombre = String(datos.get("nombre") ?? "").trim();

  if (nombre.length < LONGITUD_MINIMA_NOMBRE) redirect(`${RUTA_CUENTA}?estado=corto`);
  // El tope es el `check` de `perfiles`: pasarlo volvía como «no hemos podido
  // guardar», que invita a reintentar algo que no va a entrar nunca.
  if (nombre.length > LARGOS_DE_CAMPO["perfiles.nombre_completo"]) {
    redirect(`${RUTA_CUENTA}?estado=largo`);
  }
  if (!hayAutenticacion) redirect(RUTA_ACCESO);

  try {
    const supabase = await clienteServidor();
    const { data: sesion } = await supabase.auth.getUser();
    if (!sesion.user) redirect(RUTA_ACCESO);

    const { data, error } = await supabase
      .from("perfiles")
      .update({ nombre_completo: nombre })
      .eq("usuario_id", sesion.user.id)
      .select("usuario_id");

    if (error) {
      console.error("No se pudo guardar el nombre:", error.message);
      redirect(`${RUTA_CUENTA}?estado=error`);
    }
    // Cero filas sin error es RLS callando: decir «actualizado» sería mentir.
    if (!data?.length) redirect(`${RUTA_CUENTA}?estado=error`);
  } catch (error) {
    // `redirect` funciona lanzando: si no se deja pasar, el salto de arriba se
    // tragaría aquí y la pantalla se quedaría igual sin decir nada.
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al guardar el nombre:", error);
    redirect(`${RUTA_CUENTA}?estado=error`);
  }

  // La cabecera del panel enseña ese mismo nombre, y vive en el layout: sin
  // esto se quedaría con el anterior hasta la siguiente recarga completa.
  revalidatePath(RUTA_PANEL, "layout");
  redirect(`${RUTA_CUENTA}?estado=guardado`);
}
