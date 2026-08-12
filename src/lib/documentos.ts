import { PESO_MAXIMO_DOCUMENTO_MB, TIPOS_DOCUMENTO_ADMITIDOS } from "@/config/constants";
import { identificadorDeRuta } from "@/lib/medios";

/**
 * BODA-72 · LO QUE SE DECIDE ANTES DE TOCAR STORAGE
 *
 * Hermano de `lib/medios.ts` y separado de él a propósito: son dos buckets con
 * dos topes, dos listas de tipos y dos formas de nombrar la carpeta. Meterlos
 * en el mismo módulo obligaría a pasar un «¿de cuál?» por todas las funciones,
 * y ese parámetro acabaría equivocado el día que alguien copie una llamada.
 *
 * FUERA DE `server-only`, igual que el de medios: el formulario tiene que
 * poder decir «eso no es un contrato» antes de mandar veinte megas, y la
 * acción de servidor tiene que volver a decirlo. Es la MISMA función en los dos
 * sitios, que es lo que impide que el navegador acepte lo que el servidor
 * rechaza.
 *
 * `identificadorDeRuta` SE IMPORTA, NO SE COPIA. Fabricar una cadena aleatoria
 * en base 36 no tiene nada de «medios»: es la misma función, ya probada, y una
 * segunda copia aquí sería un sitio más donde arreglar el día que se descubra
 * que doce caracteres se quedan cortos.
 */

/** Un mega, en bytes. Los topes se piensan en megas y se comprueban en bytes. */
const BYTES_POR_MEGA = 1024 * 1024;

/**
 * Qué extensión le corresponde a cada tipo admitido.
 *
 * SE MIRA EL TIPO DECLARADO, NO EL NOMBRE DEL FICHERO. Un contrato escaneado
 * desde el móvil llega como «documento.PDF», como «scan.jpeg» o directamente
 * sin extensión, y a veces con la extensión de otra cosa. La que se guarda sale
 * de aquí: así la ruta describe lo que hay dentro.
 */
const EXTENSIONES: Record<(typeof TIPOS_DOCUMENTO_ADMITIDOS)[number], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export type MotivoRechazoDocumento = "tipo" | "peso";

export type VeredictoDocumento =
  { admitido: true; extension: string } | { admitido: false; motivo: MotivoRechazoDocumento };

function esTipoAdmitido(tipo: string): tipo is (typeof TIPOS_DOCUMENTO_ADMITIDOS)[number] {
  return (TIPOS_DOCUMENTO_ADMITIDOS as readonly string[]).includes(tipo);
}

/**
 * ¿Se admite este fichero como documento de un proveedor?
 *
 * EL TIPO SE MIRA ANTES QUE EL PESO, y el orden decide el mensaje: a quien
 * arrastra el vídeo de la finca hay que decirle que los vídeos no valen, no que
 * se ha pasado de peso — porque comprimirlo no le va a servir de nada y va a
 * intentarlo igualmente.
 */
export function admitirDocumento(fichero: { type: string; size: number }): VeredictoDocumento {
  if (!esTipoAdmitido(fichero.type)) return { admitido: false, motivo: "tipo" };

  if (fichero.size > PESO_MAXIMO_DOCUMENTO_MB * BYTES_POR_MEGA) {
    return { admitido: false, motivo: "peso" };
  }

  return { admitido: true, extension: EXTENSIONES[fichero.type] };
}

/**
 * DÓNDE VA A VIVIR EL DOCUMENTO: `<proveedor>/<algo-aleatorio>.<ext>`.
 *
 *   · EL PROVEEDOR DELANTE, y no el tipo de documento: es como se mira el
 *     bucket desde fuera cuando hace falta («¿qué tenemos del catering?») y es
 *     lo que permitiría, el día que Storage admita políticas nuestras, colgar
 *     el permiso de un prefijo.
 *   · UN IDENTIFICADOR ALEATORIO Y NO EL NOMBRE ORIGINAL. Dos personas suben
 *     «contrato.pdf» y una pisaría a la otra; y aunque el bucket sea privado,
 *     una ruta adivinable es una ruta menos que adivinar.
 *   · LA EXTENSIÓN DEL TIPO REAL, no la que trajera el fichero.
 *
 * El nombre original no se pierde: va a la columna `nombre`, que es donde
 * sirve de algo. En la ruta sólo estorbaría.
 *
 * `es_ruta_almacenamiento_valida` lo vuelve a comprobar en la base: sin barra
 * inicial, sin `..` y entre 3 y 255 caracteres. Un identificador de proveedor
 * más doce caracteres más la extensión cabe de sobra.
 */
export function componerRutaDocumento(
  proveedorId: string,
  extension: string,
  azar: string,
): string {
  return `${proveedorId}/${azar}.${extension}`;
}

export { identificadorDeRuta };
