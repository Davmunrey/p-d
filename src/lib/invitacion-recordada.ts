import "server-only";

import { cookies } from "next/headers";

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
