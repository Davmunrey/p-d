/**
 * GENERACIÓN DE FICHEROS iCalendar (.ics)
 *
 * Sin librería: el formato son unas pocas reglas, y las tres que suelen
 * romperlo —el plegado de líneas, el escapado y los finales de línea— caben
 * aquí con su explicación al lado. Una dependencia más sería más código que
 * mantener, no menos.
 *
 * SOBRE LA HORA. El ticket avisaba de que «un .ics en UTC aparece a otra hora».
 * Es al revés: el fallo clásico es emitir `20270226T120000` sin sufijo —una
 * hora *flotante*, que cada calendario interpreta en su propia zona— y ahí sí
 * la boda se mueve. Con el sufijo `Z` la fecha designa un instante exacto, y
 * cada invitado lo ve traducido a su hora local, que es justo lo que se quiere:
 * quien vive en Canarias tiene que leer las 11:00, no las 12:00.
 */

import { HORAS_DURACION_EVENTO } from "@/config/constants";

const SALTO = "\r\n";

export interface EventoCalendario {
  identificador: string;
  titulo: string;
  descripcion?: string | null;
  lugar?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  url?: string | null;
  inicio: Date;
  fin?: Date | null;
  /** Momento de generación. Se recibe para que la salida sea reproducible. */
  generadoEn: Date;
}

/**
 * Escapa un texto para un valor de propiedad iCalendar.
 *
 * Coma y punto y coma son separadores dentro de un valor: sin escapar, un lugar
 * llamado «Finca El Olivar, Toledo» parte la propiedad en dos y el calendario
 * se queda con la mitad.
 */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Pliega una línea a 75 octetos, como exige el RFC 5545.
 *
 * Se cuenta en OCTETOS y no en caracteres: en UTF-8 una «ñ» ocupa dos y una
 * «€» tres, así que contar caracteres deja líneas largas que Outlook trunca.
 * Y no se puede partir por la mitad de un carácter multibyte, de ahí que se
 * avance carácter a carácter midiendo lo que ocupa cada uno.
 */
function plegar(linea: string): string {
  const codificador = new TextEncoder();
  if (codificador.encode(linea).length <= 75) return linea;

  const trozos: string[] = [];
  let actual = "";
  let octetos = 0;
  // El límite baja a 74 en las continuaciones porque llevan un espacio delante.
  let limite = 75;

  for (const caracter of linea) {
    const ocupa = codificador.encode(caracter).length;
    if (octetos + ocupa > limite) {
      trozos.push(actual);
      actual = "";
      octetos = 0;
      limite = 74;
    }
    actual += caracter;
    octetos += ocupa;
  }
  if (actual) trozos.push(actual);

  return trozos.join(`${SALTO} `);
}

/** `20270226T110000Z` — formato UTC básico, sin guiones ni dos puntos. */
function comoMarcaUtc(fecha: Date): string {
  return `${fecha.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export function construirIcs(evento: EventoCalendario): string {
  const fin =
    evento.fin ?? new Date(evento.inicio.getTime() + HORAS_DURACION_EVENTO * 60 * 60 * 1000);

  const lineas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // PRODID identifica al programa que lo generó. Va sin traducir: es un
    // identificador técnico, no texto que lea nadie.
    "PRODID:-//boda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // El UID es estable a propósito: volver a descargar el fichero actualiza
    // el evento que ya está en el calendario en lugar de crear un duplicado.
    `UID:${escapar(evento.identificador)}`,
    `DTSTAMP:${comoMarcaUtc(evento.generadoEn)}`,
    `DTSTART:${comoMarcaUtc(evento.inicio)}`,
    `DTEND:${comoMarcaUtc(fin)}`,
    `SUMMARY:${escapar(evento.titulo)}`,
  ];

  if (evento.descripcion) lineas.push(`DESCRIPTION:${escapar(evento.descripcion)}`);
  if (evento.lugar) lineas.push(`LOCATION:${escapar(evento.lugar)}`);
  if (
    evento.latitud !== null &&
    evento.latitud !== undefined &&
    evento.longitud !== null &&
    evento.longitud !== undefined
  ) {
    // GEO va con punto y coma y sin escapar: son dos números, no texto.
    lineas.push(`GEO:${evento.latitud};${evento.longitud}`);
  }
  if (evento.url) lineas.push(`URL:${escapar(evento.url)}`);

  lineas.push("END:VEVENT", "END:VCALENDAR");

  // El RFC exige CRLF. Con saltos de línea de Unix, Outlook no abre el fichero.
  return `${lineas.map(plegar).join(SALTO)}${SALTO}`;
}
