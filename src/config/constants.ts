/**
 * CONSTANTES CON NOMBRE
 *
 * Ningún número mágico suelto por el código. Si un valor necesita explicación,
 * su nombre es la explicación.
 *
 * Ojo: aquí NO van datos de la boda (fecha, lugar, nombres). Eso vive en la
 * tabla `wedding_settings` y se lee en runtime.
 */

/** Atributo del elemento raíz que fuerza el tema. */
export const ATRIBUTO_TEMA = "data-tema";

/** Clave de `localStorage` donde se recuerda la preferencia de tema. */
export const CLAVE_TEMA = "boda:tema";

export const TEMAS = ["claro", "oscuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];
export const TEMA_POR_DEFECTO: Tema = "sistema";

/** Filas por página en las tablas del panel. */
export const FILAS_POR_PAGINA = 25;

/** Milisegundos de espera antes de lanzar una búsqueda mientras se escribe. */
export const RETARDO_BUSQUEDA_MS = 300;

/** Longitud del token de invitación. Suficiente para que no se adivine. */
export const LONGITUD_TOKEN_INVITACION = 24;

/** Peso máximo por imagen subida al gestor de fotos. */
export const PESO_MAXIMO_IMAGEN_MB = 10;

/** Idioma de la aplicación. La boda es en España: solo castellano. */
export const IDIOMA = "es-ES";

/** Zona horaria de referencia para fechas y cuentas atrás. */
export const ZONA_HORARIA = "Europe/Madrid";
