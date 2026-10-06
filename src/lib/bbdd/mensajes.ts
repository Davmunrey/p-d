import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";
import { normalizar } from "@/lib/texto";

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
  /** Avisa de algo práctico y alguien lo ha dejado a la vista. */
  destacado: boolean;
}

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
 * LA IDENTIDAD DE UN MENSAJE: SU GRUPO Y LO QUE DICE, no la fila en la que
 * llegó. Cambiar la respuesta no edita la confirmación: inserta otra —el
 * histórico es inmutable— con el mismo mensaje, que el formulario trae ya
 * escrito. Con las marcas atadas a la fila, pedir autobús tres semanas después
 * devolvía «la abuela es celíaca» a la bandeja como nuevo y sin su destacado,
 * justo lo que destacar existía para evitar. Si el texto cambia, sí es otro
 * mensaje, y sale como nuevo.
 */
export function claveDeMensaje(grupoId: string | null, texto: string): string {
  return `${grupoId ?? ""}\u0000${normalizar(texto).replace(/\s+/g, " ").trim()}`;
}

/** Una marca —leído o destacado— con el mensaje sobre el que se puso. */
interface FilaMarca {
  confirmacion_id: string;
  confirmaciones: { mensaje: string | null; invitados: { grupo_id: string } | null } | null;
}

/** Los mensajes marcados, por su clave: la marca vale para todas sus filas. */
function clavesMarcadas(marcas: FilaMarca[] | null): Set<string> {
  return new Set(
    (marcas ?? [])
      .filter((marca) => marca.confirmaciones?.mensaje)
      .map((marca) =>
        claveDeMensaje(
          marca.confirmaciones!.invitados?.grupo_id ?? null,
          marca.confirmaciones!.mensaje!,
        ),
      ),
  );
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

  const [respuestas, marcas, destacadas] = await Promise.all([
    supabase
      .from("confirmaciones")
      .select(
        `id, mensaje, respondido_en,
         invitados!inner ( grupos_invitacion ( id, nombre ) )`,
      )
      .eq("es_vigente", true)
      .not("mensaje", "is", null)
      .order("respondido_en", { ascending: false }),
    supabase
      .from("mensajes_leidos")
      .select("confirmacion_id, confirmaciones ( mensaje, invitados ( grupo_id ) )"),
    supabase
      .from("mensajes_destacados")
      .select("confirmacion_id, confirmaciones ( mensaje, invitados ( grupo_id ) )"),
  ]);

  if (respuestas.error) {
    throw new Error(`No se pudieron leer los mensajes: ${respuestas.error.message}`);
  }
  // Que falle leer las marcas no puede dejar la bandeja vacía: se enseñan los
  // mensajes y todos salen como nuevos y sin destacar, que es el fallo
  // inofensivo de los dos.
  const leidos = clavesMarcadas(marcas.data as unknown as FilaMarca[] | null);
  const destacados = clavesMarcadas(destacadas.data as unknown as FilaMarca[] | null);

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
        leido: leidos.has(claveDeMensaje(grupo?.id ?? null, fila.mensaje!)),
        destacado: destacados.has(claveDeMensaje(grupo?.id ?? null, fila.mensaje!)),
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

/**
 * Antes de marcar o desmarcar un mensaje: ¿sigue siendo el que se ve, y en qué
 * filas está? Desmarcar tiene que quitar la marca de TODAS las filas con ese
 * mismo mensaje —la marca se hereda por el texto—, y marcar uno que el invitado
 * acaba de reescribir no puede decir «hecho» sobre una fila que ya no se enseña.
 *
 * `null` es que no se ha podido leer.
 */
export async function filasDelMismoMensaje(
  confirmacionId: string,
): Promise<{ estado: "vigente"; ids: string[] } | { estado: "cambiado" | "no-existe" } | null> {
  const supabase = await clienteServidor();

  const { data: fila, error } = await supabase
    .from("confirmaciones")
    .select("id, mensaje, es_vigente, invitados!inner ( grupo_id )")
    .eq("id", confirmacionId)
    .maybeSingle();
  if (error) return null;
  if (!fila) return { estado: "no-existe" };

  const actual = fila as unknown as {
    mensaje: string | null;
    es_vigente: boolean;
    invitados: { grupo_id: string };
  };
  if (!actual.es_vigente || !actual.mensaje) return { estado: "cambiado" };

  const grupoId = actual.invitados.grupo_id;
  const { data: delGrupo, error: errorGrupo } = await supabase
    .from("confirmaciones")
    .select("id, mensaje, invitados!inner ( grupo_id )")
    .eq("invitados.grupo_id", grupoId)
    .not("mensaje", "is", null);
  if (errorGrupo) return null;

  const clave = claveDeMensaje(grupoId, actual.mensaje);
  const ids = ((delGrupo ?? []) as { id: string; mensaje: string }[])
    .filter((otra) => claveDeMensaje(grupoId, otra.mensaje) === clave)
    .map((otra) => otra.id);

  return { estado: "vigente", ids: ids.length ? ids : [confirmacionId] };
}
