/**
 * LO QUE COMPARTEN LA PANTALLA DE AJUSTES Y SUS ACCIONES.
 *
 * Vive fuera de `acciones.ts` porque un fichero `"use server"` sólo puede
 * exportar funciones asíncronas, y la pantalla necesita estos nombres para
 * saber a qué campo pertenece cada error.
 */

/** Los estados con los que vuelve la pantalla. Cada uno tiene su copy. */
export type EstadoAjustes =
  | "guardado"
  | "regalos-guardado"
  | "iban"
  | "solo-propietario"
  | "nombres"
  | "ceremonia"
  | "limite"
  | "limite-tarde"
  | "banquete"
  | "banquete-antes"
  | "coordenadas"
  | "hashtag"
  | "correo"
  | "avisos"
  | "largo"
  | "paisaje-corto"
  | "cambiado"
  | "sin-permiso"
  | "error";

/** Los que dicen que se guardó: con ellos no se enseña ningún borrador. */
export const ESTADOS_DE_EXITO: readonly EstadoAjustes[] = ["guardado", "regalos-guardado"];

/** Los campos de los dos formularios: son los `name` de la pantalla. */
export const CAMPOS_AJUSTES = [
  "nombre_novia",
  "nombre_novio",
  "hashtag",
  "fecha_hora_ceremonia",
  "lugar_ceremonia",
  "direccion_ceremonia",
  "ciudad_ceremonia",
  "latitud_ceremonia",
  "longitud_ceremonia",
  "fecha_hora_banquete",
  "lugar_banquete",
  "direccion_banquete",
  "latitud_banquete",
  "longitud_banquete",
  "avisos_programa",
  "paisaje_intro",
  "paisaje_titulo",
  "paisaje_cierre",
  "correo_contacto",
  "fecha_limite_rsvp",
  "iban_regalos",
  "titular_cuenta",
] as const;

export type CampoAjustes = (typeof CAMPOS_AJUSTES)[number];

export function esCampoAjustes(valor: unknown): valor is CampoAjustes {
  return CAMPOS_AJUSTES.includes(valor as CampoAjustes);
}

/** El `id` del bloque de cada campo: a él salta la página cuando falla. */
export function anclaDeCampo(campo: CampoAjustes): string {
  return `campo-${campo}`;
}
