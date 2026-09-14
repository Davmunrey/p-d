/** Cuántos caracteres van juntos en un IBAN escrito para leerse. */
const GRUPO_IBAN = 4;

/**
 * «ES91 2100 0418 4502 0005 1332»: el IBAN agrupado de cuatro en cuatro, que es
 * como se imprime en cualquier documento bancario y como lo enseña la entrega.
 *
 * Sólo para mostrarlo. Lo que se copia al portapapeles es el valor sin
 * espacios, que es lo que aceptan todos los formularios de transferencia; un
 * IBAN pegado con espacios lo rechazan algunos bancos.
 */
export function formatearIban(iban: string): string {
  const limpio = iban.replace(/\s+/g, "").toUpperCase();
  return limpio.match(new RegExp(`.{1,${GRUPO_IBAN}}`, "g"))?.join(" ") ?? limpio;
}
