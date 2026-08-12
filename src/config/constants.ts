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

/** Filas por página en las tablas del panel. */
export const FILAS_POR_PAGINA = 25;

/** Milisegundos de espera antes de lanzar una búsqueda mientras se escribe. */
export const RETARDO_BUSQUEDA_MS = 300;

/** Longitud del token de invitación. Suficiente para que no se adivine. */
export const LONGITUD_TOKEN_INVITACION = 24;

/** Peso máximo por imagen subida al gestor de fotos. */
export const PESO_MAXIMO_IMAGEN_MB = 10;

/**
 * Peso máximo por vídeo, y es el tope del bucket entero.
 *
 * CINCUENTA Y NO MÁS, aunque un vídeo pueda pesar mucho más: el fondo del
 * paisaje se descarga desde datos móviles, muchas veces en el pueblo de la boda.
 * Un fichero que no cabe aquí no es un vídeo mal subido, es un vídeo que hay que
 * comprimir antes.
 *
 * Storage sólo admite UN límite por bucket, así que éste —el mayor de los dos—
 * es el que lleva la migración, y el de las imágenes lo impone la aplicación.
 */
export const PESO_MAXIMO_VIDEO_MB = 50;

/**
 * Lo que se espera a que Storage acepte un fichero antes de darlo por perdido.
 *
 * `upload()` no trae plazo propio —por dentro es un `fetch`, y un `fetch` sin
 * `signal` espera indefinidamente—, así que sin esto una subida que no contesta
 * deja la acción de servidor colgada: ni redirige, ni registra nada, ni suelta
 * la función. Treinta segundos son de sobra para los cincuenta megas de tope
 * por una línea decente, y poco para que a nadie se le haga eterno.
 */
export const PLAZO_SUBIDA_MS = 30_000;

/**
 * Lo que se deja subir. El mismo array que la migración pone en el bucket, y
 * un test unitario comprueba que no se separan.
 *
 * SON DOS SITIOS A PROPÓSITO, no por descuido: el navegador tiene que poder
 * decir «eso no» antes de subir cincuenta megas por una línea móvil, y el bucket
 * tiene que volver a decirlo por su cuenta. Una comprobación que sólo vive en el
 * cliente no es una comprobación.
 */
export const TIPOS_MEDIO_ADMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "video/mp4",
] as const;

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
 * Cuánto se ve alrededor de la finca en el mapa incrustado, en grados.
 *
 * Unos 0,01° son algo más de un kilómetro: lo justo para situar el sitio
 * respecto al pueblo sin que la finca se pierda en una mancha verde. Es un
 * número que se ajusta mirando el resultado, así que vive aquí con su nombre y
 * no incrustado en la URL, donde nadie sabría qué significa el cuarto número de
 * una lista separada por comas.
 */
export const MAPA_MARGEN_GRADOS = 0.012;

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
export const RUTA_MEDIOS = "/panel/medios";
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
 * Los gastos, uno a uno, dentro del presupuesto.
 *
 * Cuelga del presupuesto y no es una sección propia del panel a propósito: un
 * gasto sin su categoría delante no se entiende, y la pregunta que trae aquí a
 * alguien nunca es «enséñame los gastos», es «¿en qué se me está yendo esto?».
 */
/**
 * A partir de qué parte de lo previsto se avisa de que una categoría se está
 * acercando a su tope.
 *
 * NOVENTA POR CIENTO, y el número importa. Más alto —un 98%— avisa cuando ya no
 * queda margen para hacer nada: los contratos de boda se firman con semanas de
 * antelación y enterarse al 98% es enterarse después. Más bajo —un 70%— avisa
 * de todo siempre, y un aviso que sale constantemente deja de leerse, que es
 * peor que no tenerlo.
 */
export const UMBRAL_AVISO_PRESUPUESTO = 0.9;

/**
 * El presupuesto de peso de la landing, comprobado en CI.
 *
 * La invitación se abre desde WhatsApp con datos móviles, muchas veces en el
 * pueblo donde es la boda. El número no es un deseo: lo vigila un test E2E
 * que suma lo que de verdad viaja al abrir la portada, y una dependencia o
 * una foto sin optimizar lo ponen en rojo antes de llegar a producción.
 */
export const PESO_MAXIMO_PAGINA_KB = 1024;

/**
 * El tope de saltos de maquetación (Cumulative Layout Shift) de la landing.
 * 0,1 es la frontera de «bueno» de las Core Web Vitals: por debajo, nada
 * pega brincos mientras cargan las fotos.
 */
export const CLS_MAXIMO = 0.1;

/**
 * Cuántas imágenes pueden cargarse con prioridad al entrar. La portada la
 * necesita; todo lo demás espera a que se llegue a su sección. Más que esto
 * es precargar lo que quizá nadie mire, pagándolo en datos móviles.
 */
export const IMAGENES_PRIORITARIAS_MAXIMO = 3;

export const RUTA_GASTOS = "/panel/presupuesto/gastos";

/**
 * El calendario de pagos.
 *
 * Cuelga del presupuesto igual que los gastos, y por el mismo motivo: un
 * vencimiento sin saber de qué gasto es no se puede decidir. Lo que se pregunta
 * aquí no es «cuánto cuesta» sino «qué hay que pagar y cuándo», que es la única
 * pregunta del módulo que no se contesta mirando importes.
 */
export const RUTA_PAGOS = "/panel/presupuesto/pagos";

/**
 * Las gráficas del presupuesto (BODA-63).
 *
 * Cuelgan del presupuesto porque no son un módulo: son la misma información de
 * `/panel/presupuesto` mirada de lejos. Nadie entra aquí a hacer nada, se entra
 * a ver si esto va bien o va mal.
 */
export const RUTA_GRAFICAS = "/panel/presupuesto/graficas";

/**
 * EL LIENZO DE LAS GRÁFICAS, en unidades suyas.
 *
 * Un SVG necesita un sistema de coordenadas y ese sistema no es un color ni un
 * espaciado: es geometría, y va con nombre aquí, como el plano de las mesas.
 * Se dibuja siempre sobre este ancho y el navegador lo escala al hueco que
 * tenga, así que el número no es «píxeles» — es la unidad en la que están
 * escritas las barras.
 */
export const ANCHO_GRAFICA = 1000;

/** Alto de una barra y hueco hasta la siguiente, en unidades del lienzo. */
export const ALTO_BARRA_GRAFICA = 44;
export const HUECO_BARRA_GRAFICA = 16;

/**
 * Cuánto del ancho se reserva para el rótulo de la categoría.
 *
 * Va en proporción y no en unidades fijas porque las barras se dibujan sobre lo
 * que queda: si el rótulo creciera sin que esto lo supiera, las barras se
 * saldrían del lienzo por la derecha.
 */
export const PARTE_ROTULO_GRAFICA = 0.32;

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

/**
 * Los módulos que llegan con la entrega grande: tareas, mesas, documentos de
 * la boda y las pantallas del día. Las rutas viven aquí y no en literales por
 * la regla de siempre: un enlace escrito dos veces acaba escrito de dos
 * maneras.
 */
export const RUTA_TAREAS = "/panel/tareas";

export const RUTA_MESAS = "/panel/mesas";

/**
 * Los papeles de la boda civil.
 *
 * Es un módulo del panel y no una pestaña del presupuesto ni una lista de
 * tareas: lo que se pregunta aquí —«¿sigue valiendo el empadronamiento el día
 * de la boda?»— no se contesta con una casilla de hecho/sin hacer, porque un
 * documento conseguido puede dejar de servir sin que nadie lo toque. Ver
 * BODA-105.
 */
export const RUTA_DOCUMENTOS = "/panel/documentos";

/**
 * Las pantallas del día de la boda. Todo lo que se mira desde el móvil, de
 * pie y con prisa, cuelga de aquí: el guion, la agenda de contactos, el
 * buscador de invitados, el recuento del catering y el plan B en papel.
 */
export const RUTA_DIA = "/panel/dia";

export const RUTA_AGENDA_DIA = "/panel/dia/agenda";

export const RUTA_BUSCAR_DIA = "/panel/dia/buscar";

export const RUTA_RECUENTO = "/panel/dia/recuento";

export const RUTA_EXPORTAR_DIA = "/panel/dia/exportar";

/**
 * La comparativa de presupuestos dentro de una categoría. Cuelga de
 * proveedores porque compara proveedores; la categoría llega por query.
 */
export const RUTA_COMPARADOR = "/panel/proveedores/comparar";

/**
 * El IVA general, para poner los presupuestos en la misma base antes de
 * compararlos. Es configuración de la aplicación y no un dato por proveedor:
 * lo que se guarda de cada uno es su cifra y si la dio con o sin IVA.
 */
export const PORCENTAJE_IVA = 21;

/**
 * El bucket PRIVADO de contratos y facturas. El nombre está duplicado a
 * conciencia en `20260811140800_bucket_documentos.sql`; un test unitario
 * comprueba que no discrepan, igual que con el de medios.
 */
export const BUCKET_DOCUMENTOS = "documentos";

/**
 * Tope de peso de un documento. Un contrato escaneado a doble cara cabe de
 * sobra; lo que no cabe es que alguien suba un vídeo al bucket de contratos.
 */
export const PESO_MAXIMO_DOCUMENTO_MB = 20;

/**
 * Lo que se admite en el bucket de documentos: contratos y facturas llegan
 * como PDF o como foto. La lista está duplicada a conciencia en la migración
 * del bucket, que es la última línea de defensa; ésta es la primera.
 */
export const TIPOS_DOCUMENTO_ADMITIDOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

/**
 * Cuánto vive una URL firmada de descarga de un documento. Corta a propósito:
 * lo que se firma es «este clic», no «este fichero para siempre» — un enlace
 * copiado a un chat caduca antes de que nadie lo abra.
 */
export const SEGUNDOS_URL_FIRMADA = 300;

/**
 * Dónde guarda el navegador lo marcado en el guion del día mientras no hay
 * cobertura. En una finca sin señal, lo marcado no puede perderse: se apunta
 * aquí y se reenvía al volver la conexión.
 */
export const CLAVE_ALMACEN_DIA = "boda-guion-dia";

/**
 * A partir de cuántos días una tarea deja de estar «en su fecha» y pasa a
 * «vence pronto».
 *
 * UNA SEMANA, y el número importa: con tres días, media lista aparece tranquila
 * el lunes y en rojo el jueves, sin margen para hacer nada; con un mes, la
 * mitad del tablero está siempre avisando y el aviso deja de significar algo.
 *
 * Los días los cuenta la base —`v_tareas.dias_para_vencer`, con su fecha— y
 * este umbral sólo decide dónde se pone la raya. Que estén separados es lo que
 * permite cambiar el criterio sin tocar una migración.
 */
export const DIAS_VENCE_PRONTO = 7;

/** Descarga del reparto por mesa, para el catering y para la finca. */
export const RUTA_MESAS_EXPORTAR = "/panel/mesas/exportar";

/**
 * El lado del lienzo del plano, en unidades del plano.
 *
 * ES EL MISMO NÚMERO QUE `mesas_posicion_dentro_del_lienzo`, y eso no es una
 * duplicación por descuido: la base tiene que negarse a guardar una coordenada
 * fuera del lienzo pase la escritura por donde pase, y la pantalla tiene que
 * saber entre qué y qué escala para pintar. Si algún día crece, crece en los
 * dos sitios — y la migración es la que manda.
 *
 * Las unidades NO son píxeles: el lienzo se pinta en porcentaje sobre el ancho
 * que haya, así que el mismo plano vale en un móvil y en un proyector.
 */
export const LADO_PLANO_MESAS = 10000;

/**
 * Cuánto se mueve una mesa con cada pulsación de una flecha.
 *
 * DOSCIENTAS CINCUENTA UNIDADES SON UN 2,5 % DEL LIENZO: cuarenta pulsaciones
 * cruzan la sala de lado a lado. Un paso más fino convertiría colocar una mesa
 * en una sesión de clics, y uno más grueso haría imposible separar dos mesas
 * que casi se tocan — que es justo el ajuste para el que existen las flechas.
 *
 * Las flechas existen porque el plano se coloca SIN ratón y SIN JavaScript: son
 * botones de un formulario, así que funcionan con el teclado, con un lector de
 * pantalla y con la conexión de la finca.
 */
export const PASO_PLANO_MESAS = 250;

/**
 * Cuánta gente cabe en una mesa, como mínimo y como máximo.
 *
 * Los mismos números que `mesas_capacidad_rango`. No son una regla de la boda
 * —hay mesas de seis y mesas imperiales de treinta— sino una red contra el
 * dedazo: un 200 en vez de un 20 descuadraría el reparto entero.
 */
export const CAPACIDAD_MINIMA_MESA = 1;
export const CAPACIDAD_MAXIMA_MESA = 30;

/**
 * OBSERVABILIDAD (BODA-93) · las claves y el ritmo de muestreo.
 *
 * TODO ESTO SE APAGA SOLO SI NO HAY CLAVE. Sin `SENTRY_DSN` no se arranca
 * Sentry y sin `NEXT_PUBLIC_POSTHOG_KEY` no se arranca PostHog: en local y en
 * CI no hay ninguna de las dos, así que no sale ni una petición a ningún sitio.
 * Es lo contrario de lo habitual —una clave de mentira para «que no falle»—, y
 * es a propósito: una clave de mentira manda datos reales a un sitio que nadie
 * mira.
 */
export const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

export const POSTHOG_CLAVE = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

/** Dónde vive PostHog. Configurable porque tienen nube europea y americana. */
export const POSTHOG_SERVIDOR =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

/**
 * Cuántas trazas de rendimiento se mandan, de 0 a 1.
 *
 * Un décimo, y no todas: el plan gratuito de Sentry tiene un tope mensual, y
 * una boda tiene un pico de visitas el día que se manda la invitación. Gastar
 * la cuota en trazas de un día bueno dejaría sin sitio a los errores del día
 * malo, que son los que hacen falta.
 */
export const MUESTREO_TRAZAS = 0.1;

/**
 * El nombre del aviso de confirmaciones que fallan.
 *
 * Es una constante y no una cadena suelta porque la regla de alerta de Sentry
 * se escribe contra este texto exacto: cambiarlo aquí sin cambiarlo allí apaga
 * el aviso en silencio, que es la peor forma de perderlo.
 */
export const AVISO_CONFIRMACION_FALLIDA = "confirmacion-fallida";
