import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * LAS CANCIONES QUE PIDEN LOS INVITADOS
 *
 * Llegan desde la playlist de la portada, apuntadas por quien ha entrado con el
 * enlace de su invitación. Aquí se leen todas, aprobadas o no, para el panel.
 */

export interface CancionSugerida {
  id: string;
  texto: string;
  pedidaEn: Date;
  /** Para contar contra el tope por grupo: dos grupos pueden llamarse igual. */
  grupoId: string | null;
  grupoNombre: string | null;
  /** `false` la retira de la landing. Lo filtra RLS, no el frontend. */
  aprobada: boolean;
}

/**
 * Todas las canciones, incluidas las retiradas.
 *
 * El panel las ve todas porque entra autenticado y la política de gestión se
 * lo permite; la landing entra como `anon` y su política filtra por `aprobada`.
 * Retirar una canción de la web es, literalmente, apagar ese booleano: nadie
 * borra nada y se puede deshacer.
 */
export async function obtenerCancionesTodas(): Promise<CancionSugerida[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("canciones_sugeridas")
    .select("id, texto, creado_en, aprobada, grupo_id, grupos_invitacion ( nombre )")
    .order("creado_en", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las canciones: ${error.message}`);

  return (
    (data ?? []) as unknown as {
      id: string;
      texto: string;
      creado_en: string;
      aprobada: boolean;
      grupo_id: string | null;
      grupos_invitacion: { nombre: string } | null;
    }[]
  ).map((fila) => ({
    id: fila.id,
    texto: fila.texto,
    pedidaEn: new Date(fila.creado_en),
    grupoId: fila.grupo_id,
    grupoNombre: fila.grupos_invitacion?.nombre ?? null,
    aprobada: fila.aprobada,
  }));
}
