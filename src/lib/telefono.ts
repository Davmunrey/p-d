/**
 * UN TELÉFONO, LISTO PARA LLAMAR
 *
 * Vive suelto —y no en `lib/bbdd/dia.ts`, que es donde nació— porque lo usa la
 * agenda del día, que es un componente de cliente. Aquel módulo es `server-only`
 * y traerse de allí una función, aunque sea de dos líneas, arrastra al navegador
 * el cliente de Supabase entero. No es una teoría: el `build` se cayó por eso, y
 * ni el `typecheck` ni el `lint` lo vieron venir.
 */

/**
 * De «+34 600 11 22 33» a «tel:+34600112233».
 *
 * El número se guarda como lo escribe una persona, porque así se lee y así se
 * dicta. El enlace necesita lo contrario: sólo el `+` y las cifras. Los espacios
 * y los paréntesis dentro de un `tel:` los aguanta casi todo, pero «casi» no
 * vale para el único enlace que alguien va a pulsar con el autobús sin aparecer.
 */
export function paraLlamar(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, "")}`;
}
