/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN, EN UNA FRASE
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta. Es la misma separación que en proveedores y en la importación de
 * invitados, y por el mismo motivo: un `export type` allí compila, pasa el
 * lint, y revienta al abrir la pantalla.
 *
 * Los éxitos van en participio y los errores llevan el nombre del campo o del
 * motivo. `sentado-sin-confirmar` no es ninguna de las dos cosas: se ha
 * guardado, y aun así hay algo que decir — se pinta en ámbar.
 */

export type EstadoMesas =
  | "creada"
  | "editada"
  | "borrada"
  | "colocada"
  | "movida"
  | "sentado"
  | "sentado-sin-confirmar"
  | "levantado"
  | "nombre"
  | "nombre-repetido"
  | "capacidad"
  | "forma"
  | "posicion"
  | "mesa"
  | "invitado"
  | "grupo"
  | "sin-sitio"
  | "confirmar-borrado"
  | "no-existe"
  | "en-uso"
  | "sin-permiso"
  | "error";
