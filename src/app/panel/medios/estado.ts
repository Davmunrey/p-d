import { RUTA_MEDIOS } from "@/config/constants";

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
  | "borrado-sin-fichero"
  | "movido"
  | "alternativo-guardado"
  | "sin-fichero"
  | "sin-alternativo"
  | "tipo-no-admitido"
  | "demasiado-grande"
  | "sin-poster"
  | "sin-configurar"
  | "sin-permiso"
  | "no-existe"
  | "confirmar-borrado"
  | "subida-cortada"
  | "error";

/**
 * DÓNDE SE ENSEÑA EL AVISO. La pantalla vuelve a la ficha o a la sección de la
 * que salió la acción —en el móvil, la galería está a dos mil píxeles de la
 * cabecera— y el aviso se pinta ahí, junto a lo que acaba de cambiar.
 */
export function anclaDeMedio(id: string): string {
  return `medio-${id}`;
}

export function anclaDeSeccion(seccion: string): string {
  return `seccion-${seccion}`;
}

/**
 * A dónde vuelve la pantalla tras una acción: el acuse en `?estado=` y el ancla
 * de la ficha o de la sección. Lo usan las acciones al redirigir y el
 * formulario de subida, que es el único que se mueve desde el navegador.
 */
export function destinoDe(
  estado: EstadoMedios,
  donde: { medio?: string; seccion?: string } = {},
): string {
  const parametros = new URLSearchParams({ estado });
  if (donde.medio) parametros.set("medio", donde.medio);
  if (donde.seccion) parametros.set("seccion", donde.seccion);
  const ancla = donde.medio
    ? `#${anclaDeMedio(donde.medio)}`
    : donde.seccion
      ? `#${anclaDeSeccion(donde.seccion)}`
      : "";
  return `${RUTA_MEDIOS}?${parametros}${ancla}`;
}

/** Cuáles se cuentan como un fallo. Decide el color del aviso y su `role`. */
export const ESTADOS_DE_ERROR: readonly EstadoMedios[] = [
  "sin-fichero",
  "sin-alternativo",
  "tipo-no-admitido",
  "demasiado-grande",
  "sin-poster",
  "sin-configurar",
  "sin-permiso",
  "no-existe",
  "confirmar-borrado",
  "subida-cortada",
  // Se ha borrado, pero el fichero sigue siendo público por su URL: hay que
  // decirlo en rojo, no felicitar.
  "borrado-sin-fichero",
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

/** Una subida firmada: a qué ruta del bucket va y la URL con la que se sube. */
export interface FicheroASubir {
  ruta: string;
  url: string;
}

/** Lo que devuelve `prepararSubida`: el fichero y, si es vídeo, su fotograma. */
export interface SubidaPreparada {
  fichero: FicheroASubir;
  poster: FicheroASubir | null;
}
