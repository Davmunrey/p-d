import type { MetadataRoute } from "next";

import { esAncla, rutaDe, type SeccionConRuta } from "@/config/secciones";
import { obtenerSecciones } from "@/lib/bbdd/landing";
import { urlDelSitio } from "@/lib/url-sitio";

/**
 * BODA-92 · EL SITEMAP LLEVA LO PÚBLICO, Y NADA MÁS
 *
 * Dos páginas: la landing y la reserva de fecha. El RSVP no está —cada
 * invitación es una URL distinta con un token dentro, y enumerarlas sería
 * publicarlas— y el panel tampoco.
 *
 * NO ES UNA LISTA ESCRITA A MANO. Las páginas propias salen de
 * `secciones_landing`, que es quien decide si la reserva de fecha existe: si
 * está apagada, su ruta devuelve 404 y un sitemap que la citara mandaría a los
 * buscadores contra una página que no está. Una lista fija se separaría de la
 * base el primer día que alguien apagara una sección.
 */
/**
 * DINÁMICO, y no por capricho: las páginas salen de `secciones_landing`. Si se
 * generara en el build, apagar una sección la dejaría en el sitemap hasta el
 * siguiente despliegue — mandando a los buscadores contra una ruta que ya
 * devuelve 404. Lo cazó el test.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitio = urlDelSitio();

  // Sin dominio no hay URL absoluta que dar, y un sitemap con rutas relativas
  // no vale para nada. Mejor vacío que mal.
  if (!sitio) return [];

  const ahora = new Date();
  const entradas: MetadataRoute.Sitemap = [
    { url: sitio.origin, lastModified: ahora, changeFrequency: "weekly", priority: 1 },
  ];

  let secciones;
  try {
    secciones = await obtenerSecciones();
  } catch {
    // Sin base, al menos la portada. Un sitemap que falla entero deja a la web
    // sin indexar por una caída de un minuto.
    return entradas;
  }

  for (const seccion of secciones) {
    // Las anclas viven dentro de la landing: no son páginas y no van aquí.
    // El descarte es además lo que estrecha el tipo: lo que queda tiene ruta.
    if (esAncla(seccion)) continue;
    entradas.push({
      url: new URL(rutaDe(seccion as SeccionConRuta), sitio).toString(),
      lastModified: ahora,
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  return entradas;
}
