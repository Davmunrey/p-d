/**
 * Un número pequeño, en letra: «tres hoteles», como lo escribe la entrega, y
 * no «3 hoteles», que en una frase se lee como una tabla.
 *
 * Hasta diez: es la cantidad de cosas que una boda enumera en una frase. De
 * ahí en adelante vuelve la cifra, que es también lo que recomienda la
 * ortografía para cantidades que no se escriben de una palabra.
 */
const EN_LETRA = [
  "cero",
  "un",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
] as const;

export function numeroEnLetra(cantidad: number): string {
  if (!Number.isInteger(cantidad) || cantidad < 0) return String(cantidad);
  return EN_LETRA[cantidad] ?? String(cantidad);
}
