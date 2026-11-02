import "server-only";

import { cookies } from "next/headers";

import { nombreDeInvitacion } from "@/lib/bbdd/invitacion";
import { COOKIE_INVITACION } from "@/lib/invitacion";

/**
 * La invitación que el navegador recuerda, para las páginas y las acciones.
 *
 * Es la pareja de `invitacion.ts`: allí se dice cómo se guarda la cookie, aquí
 * se lee desde el servidor.
 *
 * NUNCA LANZA. Sin cookie, con la cookie vacía o con la cookie a medias, la
 * respuesta es `null`. Que la portada entera se caiga por una cookie mal
 * formada sería el peor cambio posible por un saludo.
 */
export async function invitacionRecordada(): Promise<string | null> {
  const valor = (await cookies()).get(COOKIE_INVITACION)?.value?.trim();
  return valor || null;
}

/**
 * A quién saluda la portada: el nombre del grupo de la invitación que recuerda
 * el navegador, o `null`.
 *
 * SE PREGUNTA A LA BASE Y NO SE GUARDA EN LA COOKIE. Si los novios corrigen el
 * nombre de un grupo en el panel, la portada lo saluda bien en la siguiente
 * visita; un nombre guardado en la cookie lo arrastraría un año. Y si el enlace
 * se ha anulado —se emitió uno nuevo—, deja de saludar, que es la verdad.
 *
 * UNA AVERÍA NO TUMBA LA PORTADA: sin base, o con el cortafuegos cerrado, la
 * portada sale igual, sólo que sin saludo.
 */
export async function saludoDeLaVisita(): Promise<string | null> {
  const token = await invitacionRecordada();
  if (!token) return null;

  try {
    return await nombreDeInvitacion(token);
  } catch (error) {
    console.error("No se pudo leer a quién saludar:", error);
    return null;
  }
}

/**
 * Olvida la invitación que el navegador recordaba.
 *
 * Sólo se llama desde una acción y sólo cuando la base ya ha dicho que el token
 * no vale —un enlace anulado al emitir uno nuevo—: es la única ocasión en que
 * se SABE que la cookie está mal. La próxima visita ve la explicación de «sin
 * invitación», que es la verdad.
 */
export async function olvidarInvitacion(): Promise<void> {
  (await cookies()).delete(COOKIE_INVITACION);
}
