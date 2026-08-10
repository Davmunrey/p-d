import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * LO QUE ESCRIBEN LOS INVITADOS
 *
 * Dos cosas que llegan por el mismo sitio —el formulario de confirmación— y que
 * hasta ahora se guardaban sin que nadie las leyera: el mensaje para los novios
 * y la canción para la fiesta.
 *
 * Pedirle a alguien que escriba algo y no leerlo nunca es peor que no
 * preguntárselo.
 */

export interface MensajeInvitado {
  /** El id de la confirmación: es lo que se marca como leído. */
  id: string;
  texto: string;
  escritoEn: Date;
  grupoId: string | null;
  grupoNombre: string;
  leido: boolean;
}

export interface CancionSugerida {
  id: string;
  texto: string;
  pedidaEn: Date;
  grupoNombre: string | null;
  /** `false` la retira de la landing. Lo filtra RLS, no el frontend. */
  aprobada: boolean;
}

interface FilaMensaje {
  id: string;
  mensaje: string | null;
  respondido_en: string | null;
  invitados: {
    grupos_invitacion: { id: string; nombre: string } | null;
  } | null;
}

/**
 * Los mensajes, del más reciente al más antiguo.
 *
 * Sólo las confirmaciones VIGENTES: si alguien cambia su respuesta y reescribe
 * el mensaje, la bandeja enseña el último y no los dos. El histórico sigue
 * entero en la tabla para quien quiera mirarlo.
 */
export async function obtenerMensajes(): Promise<MensajeInvitado[]> {
  const supabase = await clienteServidor();

  const [respuestas, marcas] = await Promise.all([
    supabase
      .from("confirmaciones")
      .select(
        `id, mensaje, respondido_en,
         invitados!inner ( grupos_invitacion ( id, nombre ) )`,
      )
      .eq("es_vigente", true)
      .not("mensaje", "is", null)
      .order("respondido_en", { ascending: false }),
    supabase.from("mensajes_leidos").select("confirmacion_id"),
  ]);

  if (respuestas.error) {
    throw new Error(`No se pudieron leer los mensajes: ${respuestas.error.message}`);
  }
  // Que falle leer las marcas no puede dejar la bandeja vacía: se enseñan los
  // mensajes y todos salen como nuevos, que es el fallo inofensivo de los dos.
  const leidos = new Set(
    ((marcas.data ?? []) as { confirmacion_id: string }[]).map(
      (marca) => marca.confirmacion_id,
    ),
  );

  return ((respuestas.data ?? []) as unknown as FilaMensaje[])
    .filter((fila) => fila.mensaje)
    .map((fila) => {
      const grupo = fila.invitados?.grupos_invitacion ?? null;
      return {
        id: fila.id,
        texto: fila.mensaje!,
        escritoEn: new Date(fila.respondido_en ?? Date.now()),
        grupoId: grupo?.id ?? null,
        grupoNombre: grupo?.nombre ?? "",
        leido: leidos.has(fila.id),
      };
    });
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
    .select("id, texto, creado_en, aprobada, grupos_invitacion ( nombre )")
    .order("creado_en", { ascending: false });

  if (error) throw new Error(`No se pudieron leer las canciones: ${error.message}`);

  return (
    (data ?? []) as unknown as {
      id: string;
      texto: string;
      creado_en: string;
      aprobada: boolean;
      grupos_invitacion: { nombre: string } | null;
    }[]
  ).map((fila) => ({
    id: fila.id,
    texto: fila.texto,
    pedidaEn: new Date(fila.creado_en),
    grupoNombre: fila.grupos_invitacion?.nombre ?? null,
    aprobada: fila.aprobada,
  }));
}
