/**
 * EL RESULTADO DE LA ÚLTIMA ACCIÓN, EN UNA FRASE
 *
 * En su propio fichero porque lo comparten el módulo de acciones —que es
 * `"use server"` y sólo puede exportar funciones asíncronas— y la pantalla que
 * lo pinta. Un `export type` allí compila, pasa el lint, y revienta al abrir la
 * pantalla; lo vigila `tests/unidad/acciones-servidor.test.ts`.
 *
 * Los éxitos van en participio y los errores llevan el nombre de lo que falla,
 * que es como se leen luego en `aviso.tsx` y en la URL.
 */

export type EstadoDocumentos =
  | "apuntado"
  | "editado"
  | "borrado"
  | "conseguido"
  | "titulo"
  | "de-quien"
  | "estado-invalido"
  | "sin-fecha-obtencion"
  | "fecha"
  | "confirmar-borrado"
  | "no-existe"
  | "sin-permiso"
  | "error";
