/**
 * EL ESTADO DEL CAMPO DE LA PLAYLIST, EN SU PROPIO FICHERO
 *
 * No está aquí por orden: está aquí porque **no puede estar en el otro**. Un
 * módulo `"use server"` sólo puede exportar funciones asíncronas — un `type` o
 * una constante compilan, pasan el lint y revientan al ejecutarse con un
 * «algo no ha ido bien» que no dice nada. Ya pasó una vez, en la importación
 * de invitados, y hay un test unitario que lo vigila desde entonces.
 */

/** Lo que la pantalla necesita saber después de intentar apuntar una canción. */
export interface EstadoPlaylist {
  /** `null` mientras nadie ha escrito nada todavía. */
  fase: "inicial" | "apuntada" | "fallo";
  /** Ya traducido a castellano: la pantalla no conoce los códigos de la base. */
  aviso: string | null;
  /**
   * Lo que se escribió, para devolverlo al campo cuando algo falla. Sin esto,
   * un tope alcanzado borra de la pantalla la canción que costó recordar.
   */
  texto: string;
  /**
   * Cuántas veces se ha enviado. Es lo que usa el campo como `key`, y por eso
   * sube en cada intento y no sólo en los buenos.
   *
   * REACT NO VACÍA UN CAMPO NO CONTROLADO al repintar: apuntada la canción, el
   * texto seguía escrito y el botón invitaba a mandarla otra vez. Cambiar la
   * `key` monta un campo nuevo, que nace con el `defaultValue` de este estado
   * —vacío si fue bien, lo escrito si falló—. Con un contador que sólo subiera
   * al acertar, dos canciones seguidas compartirían `key` y la segunda no se
   * limpiaría.
   */
  sello: number;
}

export const ESTADO_INICIAL: EstadoPlaylist = {
  fase: "inicial",
  aviso: null,
  texto: "",
  sello: 0,
};
