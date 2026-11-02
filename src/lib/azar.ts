/**
 * UN AZAR QUE SIEMPRE SALE IGUAL
 *
 * Un generador pseudoaleatorio con semilla (mulberry32): la misma semilla da
 * la misma serie de números en cada visita, en el servidor y en el navegador.
 * Es lo que hace que el cielo sea el mismo cielo cada vez —no se reordena al
 * girar el móvil— y que los tests puedan contar con él.
 *
 * No es criptográfico ni pretende serlo: reparte estrellas.
 */
export function generador(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un número al azar entre dos, con el generador que se le pase. */
export function entre(azar: () => number, [desde, hasta]: readonly [number, number]): number {
  return desde + azar() * (hasta - desde);
}
