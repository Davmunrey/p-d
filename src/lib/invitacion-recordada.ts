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

/**
 * Olvida la invitación que el navegador recordaba.
 *
 * Existe por un caso concreto: el middleware recuerda el token de cualquier
 * `/rsvp/<lo-que-sea>` sin poder comprobarlo —no puede, y está bien que no
 * pueda: comprobarlo gasta cupo del cortafuegos— así que un enlace mal
 * tecleado dejaba en la cookie un token que no existe, con un año de vida.
 * La portada pintaba entonces el formulario de la playlist, y cada envío
 * volvía con «ese enlace no vale». Un año así, en ese navegador.
 *
 * Sólo se llama desde una acción y sólo cuando la base ya ha dicho que el
 * token no vale: es la única ocasión en que se SABE que la cookie está mal.
 * La próxima visita ve la explicación de «sin invitación», que es la verdad.
 */
export async function olvidarInvitacion(): Promise<void> {
  (await cookies()).delete(COOKIE_INVITACION);
}
