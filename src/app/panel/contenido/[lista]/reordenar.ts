/**
 * BODA-129 · PERMUTAR UNA FICHA CON LA DE AL LADO
 *
 * Función PURA a propósito, y separada de la acción que la usa. Mover algo de
 * sitio es la operación con más casos límite de toda la pantalla —el primero
 * hacia arriba, el último hacia abajo, un identificador que ya no está, una
 * lista de uno— y todos se prueban en un unitario que corre en milisegundos, en
 * vez de levantando un Supabase para descubrir que el botón del primero mueve
 * la ficha equivocada.
 *
 * SE RENUMERA LA LISTA ENTERA, no se intercambian los dos números. Es lo que
 * hace `moverTarea` y por el mismo motivo: `orden` en estas cuatro tablas NO es
 * único —a diferencia de `secciones_landing`, que por eso necesita su RPC—, así
 * que dos filas pueden compartir número, y con números repetidos intercambiarlos
 * no mueve nada. Renumerando por posición el resultado es siempre el que se ve.
 *
 * DEVUELVE SÓLO LO QUE CAMBIA. Escribir dieciocho filas para mover una sería
 * dieciocho escrituras, dieciocho entradas en la auditoría y dieciocho
 * `actualizado_en` mintiendo sobre cuándo se tocó cada cosa.
 */

export interface ConOrden {
  id: string;
  orden: number;
}

export type Direccion = "subir" | "bajar";

export function esDireccion(valor: string): valor is Direccion {
  return valor === "subir" || valor === "bajar";
}

/**
 * Las filas cuyo orden cambia al mover `id` en la dirección pedida.
 *
 * `filas` tiene que venir YA en el orden en que se ve en pantalla: es ese orden
 * el que se está permutando, no el de la base. Si la pantalla ordenara por un
 * criterio y esto por otro, el botón de subir movería la ficha a un sitio que
 * quien lo pulsa no ha visto.
 *
 * Devuelve lista vacía cuando no hay nada que hacer: el identificador no está,
 * o ya es el primero y se pide subir. No es un error — es que no hay a dónde—, y
 * la pantalla ya no pinta ese botón.
 */
export function permutarConElVecino(
  filas: readonly ConOrden[],
  id: string,
  direccion: Direccion,
): ConOrden[] {
  const desde = filas.findIndex((fila) => fila.id === id);
  if (desde === -1) return [];

  const hasta = direccion === "subir" ? desde - 1 : desde + 1;
  if (hasta < 0 || hasta >= filas.length) return [];

  const ids = filas.map((fila) => fila.id);
  [ids[desde], ids[hasta]] = [ids[hasta], ids[desde]];

  const cambios: ConOrden[] = [];
  for (const [posicion, idFila] of ids.entries()) {
    const fila = filas.find((otra) => otra.id === idFila);
    if (fila && fila.orden !== posicion) cambios.push({ id: idFila, orden: posicion });
  }

  return cambios;
}
