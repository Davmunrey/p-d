import { IDIOMA, ZONA_HORARIA } from "@/config/constants";

/**
 * CÓMO SE ESCRIBEN LAS FECHAS EN ESTA BODA
 *
 * El Sistema de marca lo fija en su lista de repaso: «Fecha siempre como
 * 26 · 06 · 2027 o «26 de junio de 2027»». Aquí viven los formateadores con
 * nombre para que ninguna pantalla se invente el suyo — la landing, el Save
 * the Date y el pie escriben la fecha con las mismas funciones.
 *
 * Todo pasa por `Intl` y por la zona horaria de la boda: la ceremonia es a
 * una hora de Madrid, y un servidor en otra zona no puede cambiar el día.
 */

const formatoCorto = new Intl.DateTimeFormat(IDIOMA, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

/**
 * `26 · 06 · 2027`, como en todas las piezas de la marca.
 *
 * Se compone a partir de las partes que da `Intl`, no cortando la cadena
 * formateada: el orden de día y mes depende del idioma, y trocear texto
 * formateado es la forma clásica de acabar publicando el mes como día.
 */
export function fechaEnPuntos(fecha: Date): string {
  const partes = Object.fromEntries(
    formatoCorto.formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  return [partes.day, partes.month, partes.year].join(" · ");
}

const formatoConDia = new Intl.DateTimeFormat(IDIOMA, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: ZONA_HORARIA,
});

const formatoLargo = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

const formatoDia = new Intl.DateTimeFormat(IDIOMA, { weekday: "long", timeZone: ZONA_HORARIA });

const formatoAnio = new Intl.DateTimeFormat(IDIOMA, {
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

/**
 * «Sábado 26 de junio»: la cabecera del programa y de la víspera, y la fecha
 * de la tarjeta del Save the Date.
 *
 * Sin coma y sin año, con la inicial en mayúscula: así la escribe la entrega.
 * `Intl` en castellano devuelve «sábado, 26 de junio», con la coma que la RAE
 * pide en una fecha completa; aquí es un rótulo, no una frase, y la entrega
 * la quita. Se compone desde las partes para no depender de dónde ponga
 * `Intl` la coma en cada versión del motor.
 */
export function fechaConDia(fecha: Date): string {
  const partes = Object.fromEntries(
    formatoConDia.formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  const dia = partes.weekday.charAt(0).toUpperCase() + partes.weekday.slice(1);
  return `${dia} ${partes.day} de ${partes.month}`;
}

/** «1 de mayo de 2027»: los plazos (alojamiento, RSVP). Sin día de la semana. */
export function fechaLarga(fecha: Date): string {
  return formatoLargo.format(fecha);
}

/** «viernes», en minúscula: para meterlo dentro de una frase. */
export function nombreDelDia(fecha: Date): string {
  return formatoDia.format(fecha);
}

/**
 * El día anterior, contado en la zona de la boda. La víspera de una boda a
 * las 00:30 del sábado es el viernes, no el jueves que saldría restando
 * veinticuatro horas en UTC y formateando en Madrid… ni el propio sábado.
 * Restar un día de calendario sobre el instante y dejar que `Intl` lo lea en
 * la zona de la boda da el día que la gente tiene en la cabeza.
 */
export function vispera(fecha: Date): Date {
  return new Date(fecha.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * «2027»: el año solo. La tarjeta del Save the Date lo escribe en su propia
 * línea, grande, debajo de «Sábado 26 de junio». En la zona de la boda, como
 * todo lo demás: una ceremonia en Nochevieja no cambia de año por el servidor.
 */
export function anio(fecha: Date): string {
  return formatoAnio.format(fecha);
}
