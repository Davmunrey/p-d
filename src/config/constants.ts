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

/**
 * Cuánto recuerda el navegador de qué invitación es.
 *
 * Se guarda al abrir el enlace de invitación y sirve para que la playlist de
 * la portada sepa quién escribe: apuntar una canción exige token, porque la
 * lista es de los invitados y no de internet entera.
 *
 * UN AÑO, Y NO UNA SESIÓN. La invitación se manda meses antes de la boda y la
 * canción se apunta cuando a uno le viene a la cabeza —en el coche, oyendo la
 * radio—, que no es el mismo día en que confirmó. Una cookie de sesión
 * obligaría a volver a WhatsApp a buscar el enlace justo en ese momento, y lo
 * que pasa entonces es que no se apunta la canción.
 */
export const DIAS_RECUERDO_INVITACION = 365;

/**
 * Lo más largo que puede ser una canción apuntada en la playlist.
 *
 * ES EL MISMO NÚMERO QUE LA RESTRICCIÓN DE LA TABLA, a propósito: el navegador
 * corta antes de mandar y la base vuelve a comprobarlo. Si aquí fuera mayor, el
 * campo dejaría escribir un texto que la base rechaza después, y el invitado se
 * llevaría un error por algo que la pantalla le había dejado hacer.
 */
export const LIMITE_TEXTO_CANCION = 160;

/** Rutas del panel privado. Se escriben en varios sitios: viven aquí. */
export const RUTA_ACCESO = "/acceso";
export const RUTA_CONFIRMAR_ACCESO = "/acceso/confirmar";
export const RUTA_PANEL = "/panel";
export const RUTA_RECUPERAR = "/acceso/recuperar";
export const RUTA_NUEVA_CONTRASENA = "/acceso/nueva-contrasena";
export const RUTA_CUENTA = "/panel/cuenta";
export const RUTA_AJUSTES = "/panel/ajustes";
export const RUTA_INVITADOS = "/panel/invitados";
export const RUTA_MENSAJES = "/panel/mensajes";
export const RUTA_PROVEEDORES = "/panel/proveedores";
export const RUTA_PRESUPUESTO = "/panel/presupuesto";

/**
 * Tope de acompañantes que se puede fijar por invitación desde el panel.
 *
 * No es una regla de la boda, es un pararrayos: el campo es un número que se
 * teclea, y un cero de más convertiría «pueden traer a dos» en «pueden traer a
 * veinte». El aforo de verdad lo impone `invitados_aforo_grupo` en la base.
 */
export const MAXIMO_ACOMPANANTES = 20;

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

/**
 * Cuánto se queda el «Copiado» en el botón del IBAN, en milisegundos.
 *
 * Suficiente para leerlo sin prisa y poco para que no se quede fijo: un aviso
 * permanente deja de significar nada en cuanto se pulsa una segunda vez y ya
 * ponía lo mismo.
 */
export const DURACION_AVISO_COPIADO = 2000;

/**
 * Cuántas filas se admiten en una importación de invitados.
 *
 * No es un límite técnico —la función de la base importa en una transacción y
 * aguantaría muchas más— sino un cortafuegos: doscientas es de largo la boda
 * más grande imaginable, así que un fichero con miles de filas no es la lista
 * de invitados, es el CSV equivocado. Mejor decirlo antes de dar de alta a
 * cinco mil desconocidos.
 */
export const MAXIMO_FILAS_IMPORTACION = 500;

/** La lista de quien no ha contestado. La escriben el panel y su test. */
export const RUTA_PENDIENTES = "/panel/invitados/pendientes";

/**
 * A dónde se mandan los correos.
 *
 * Configurable a propósito, y no porque vaya a cambiar de proveedor: es lo que
 * permite que el test del camino feliz apunte a un buzón de pruebas y lea lo
 * que se mandó de verdad. Sin esto, comprobar el envío exigiría una clave real
 * en CI o un mock de nuestro propio código, que no probaría que el correo sale.
 */
export const URL_RESEND = process.env.RESEND_URL ?? "https://api.resend.com";

/**
 * De dónde saca la landing el número de cuenta, y por qué no viene ya puesto:
 * un IBAN escrito en el HTML lo indexan los buscadores y lo recogen los
 * rastreadores sin que nadie haya abierto la página. Ver BODA-28.
 */
export const RUTA_CUENTA_REGALOS = "/regalos/cuenta";
