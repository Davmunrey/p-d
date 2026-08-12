import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * La moneda de la boda, para escribir los importes.
 *
 * Vive en `configuracion_boda` y no en una constante: la regla 1 del proyecto
 * es que un valor que puede cambiar sin que cambie la lógica es configuración.
 * Si la lectura falla se devuelve `null` y quien llama decide — pero nadie
 * inventa un «EUR» de respaldo, que sería enseñar importes en una moneda que
 * no es la de la boda y hacerlo además en silencio.
 */
export async function obtenerMonedaBoda(): Promise<string | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("configuracion_boda")
    .select("moneda")
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer la moneda de la boda:", error);
    return null;
  }

  return (data as { moneda: string } | null)?.moneda ?? null;
}

/** El día de la boda y el día de hoy, los dos en la zona horaria de la boda. */
export interface DiasDeLaBoda {
  /** `2027-06-26`, la fecha de la ceremonia leída en su propia zona. */
  fechaBoda: string;
  /** Hoy en esa misma zona, en el formato que entiende `<input type="date">`. */
  hoy: string;
  zonaHoraria: string;
}

/**
 * BODA-105 · LAS DOS FECHAS CONTRA LAS QUE SE MIDE UN DOCUMENTO
 *
 * SALEN DE LA BASE Y NO DE UNA CONSTANTE. `ZONA_HORARIA` existe como referencia
 * para la landing, pero la zona de verdad es la de `configuracion_boda`: una
 * boda en Canarias con el código apuntando a Madrid tiene su fecha desplazada
 * una hora, y en una ceremonia de medianoche eso es un día entero de diferencia.
 *
 * Y EL DÍA SE SACA EN ESA ZONA, no en la del proceso. Vercel corre en UTC, así
 * que `new Date().toISOString()` da «mañana» desde las dos de la madrugada de
 * un verano español: un documento recogido el martes por la noche quedaría
 * apuntado como del miércoles, y con un plazo de tres meses ese día importa.
 *
 * Devuelve `null` si no se puede leer. Quien llama decide qué hacer — pero
 * nadie se inventa una fecha de boda de respaldo, que sería avisar de
 * caducidades contra un día que no es el de esta boda.
 */
export async function obtenerDiasDeLaBoda(): Promise<DiasDeLaBoda | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("configuracion_boda")
    .select("fecha_hora_ceremonia, zona_horaria")
    .maybeSingle();

  if (error) {
    console.error("No se pudieron leer las fechas de la boda:", error);
    return null;
  }

  const fila = data as { fecha_hora_ceremonia: string; zona_horaria: string } | null;
  if (!fila) return null;

  const ceremonia = new Date(fila.fecha_hora_ceremonia);
  if (Number.isNaN(ceremonia.getTime())) return null;

  return {
    fechaBoda: diaEn(ceremonia, fila.zona_horaria),
    hoy: diaEn(new Date(), fila.zona_horaria),
    zonaHoraria: fila.zona_horaria,
  };
}

/**
 * Un instante → el día que es en esa zona, como `2027-06-26`.
 *
 * El sueco escribe las fechas en el orden ISO, así que `sv-SE` da el formato
 * del `<input type="date">` sin componerlo trozo a trozo — que es como se
 * cuelan los meses sin cero delante.
 */
function diaEn(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}
