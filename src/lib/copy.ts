import copyEs from "@/../content/copy.es.json";

/**
 * CAPA DE COPYS
 *
 * Todo el texto visible del proyecto vive en `content/copy.es.json`. Los
 * componentes nunca escriben literales.
 *
 * El tipo se deriva del propio JSON, así que una clave inexistente rompe el
 * `typecheck` en vez de llegar a producción como texto vacío.
 *
 * Funciona igual en componentes de servidor y de cliente: es una lectura
 * síncrona de un objeto, sin contexto ni proveedor.
 */

const copy = copyEs;

type Copy = typeof copy;

/** Rutas válidas del árbol de copys, en notación de punto: `"comun.guardar"`. */
type RutaCopy<T, Prefijo extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefijo}${K}`
    : RutaCopy<T[K], `${Prefijo}${K}.`>;
}[keyof T & string];

export type ClaveCopy = RutaCopy<Copy>;

/**
 * Devuelve el texto de una clave.
 *
 * Admite interpolación con `{nombre}`:
 *   t("saludo.bienvenida", { nombre: "Ana" })
 */
export function t(clave: ClaveCopy, valores?: Record<string, string | number>): string {
  const texto = clave
    .split(".")
    .reduce<unknown>((nodo, parte) => (nodo as Record<string, unknown>)?.[parte], copy);

  if (typeof texto !== "string") {
    throw new Error(`Copy no encontrado: "${clave}"`);
  }

  if (!valores) return texto;

  return texto.replace(/\{(\w+)\}/g, (coincidencia, nombre: string) =>
    nombre in valores ? String(valores[nombre]) : coincidencia,
  );
}

/** Devuelve un subárbol completo de copys, ya tipado. */
export function grupo<K extends keyof Copy>(clave: K): Copy[K] {
  return copy[clave];
}
