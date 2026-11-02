import sharp from "sharp";

import { RETRATO_DE_ESTRELLAS } from "@/config/constants";

import { estrellasDeLaSilueta, type RetratoDeEstrellas, type Silueta } from "./estrellas";

/**
 * LA SILUETA DE UNA FOTO RECORTADA: su canal alfa, reducido.
 *
 * `null` si la foto no tiene transparencia —un JPG, o un PNG sin recortar—,
 * o si no se puede leer: en los dos casos no hay contorno que trazar, y quien
 * la sube tiene que saber que esa foto no vale para el retrato.
 *
 * Se reduce al lado de análisis y se gira según su EXIF, que es como se ve en
 * el móvil: sin girar, una foto vertical del iPhone salía tumbada.
 */
export async function siluetaDeLaFoto(
  bytes: Uint8Array,
  lado: number = RETRATO_DE_ESTRELLAS.ladoDeAnalisis,
): Promise<Silueta | null> {
  try {
    const imagen = sharp(bytes, { failOn: "none" });
    const { hasAlpha } = await imagen.metadata();
    if (!hasAlpha) return null;

    const { data, info } = await imagen
      .rotate()
      .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
      .extractChannel("alpha")
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      ancho: info.width,
      alto: info.height,
      alfa: new Uint8Array(data.buffer, data.byteOffset, data.length),
    };
  } catch {
    return null;
  }
}

/** De los bytes de una foto recortada, sus estrellas; o `null` si no vale. */
export async function retratoDeLaFoto(bytes: Uint8Array): Promise<RetratoDeEstrellas | null> {
  const silueta = await siluetaDeLaFoto(bytes);
  return silueta ? estrellasDeLaSilueta(silueta) : null;
}
