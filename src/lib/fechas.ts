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
