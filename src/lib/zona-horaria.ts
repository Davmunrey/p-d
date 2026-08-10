/**
 * FECHAS DE LA BODA, ENTRE EL FORMULARIO Y LA BASE
 *
 * La base guarda instantes (`timestamptz`) y el formulario usa
 * `<input type="datetime-local">`, que da y espera una fecha SIN zona: el
 * navegador escribe «2027-06-26T13:00» y no dice de dónde.
 *
 * Interpretar ese texto con `new Date(...)` usa la zona del servidor, que en
 * Vercel es UTC. En verano España va dos horas por delante, así que una
 * ceremonia guardada «a las 13:00» saldría en la web a las 15:00. El fallo es
 * silencioso —una fecha válida, sólo que la equivocada— y no lo descubriría
 * nadie hasta que un invitado se presentara a la hora que no era.
 *
 * Así que la zona se pasa siempre explícita: la de la boda, que vive en
 * `configuracion_boda.zona_horaria`. Aquí no hay ninguna zona por defecto a
 * propósito — quien llama tiene que decir cuál, y así no se puede olvidar.
 */

/**
 * Cuánto se adelanta `zona` respecto a UTC en ese instante concreto, en
 * milisegundos. Es específico del instante porque el horario de verano existe:
 * en Madrid son +1 h en enero y +2 h en julio.
 */
function desfase(instante: Date, zona: string): number {
  const formato = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const partes = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );

  // `hour` puede venir como «24» a medianoche según el motor; `% 24` lo deja
  // en 0, que es el mismo momento.
  const comoSiFueraUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );

  return comoSiFueraUtc - instante.getTime();
}

/**
 * `"2027-06-26T13:00"` en `Europe/Madrid` → el instante real (UTC).
 *
 * Devuelve `null` si el texto no es una fecha con hora: un campo vacío o a
 * medio escribir no es un error que haya que gritar, es «no hay dato».
 *
 * El desfase se calcula dos veces porque el propio desfase depende del
 * instante, y el instante es lo que se está buscando. La primera pasada da una
 * aproximación; la segunda la corrige en el único caso que importa, cuando la
 * fecha cae justo en el cambio de hora y las dos pasadas discrepan.
 */
export function instanteDesdeLocal(texto: string, zona: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(texto)) return null;

  const conSegundos = texto.length === 16 ? `${texto}:00` : texto;
  const comoUtc = new Date(`${conSegundos}Z`);
  if (Number.isNaN(comoUtc.getTime())) return null;

  const primera = new Date(comoUtc.getTime() - desfase(comoUtc, zona));
  const segunda = new Date(comoUtc.getTime() - desfase(primera, zona));

  return segunda;
}

/**
 * El camino de vuelta: un instante → `"2027-06-26T13:00"` en `zona`, que es lo
 * que entiende `<input type="datetime-local">` como valor inicial.
 */
export function localDesdeInstante(instante: Date, zona: string): string {
  if (Number.isNaN(instante.getTime())) return "";

  const formato = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zona,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // El sueco escribe las fechas como `2027-06-26 13:00`, que es la norma ISO
  // salvo por el espacio. Se cambia por la «T» y ya está en el formato del
  // campo, sin componerlo a mano trozo a trozo.
  return formato.format(instante).replace(" ", "T");
}
