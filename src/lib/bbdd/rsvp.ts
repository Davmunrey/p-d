import "server-only";

import { ErrorDeLectura, leerComoAnonimo, llamarComoAnonimo } from "./cliente";

/**
 * EL RSVP PÚBLICO
 *
 * Dos funciones, las dos contra la base de datos y con los privilegios de un
 * visitante anónimo. No hay una tercera vía: leer y escribir el RSVP se hace
 * por `obtener_invitacion()` y `registrar_confirmacion()`, que son
 * `security definer` y enumeran a mano lo que devuelven.
 *
 * POR QUÉ NO SE CONSULTAN LAS TABLAS DIRECTAMENTE. Un `select` sobre
 * `invitados` filtrando por grupo dejaría al invitado ver el teléfono, el
 * correo y las notas privadas de sus coinvitados, y publicaría sola cualquier
 * columna que se añadiera después. La función devuelve exactamente veintiuna
 * columnas y ni una más.
 *
 * CERO FILAS NO ES UN ERROR: significa «este enlace no vale». La función lo
 * hace así a propósito —lanzar abortaría la transacción y se perdería el
 * registro del intento, que es lo que alimenta el cortafuegos de fuerza
 * bruta—, y aquí se respeta ese contrato en lugar de traducirlo a excepción.
 */

/** Códigos que la base usa para hablar de lo que ha ido mal en el RSVP. */
export const MOTIVOS_RSVP = {
  /** RSV02 · demasiados intentos desde el mismo sitio. */
  demasiadosIntentos: "RSV02",
  /** RSV03 · el plazo para confirmar ya se cerró. */
  plazoCerrado: "RSV03",
  /** RSV04 · alguna respuesta no casa con el grupo del enlace. */
  respuestasInvalidas: "RSV04",
} as const;

export interface PersonaInvitada {
  id: string;
  nombre: string;
  apellidos: string | null;
  esNino: boolean;
  esAcompanante: boolean;
  tipoMenu: string;
  alergias: string | null;
  /** `null` si todavía no ha contestado nadie por esta persona. */
  estado: string | null;
  respondidoEn: Date | null;
  necesitaAutobus: boolean | null;
  cancionSolicitada: string | null;
  mensaje: string | null;
}

export interface Invitacion {
  grupoNombre: string;
  maximoAcompanantes: number;
  acompanantesUsados: number;
  personas: PersonaInvitada[];
}

interface FilaInvitacion {
  grupo_nombre: string;
  maximo_acompanantes: number;
  acompanantes_usados: string;
  invitado_id: string;
  nombre: string;
  apellidos: string | null;
  es_nino: boolean;
  es_acompanante: boolean;
  tipo_menu: string;
  alergias: string | null;
  estado: string | null;
  respondido_en: Date | null;
  necesita_autobus: boolean | null;
  cancion_solicitada: string | null;
  mensaje: string | null;
}

/**
 * Devuelve la invitación de un token, o `null` si el enlace no vale.
 *
 * El `null` es un dato, no una avería: quien llama enseña «este enlace no es
 * válido». Si la base no responde, esto **lanza** — y esa diferencia es la que
 * evita decirle a alguien que su enlace está roto cuando lo que pasa es que la
 * base está caída.
 */
export async function obtenerInvitacion(token: string): Promise<Invitacion | null> {
  const filas = await leerComoAnonimo(
    (tx) => tx<FilaInvitacion[]>`select * from public.obtener_invitacion(${token})`,
  );

  if (filas.length === 0) return null;

  const [primera] = filas;
  return {
    grupoNombre: primera.grupo_nombre,
    maximoAcompanantes: primera.maximo_acompanantes,
    acompanantesUsados: Number(primera.acompanantes_usados),
    personas: filas.map((f) => ({
      id: f.invitado_id,
      nombre: f.nombre,
      apellidos: f.apellidos,
      esNino: f.es_nino,
      esAcompanante: f.es_acompanante,
      tipoMenu: f.tipo_menu,
      alergias: f.alergias,
      estado: f.estado,
      respondidoEn: f.respondido_en,
      necesitaAutobus: f.necesita_autobus,
      cancionSolicitada: f.cancion_solicitada,
      mensaje: f.mensaje,
    })),
  };
}

/**
 * Una respuesta, con los nombres de campo que espera la función de la base.
 *
 * Va como `type` y no como `interface` a propósito: TypeScript sólo le da
 * firma de índice implícita a los alias, y sin ella esto no es un `JSONValue`
 * serializable para el conductor. Con `interface` compila el resto del fichero
 * y falla justo en la línea que manda los datos.
 */
export type RespuestaInvitado = {
  invitado_id: string;
  estado: "confirmado" | "rechazado";
  necesita_autobus: boolean | null;
  necesita_alojamiento: boolean | null;
  cancion_solicitada: string | null;
  mensaje: string | null;
  /**
   * Menú y alergias son de la persona, no de la respuesta —quien es celíaco lo
   * sigue siendo si cambia de opinión sobre si viene—, así que la base los
   * escribe en `invitados`. Se mandan sólo para quien viene: preguntarle el
   * menú a quien ha dicho que no puede ir no tiene sentido, y sobrescribir el
   * que tuviera anotado, menos.
   */
  tipo_menu?: string;
  alergias?: string | null;
};

export type ResultadoConfirmacion =
  | { ok: true; registradas: number }
  | { ok: false; motivo: "enlace" | "plazo" | "intentos" | "respuestas" | "averia" };

/**
 * Registra la respuesta del grupo. Todo o nada: si una sola respuesta no casa
 * con el grupo del enlace, la base deshace la transacción entera.
 *
 * NO DECIDE NADA QUE PUEDA DECIDIR LA BASE. El plazo lo aplica un trigger
 * contra `now()`, el origen y la fecha los fija la función, y la pertenencia al
 * grupo se resuelve dentro del propio INSERT. Aquí sólo se traduce el resultado
 * a algo que la pantalla pueda contar en castellano.
 *
 * `tx.json()` Y NO `JSON.stringify(...)::jsonb`. Parece lo mismo y no lo es:
 * al recibir una cadena, el conductor la manda como una cadena JSON, así que
 * en la base llega el jsonb `"[{...}]"` —de tipo `string`— en lugar del array.
 * La función lo rechaza con RSV04 y el invitado ve «no hemos podido guardar la
 * respuesta» sin que nada más se queje. Los tipos de TypeScript no lo ven: los
 * dos caminos son un `string` por medio.
 */
export async function registrarConfirmacion(
  token: string,
  respuestas: RespuestaInvitado[],
): Promise<ResultadoConfirmacion> {
  try {
    const filas = await llamarComoAnonimo(
      (tx) => tx<{ registrar_confirmacion: number }[]>`
        select public.registrar_confirmacion(${token}, ${tx.json(respuestas)})
      `,
    );

    const registradas = filas[0]?.registrar_confirmacion ?? 0;
    // Cero es el contrato de la función para «este enlace no vale». Una
    // llamada legítima siempre registra al menos una respuesta.
    if (registradas === 0) return { ok: false, motivo: "enlace" };

    return { ok: true, registradas };
  } catch (error) {
    return { ok: false, motivo: motivoDe(error) };
  }
}

/**
 * Traduce el error de la base a algo que la pantalla sepa contar.
 *
 * Se mira el mensaje porque es donde `raise exception 'RSV03'` deja el código.
 * Cualquier cosa que no reconozcamos es una avería, no un problema del
 * invitado: enseñarle «tu enlace no vale» cuando lo que ha fallado es la base
 * es la peor manera posible de perder una confirmación.
 */
function motivoDe(error: unknown): "plazo" | "intentos" | "respuestas" | "averia" {
  const texto = error instanceof Error ? error.message : String(error);

  if (texto.includes(MOTIVOS_RSVP.plazoCerrado)) return "plazo";
  if (texto.includes(MOTIVOS_RSVP.demasiadosIntentos)) return "intentos";
  if (texto.includes(MOTIVOS_RSVP.respuestasInvalidas)) return "respuestas";

  console.error("Fallo al registrar la confirmación:", error);
  return "averia";
}

export { ErrorDeLectura };
