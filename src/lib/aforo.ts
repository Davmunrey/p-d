/**
 * El estado de la confirmación de quien ha dicho que no. Es el mismo literal
 * que usa la base; vive aquí, y no en `bbdd/mesas.ts`, porque este fichero no
 * toca la base y se puede probar sin ella.
 */
export const ESTADO_RECHAZADO = "rechazado";

/**
 * CUÁNTAS SILLAS OCUPA DE VERDAD UNA MESA: las de quien no ha dicho que no.
 *
 * Quien estaba sentado y después rechaza conserva su `mesa_id` —la base no lo
 * levanta, por si cambia de opinión—, y contaba como silla ocupada: la mesa
 * salía «8 de 8» con una libre y no dejaba sentar a nadie más. Se sigue
 * pintando en su mesa, con «No viene», para que los novios decidan.
 */
export function sillasOcupadas(sentados: { estado: string }[]): number {
  return sentados.filter((persona) => persona.estado !== ESTADO_RECHAZADO).length;
}
