/**
 * CONSTANTES CON NOMBRE
 *
 * Ningún número mágico suelto por el código. Si un valor necesita explicación,
 * su nombre es la explicación.
 *
 * Ojo: aquí NO van datos de la boda (fecha, lugar, nombres). Eso vive en la
 * tabla `configuracion_boda` y se lee en runtime.
 */

/**
 * `id` del elemento al que salta el enlace de «ir al contenido». Vive aquí
 * porque lo escriben dos sitios —el enlace y el `<main>`— y si dejan de
 * coincidir, el salto deja de funcionar sin que nada avise.
 */
export const ID_CONTENIDO = "contenido";

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

/**
 * Bucket de Supabase Storage donde viven las fotos de la landing. La base
 * guarda sólo la ruta relativa —lo impone `es_ruta_almacenamiento_valida`—,
 * así que el bucket se nombra una vez, aquí.
 */
export const BUCKET_MEDIOS = "medios";

/** Idioma de la aplicación. La boda es en España: solo castellano. */
export const IDIOMA = "es-ES";

/** Zona horaria de referencia para fechas y cuentas atrás. */
export const ZONA_HORARIA = "Europe/Madrid";

/** Nombre con el que se descarga el evento de la boda para el calendario. */
export const NOMBRE_FICHERO_CALENDARIO = "nuestra-boda.ics";

/**
 * Cuánto dura el evento que se apunta en el calendario, contando desde el
 * último hito con hora conocida. La base guarda cuándo *empieza* la ceremonia
 * y cuándo *empieza* el banquete, pero no cuándo acaba la fiesta — y nadie lo
 * sabe de antemano. Marcar un rato largo es mejor que dejar un evento que
 * parece terminar cuando en realidad empieza lo bueno.
 */
export const HORAS_DURACION_EVENTO = 6;

/** Descarga del evento para el calendario. La escriben la página y su test. */
export const RUTA_CALENDARIO = "/reserva-la-fecha/evento.ics";

/**
 * Raíz del RSVP público. El enlace de cada invitación es `${RUTA_RSVP}/token`,
 * y esta ruta es además el ámbito de la cookie del borrador: fuera del RSVP no
 * se manda, que es donde no pinta nada.
 */
export const RUTA_RSVP = "/rsvp";

/**
 * Cuánto vive el borrador del RSVP a medio rellenar.
 *
 * Generoso a propósito. El caso que hay que aguantar no es el de alguien que
 * responde de un tirón, sino el de quien deja el móvil, pregunta a su hermana
 * si va a ir, y vuelve. Media hora se queda corta; un día entero convierte un
 * borrador en un estado que nadie recuerda haber dejado ahí.
 */
export const MINUTOS_BORRADOR_RSVP = 180;

/** Los tres pasos del RSVP, en orden. Los escriben la página y su test. */
export const PASOS_RSVP = ["asistencia", "detalles", "mensaje"] as const;
export type PasoRsvp = (typeof PASOS_RSVP)[number];

/** Rutas del panel privado. Se escriben en varios sitios: viven aquí. */
export const RUTA_ACCESO = "/acceso";
export const RUTA_CONFIRMAR_ACCESO = "/acceso/confirmar";
export const RUTA_PANEL = "/panel";
export const RUTA_RECUPERAR = "/acceso/recuperar";
export const RUTA_NUEVA_CONTRASENA = "/acceso/nueva-contrasena";
export const RUTA_CUENTA = "/panel/cuenta";
export const RUTA_AJUSTES = "/panel/ajustes";

/**
 * Dónde se anota la ruta que alguien pidió antes de que le mandaran a la
 * puerta. Lo escribe el middleware y lo lee el formulario de acceso.
 */
export const PARAMETRO_VOLVER = "volver";

/**
 * Longitud mínima de contraseña. El formulario la comprueba para avisar antes
 * de enviar, pero quien la impone de verdad es Supabase (`config.toml`): una
 * validación que solo vive en el navegador no es una validación.
 */
export const LONGITUD_MINIMA_CONTRASENA = 12;

/**
 * Longitud mínima de un nombre en el panel. Dos caracteres: hay nombres
 * cortos de verdad, y lo que se quiere evitar es el campo vacío o con un
 * espacio, no obligar a nadie a escribir más de lo que se llama.
 */
export const LONGITUD_MINIMA_NOMBRE = 2;
