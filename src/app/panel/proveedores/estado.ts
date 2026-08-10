/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN, EN UNA FRASE
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y las dos
 * pantallas que lo pintan. Es la misma separación que en la importación de
 * invitados, y por el mismo motivo: un `export type` allí compila, pasa el
 * lint, y revienta al abrir la pantalla.
 */

export type EstadoProveedores =
  | "creado"
  | "editado"
  | "borrado"
  | "estado-cambiado"
  | "contacto-anadido"
  | "contacto-quitado"
  | "categoria-creada"
  | "categoria-borrada"
  | "nombre"
  | "categoria"
  | "importe"
  | "valoracion"
  | "contacto-sin-via"
  | "estado"
  | "descarte-sin-motivo"
  | "confirmar-contratado"
  | "confirmar-borrado"
  | "no-existe"
  | "en-uso"
  | "sin-permiso"
  | "error";
