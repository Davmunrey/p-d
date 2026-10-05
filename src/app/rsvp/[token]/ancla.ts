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
