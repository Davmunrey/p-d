import "server-only";

import { headers } from "next/headers";

/**
 * DE DÓNDE VIENE LA PETICIÓN
 *
 * El cortafuegos del RSVP cuenta intentos fallidos por origen, y para eso
 * necesita saber quién pregunta. En un enlace anónimo no hay identidad: la
 * dirección IP es lo único que hay.
 *
 * POR QUÉ ESTO TIENE QUE EXISTIR
 *
 * `huella_peticion()` en la base lee `request.headers`, un ajuste que **pone
 * PostgREST** con las cabeceras de la petición HTTP. Esta aplicación no habla
 * por PostgREST: las páginas públicas consultan por SQL directo, y ahí ese
 * ajuste sencillamente no existe. La función caía entonces en su valor de
 * respaldo, `'desconocido'`, y **todos los invitados compartían el mismo cupo**.
 *
 * El efecto no era teórico: diez intentos fallidos de una sola persona —o de un
 * robot probando enlaces al azar— cerraban la confirmación a los ciento veinte
 * invitados durante quince minutos. La semana antes de la boda eso no se lee
 * como un cortafuegos, se lee como que la web está rota.
 *
 * QUÉ CABECERA SE MIRA Y EN QUÉ ORDEN
 *
 * `x-real-ip` primero: en Vercel la pone la plataforma con la IP del cliente y
 * no se puede falsear desde fuera. `x-forwarded-for` después, quedándose con la
 * PRIMERA entrada, que es la del cliente cuando la escribe el proxy.
 *
 * Y NO SE INVENTA NADA SI NO HAY. Sin cabeceras se devuelve `null` y la base
 * aplica su respaldo de siempre. Rellenar el hueco con la IP del servidor sería
 * peor: volvería a ser un cupo compartido, pero disfrazado de uno que funciona.
 */
export async function huellaDePeticion(): Promise<string | null> {
  const cabeceras = await headers();

  const real = cabeceras.get("x-real-ip")?.trim();
  if (real) return real;

  const reenviada = cabeceras.get("x-forwarded-for");
  const primera = reenviada?.split(",")[0]?.trim();
  return primera || null;
}
