/**
 * LAS ANCLAS DEL FORMULARIO DE CONFIRMACIÓN
 *
 * Cuando alguien sigue sin marcar si viene una persona, la acción vuelve a la
 * landing con esas personas en la URL (`?falta=…`) y el ancla de la primera,
 * así que la página aterriza justo en el nombre que falta, con su aviso. La
 * acción escribe estas anclas y la página las pinta: tienen que decir lo
 * mismo, así que se dicen una vez.
 */

/** El `id` del bloque de una persona en el paso de asistencia. */
export function anclaPersona(personaId: string): string {
  return `persona-${personaId}`;
}

/** El `id` del aviso de «falta contestar» de una persona. */
export function avisoPersona(personaId: string): string {
  return `falta-${personaId}`;
}

const SEPARADOR_FALTAN = ",";

export function faltanEnLaUrl(personaIds: string[]): string {
  return personaIds.map(encodeURIComponent).join(SEPARADOR_FALTAN);
}

export function faltanDeLaUrl(valor: string): Set<string> {
  return new Set(valor.split(SEPARADOR_FALTAN).filter(Boolean));
}
