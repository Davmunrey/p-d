/**
 * La primera LETRA de un nombre, para el monograma.
 *
 * Y letra de verdad, no el primer carácter: un nombre entre comillas o con un
 * paréntesis delante daría un monograma de puntuación —«( & (»— que es
 * exactamente lo que salía con los nombres del seed. Es raro en una boda, pero
 * cuesta una expresión regular y evita un logo roto.
 *
 * `\p{L}` con el indicador `u` para que valgan los acentos y la ñ: «Álvaro» da
 * «Á», no la letra siguiente.
 *
 * Vive aquí y no en la barra porque el monograma sale en dos sitios —la
 * cabecera y el pie— y dos copias de la misma expresión regular acaban
 * discrepando en el caso raro, que es justo el que importa.
 */
export function inicial(nombre: string): string {
  return nombre.match(/\p{L}/u)?.[0].toUpperCase() ?? "";
}
