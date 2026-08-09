/**
 * LA DIRECCIÓN DE LA WEB, LEÍDA CON INDULGENCIA
 *
 * `metadataBase` convierte la ruta de la imagen de Open Graph en una URL
 * absoluta. Sin ella, WhatsApp recibe una ruta relativa, no sabe resolverla y
 * enseña el enlace pelado.
 *
 * UNA VARIABLE MAL ESCRITA NO PUEDE TUMBAR EL BUILD, y lo hacía. Poner
 * `midominio.com` en lugar de `https://midominio.com` es el descuido más fácil
 * del mundo —el navegador perdona esa forma, `new URL()` no— y el resultado era
 * un despliegue entero en rojo con un «invalid_url» que ni siquiera dice qué
 * variable era. Pasó en producción.
 *
 * Es la misma decisión que en `src/lib/bbdd/cliente.ts`: por una variable de
 * entorno se degrada lo que dependa de ella, nunca se tira la web abajo.
 */

/** `true` si la cadena ya trae `https://`, `http://` o cualquier otro esquema. */
const TIENE_ESQUEMA = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Convierte en `URL` lo que haya escrito alguien, o devuelve `null` si no hay
 * manera. Completa el esquema si falta: quien escribe sólo el dominio quiere
 * decir `https`.
 */
export function leerUrl(valor: string | undefined | null): URL | null {
  const limpio = valor?.trim();
  if (!limpio) return null;

  const conEsquema = TIENE_ESQUEMA.test(limpio) ? limpio : `https://${limpio}`;

  try {
    return new URL(conEsquema);
  } catch {
    return null;
  }
}

/**
 * El dominio del sitio. Manda `NEXT_PUBLIC_SITE_URL`; si no está o no hay quien
 * la lea, se usa la que pone Vercel en cada despliegue —que incluye los
 * previews, así que la vista previa se puede comprobar antes de mergear.
 */
export function urlDelSitio(): URL | undefined {
  const propia = process.env.NEXT_PUBLIC_SITE_URL;
  const leida = leerUrl(propia);

  if (propia && !leida) {
    console.error(
      `NEXT_PUBLIC_SITE_URL no es una dirección válida: ${JSON.stringify(propia)}. ` +
        "Se usa la de Vercel. Debe ser del estilo https://midominio.com",
    );
  }

  if (leida) return leida;

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return leerUrl(vercel) ?? undefined;
}
