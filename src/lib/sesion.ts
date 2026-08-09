import "server-only";

import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * QUIÉN HA ENTRADO
 *
 * Estar autenticado y tener acceso son dos cosas distintas, y conviene que el
 * código lo diga así. Supabase Auth confirma que alguien es dueño de un correo;
 * el acceso al panel lo decide `perfiles`, que es nuestro.
 *
 * Un perfil desactivado —o inexistente— es exactamente igual de forastero que
 * alguien sin sesión. La base ya lo impone con RLS; esto es la segunda capa,
 * para no llegar a pintar una pantalla que después saldría vacía.
 */

export type RolPanel = "propietario" | "editor" | "lector";

export interface Acceso {
  usuarioId: string;
  correo: string | null;
  nombre: string | null;
  rol: RolPanel;
}

/**
 * Devuelve el acceso de quien está en la petición, o `null` si no hay ninguno:
 * sin sesión, con la sesión de alguien sin perfil, o con el perfil desactivado.
 *
 * Nunca lanza. Un fallo al preguntar se trata como «no hay acceso», que es lo
 * seguro: ante la duda, fuera.
 */
export async function accesoActual(): Promise<Acceso | null> {
  if (!hayAutenticacion) return null;

  try {
    const supabase = await clienteServidor();

    // `getUser()` y no `getSession()`: el primero valida el token contra el
    // servidor de Auth, el segundo se fía de la cookie. Para decidir si alguien
    // entra, fiarse de la cookie es fiarse de quien la manda.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const { data: perfil } = await supabase
      .from("perfiles")
      .select("nombre_completo, correo_electronico, rol, activo")
      .eq("usuario_id", data.user.id)
      .maybeSingle();

    if (!perfil?.activo) return null;

    return {
      usuarioId: data.user.id,
      correo: perfil.correo_electronico ?? data.user.email ?? null,
      nombre: perfil.nombre_completo,
      rol: perfil.rol as RolPanel,
    };
  } catch (error) {
    console.error("No se pudo comprobar el acceso:", error);
    return null;
  }
}
