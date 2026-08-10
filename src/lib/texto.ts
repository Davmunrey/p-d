/**
 * COMPARAR TEXTO COMO LO ESCRIBE LA GENTE
 *
 * Vive suelto porque lo necesitan dos módulos que no tienen nada que ver entre
 * sí —la búsqueda de invitados y la de proveedores— y porque cada uno con su
 * copia acaba siendo dos formas distintas de entender «acento»: una encuentra
 * a «Zubeldía» escribiendo «zubeldia» y la otra no, sin que nadie sepa por qué.
 */

/**
 * Sin acentos y en minúsculas.
 *
 * Quien busca a «Ainhoa Zubeldía» desde el móvil escribe «zubeldia», y una
 * búsqueda que no encuentre a nadie por eso es una búsqueda que no se usa.
 *
 * `NFD` separa la letra de su tilde y luego se tiran las tildes sueltas. Es lo
 * mismo que hace `unaccent` en la base, que es donde están los índices para
 * cuando esto haya que hacerlo en SQL.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
