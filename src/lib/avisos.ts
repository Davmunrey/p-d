/**
 * EL AVISO DE UN ESTADO QUE LLEGA POR LA URL
 *
 * Cada pantalla del panel traduce el `?estado=` de la última acción a una frase
 * con un mapa `AVISOS`. La URL la escribe cualquiera, así que la clave también:
 * `AVISOS["constructor"]` no da `undefined`, da la función `Object` —que es
 * verdadera—, y `t(aviso.clave)` revienta con `clave.split`. Lo mismo con
 * `__proto__` o `toString`. `estado in AVISOS` tampoco sirve: `in` recorre la
 * cadena de prototipos y contesta que sí.
 *
 * `Object.hasOwn` mira sólo las claves que el mapa declara. Es el mismo arreglo
 * que ya tenían la importación (el lado) y la exportación (las columnas), aquí
 * en un sitio para que ninguna pantalla lo repita a su manera.
 */
export function avisoDe<T>(
  avisos: Readonly<Record<string, T>>,
  estado: string | null | undefined,
): T | undefined {
  if (!estado || !Object.hasOwn(avisos, estado)) return undefined;
  return avisos[estado];
}
