import "server-only";

import { huellaDePeticion } from "@/lib/huella-peticion";

import { llamarComoAnonimo } from "./cliente";

/**
 * EL ENLACE PERSONAL DE CADA INVITACIÓN
 *
 * Ya no sirve para confirmar —eso se contesta por WhatsApp y los novios lo
 * apuntan en el panel—: abre la web saludando al grupo por su nombre y le deja
 * proponer canciones para la playlist.
 *
 * SÓLO EL NOMBRE. `nombre_de_invitacion()` es `security definer` y devuelve
 * eso y nada más: ni las personas del grupo, ni sus menús, ni sus alergias. Un
 * enlace filtrado enseña cómo se llama una familia, no sus datos de salud.
 *
 * `null` ES UN DATO, NO UNA AVERÍA: el enlace no existe, o el grupo todavía no
 * tiene a nadie dentro. Si la base no contesta —o el cortafuegos corta por
 * demasiados intentos desde la misma conexión (RSV02)—, esto LANZA, y quien
 * llama decide: no es lo mismo «este enlace no vale» que «ahora mismo no se
 * puede saber».
 */
export async function nombreDeInvitacion(token: string): Promise<string | null> {
  // Con la huella: el cortafuegos cuenta intentos por origen, y sin ella todos
  // los invitados compartirían el mismo cupo.
  const filas = await llamarComoAnonimo(
    (tx) => tx<{ nombre_de_invitacion: string | null }[]>`
      select public.nombre_de_invitacion(${token})
    `,
    await huellaDePeticion(),
  );

  return filas[0]?.nombre_de_invitacion ?? null;
}
