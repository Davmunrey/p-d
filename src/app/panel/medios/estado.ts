/**
 * BODA-29 · LOS ESTADOS DE LA PANTALLA DE MEDIOS
 *
 * Vive aparte de `acciones.ts` porque un fichero `"use server"` sólo puede
 * exportar funciones asíncronas: sacar de allí un tipo o una constante rompe la
 * compilación. Y aparte de `page.tsx` porque lo escriben las acciones y lo lee
 * la página, así que si viviera en una de las dos la otra tendría que
 * importarla entera.
 *
 * SON LOS VALORES QUE VIAJAN EN `?estado=`, o sea que forman parte de la URL:
 * cambiar uno cambia un enlace que alguien puede tener abierto. Se añaden, no
 * se renombran.
 */
export type EstadoMedios =
  | "subido"
  | "publicado"
  | "despublicado"
  | "borrado"
  | "movido"
  | "alternativo-guardado"
  | "sin-fichero"
  | "sin-alternativo"
  | "tipo-no-admitido"
  | "demasiado-grande"
  | "sin-poster"
  | "sin-configurar"
  | "sin-permiso"
  | "error";

/** Cuáles se cuentan como un fallo. Decide el color del aviso y su `role`. */
export const ESTADOS_DE_ERROR: readonly EstadoMedios[] = [
  "sin-fichero",
  "sin-alternativo",
  "tipo-no-admitido",
  "demasiado-grande",
  "sin-poster",
  "sin-configurar",
  "sin-permiso",
  "error",
];

export function esEstadoMedios(valor: string): valor is EstadoMedios {
  return (
    [
      "subido",
      "publicado",
      "despublicado",
      "borrado",
      "movido",
      "alternativo-guardado",
      ...ESTADOS_DE_ERROR,
    ] as string[]
  ).includes(valor);
}
