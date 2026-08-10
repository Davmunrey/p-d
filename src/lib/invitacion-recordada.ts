import "server-only";

import { cookies } from "next/headers";

import { COOKIE_INVITACION } from "@/lib/invitacion";

/**
 * La invitación que el navegador recuerda, para las páginas y las acciones.
 *
 * Es la pareja de `invitacion.ts`: allí se escribe la cookie desde el
 * middleware, aquí se lee desde el servidor. Están en dos ficheros porque el
 * middleware no puede ni ver `next/headers`.
 *
 * NUNCA LANZA. Sin cookie, con la cookie vacía o con la cookie a medias, la
 * respuesta es `null` y quien llama enseña la explicación. Que la portada
 * entera se caiga por una cookie mal formada sería el peor cambio posible por
 * una sección que es un extra.
 */
export async function invitacionRecordada(): Promise<string | null> {
  const valor = (await cookies()).get(COOKIE_INVITACION)?.value?.trim();
  return valor || null;
}
