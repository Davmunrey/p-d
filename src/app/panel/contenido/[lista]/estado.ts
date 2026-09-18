/**
 * BODA-129 · LOS ESTADOS DE UNA LISTA DE CONTENIDO
 *
 * Vive aparte de `acciones.ts` porque un fichero `"use server"` sólo puede
 * exportar funciones asíncronas, y aparte de `page.tsx` porque lo escriben las
 * acciones y lo lee la página.
 *
 * SON LOS VALORES QUE VIAJAN EN `?estado=`, o sea que forman parte de la URL:
 * cambiar uno cambia un enlace que alguien puede tener abierto. Se añaden, no se
 * renombran.
 *
 * `confirmar-borrado` no es ni un acuse ni un error: es un PASO. Borrar no se
 * hace de un clic —una ficha borrada no vuelve— así que el primer botón lleva a
 * una pregunta, y esa pregunta es un estado de la URL y no un trozo de
 * JavaScript. Así funciona con el bundle a medio cargar, igual que el resto.
 */
export type EstadoLista =
  | "creada"
  | "guardada"
  | "retirada"
  | "publicada"
  | "borrada"
  | "movida"
  | "confirmar-borrado"
  | "falta"
  | "largo"
  | "enlace"
  | "no-encontrada"
  | "sin-permiso"
  | "error";

/** Cuáles se cuentan como un fallo. Decide el color del aviso y su `role`. */
export const ESTADOS_DE_ERROR: readonly EstadoLista[] = [
  "falta",
  "largo",
  "enlace",
  "no-encontrada",
  "sin-permiso",
  "error",
];

export function esEstadoLista(valor: string): valor is EstadoLista {
  return (
    [
      "creada",
      "guardada",
      "retirada",
      "publicada",
      "borrada",
      "movida",
      "confirmar-borrado",
      ...ESTADOS_DE_ERROR,
    ] as string[]
  ).includes(valor);
}
