/**
 * EL ANCLA DE CADA PERSONA EN EL PASO DE ASISTENCIA.
 *
 * Cuando falta contestar por alguien, la acción vuelve al paso señalándolo y
 * con esta ancla en la URL: sin ella, la página cargaba arriba y el aviso
 * quedaba por debajo de la primera pantalla del móvil, sin que nada se moviera.
 * La usan la acción, para redirigir, y la página, para poner el `id`.
 */
export function anclaPersona(personaId: string): string {
  return `persona-${personaId}`;
}

/** El `id` del aviso de esa persona, al que apuntan sus radios. */
export function avisoPersona(personaId: string): string {
  return `falta-${personaId}`;
}

/**
 * A QUIÉN FALTA, TODOS DE UNA VEZ. Se señalaba sólo al primero: en una familia
 * de cuatro que pulsaba «Siguiente» sin marcar a nadie, el aviso salía cuatro
 * veces seguidas, una persona cada vez. Ahora viajan todos en `falta`, unidos
 * por este separador —un identificador nunca lleva coma—, y el ancla lleva al
 * primero.
 */
const SEPARADOR_FALTAN = ",";

export function faltanEnLaUrl(personaIds: string[]): string {
  return personaIds.map(encodeURIComponent).join(SEPARADOR_FALTAN);
}

export function faltanDeLaUrl(valor: string): Set<string> {
  return new Set(valor.split(SEPARADOR_FALTAN).filter(Boolean));
}
