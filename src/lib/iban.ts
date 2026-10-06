import { LARGO_IBAN_ESPANOL } from "@/config/constants";

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

/** La forma de cualquier IBAN: país, dígitos de control y de 10 a 30 más. */
const FORMA_IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;

/** El divisor de la ISO 13616: un IBAN bien escrito deja resto 1. */
const MODULO_IBAN = 97;

/**
 * SI EL IBAN ES DE VERDAD, NO SÓLO SI LO PARECE.
 *
 * La forma sola dejaba pasar una cifra mal tecleada, y ese número salía en la
 * web con un botón de copiar: el banco de cada invitado rechazaría la
 * transferencia y los novios no se enterarían. El módulo 97 caza cualquier
 * cifra cambiada y dos cifras seguidas trastocadas; la longitud española, una
 * cifra de menos.
 *
 * Recibe el IBAN ya normalizado —sin espacios y en mayúsculas—, que es como lo
 * guarda la base. Es la misma regla que `public.es_iban_valido()`, que hace de
 * red detrás para quien escriba por SQL.
 */
export function esIbanValido(iban: string): boolean {
  if (!FORMA_IBAN.test(iban)) return false;
  if (iban.startsWith("ES") && iban.length !== LARGO_IBAN_ESPANOL) return false;

  // Las cuatro primeras al final, y cada letra por su número: A = 10 … Z = 35.
  const cifras = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (letra) =>
    String(parseInt(letra, 36)),
  );
  // Cifra a cifra: el número entero tiene treinta dígitos y no cabe en un `number`.
  const resto = [...cifras].reduce(
    (acumulado, cifra) => (acumulado * 10 + Number(cifra)) % MODULO_IBAN,
    0,
  );
  return resto === 1;
}
