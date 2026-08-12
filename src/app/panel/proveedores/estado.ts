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
  /* BODA-72 · documentos */
  | "documento-subido"
  | "documento-borrado"
  | "confirmar-documento"
  | "documento-sin-fichero"
  | "documento-nombre"
  | "documento-tipo"
  | "documento-peso"
  | "sin-configurar"
  /* BODA-74 · servicios */
  | "servicio-creado"
  | "servicio-editado"
  | "servicio-borrado"
  | "servicio-nombre"
  | "servicio-precio"
  | "servicio-cantidad"
  | "servicio-minimo"
  | "servicio-minimo-suelto"
  /* BODA-73 · comparador */
  | "elegido"
  | "no-existe"
  | "en-uso"
  | "sin-permiso"
  | "error";
