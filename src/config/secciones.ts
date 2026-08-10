/**
 * SECCIONES DE LA LANDING
 *
 * La lista de secciones, su visibilidad y su orden viven en la tabla
 * `secciones_landing`. Lo que vive aquí es lo único que la base de datos no
 * puede saber: qué forma tiene cada sección en la web —un ancla dentro de la
 * landing o una página aparte— y cómo se llama su destino.
 *
 * Por qué el listado se repite en TypeScript teniendo el enumerado en SQL: el
 * frontend tiene un componente por sección, así que la lista es también un
 * contrato de compilación. Gracias a él, `t("navegacion.secciones.programa")`
 * falla en `typecheck` si a alguien se le olvida el rótulo, en vez de reventar
 * en runtime delante de un invitado.
 *
 * `tests/unidad/secciones.test.ts` compara esta lista con el SQL de las
 * migraciones: si divergen, el CI se pone rojo. Es el fallo que provocó esta
 * pantalla —la landing pintaba el programa y la playlist, y el enumerado no
 * las conocía, así que no había forma de enseñarlas en el menú ni de apagarlas.
 */

/**
 * Todos los valores del enumerado `public.seccion_landing`, en el mismo orden
 * en que se declararon.
 */
export const SECCIONES = [
  "portada",
  "reserva_la_fecha",
  "cuenta_atras",
  "historia",
  "galeria",
  "preboda",
  "programa",
  "ubicaciones",
  "transporte",
  "alojamiento",
  "regalos",
  "dresscode",
  "preguntas_frecuentes",
  "playlist",
  "rsvp",
] as const;

export type Seccion = (typeof SECCIONES)[number];

/**
 * Secciones que no son un trozo de la landing sino una página propia. Su fila
 * en `secciones_landing` decide si la ruta existe o devuelve 404, pero no
 * aparecen en el menú: quien está leyendo la web ya no necesita que le
 * recuerden la fecha.
 */
const RUTAS_PROPIAS = {
  reserva_la_fecha: "/reserva-la-fecha",
} as const satisfies Partial<Record<Seccion, string>>;

export type SeccionConRuta = keyof typeof RUTAS_PROPIAS;

/** El identificador del elemento en el documento, y el destino de su enlace. */
export function anclaDe(seccion: Seccion): string {
  return seccion.replaceAll("_", "-");
}

/** `true` si la sección se recorre haciendo scroll dentro de la landing. */
export function esAncla(seccion: Seccion): boolean {
  return !(seccion in RUTAS_PROPIAS);
}

export function rutaDe(seccion: SeccionConRuta): string {
  return RUTAS_PROPIAS[seccion];
}

/** Convierte lo que devuelve la base de datos en un valor que sabemos pintar. */
export function esSeccionConocida(valor: string): valor is Seccion {
  return (SECCIONES as readonly string[]).includes(valor);
}
