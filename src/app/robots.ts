import type { MetadataRoute } from "next";

import { RUTA_ACCESO, RUTA_PANEL, RUTA_RSVP } from "@/config/constants";
import { urlDelSitio } from "@/lib/url-sitio";

/**
 * BODA-92 · LO PÚBLICO SÍ, LO PRIVADO NO
 *
 * ESTO ES UNA PETICIÓN, NO UNA INSTRUCCIÓN, y por eso no viene solo. Un
 * `robots.txt` es un cartel de «no pasar» que cada rastreador decide si
 * respeta; los que van a por datos personales no lo respetan. Lo que de verdad
 * cierra la puerta es la cabecera `X-Robots-Tag` que pone `next.config.ts`
 * sobre estas mismas rutas, y antes que ella el middleware y RLS.
 *
 * Entonces, ¿para qué sirve? Para los que sí lo respetan, que son los
 * buscadores grandes — precisamente los que harían daño de verdad si indexaran
 * un enlace de invitación. Un token en un resultado de búsqueda es la
 * invitación de una familia a la vista de cualquiera.
 *
 * SE NIEGA POR PREFIJO Y NO POR RUTA EXACTA: `/rsvp/` cubre todos los tokens,
 * que es justo lo que no se puede enumerar.
 */
export default function robots(): MetadataRoute.Robots {
  const sitio = urlDelSitio();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [`${RUTA_PANEL}/`, `${RUTA_RSVP}/`, `${RUTA_ACCESO}/`, "/cocina"],
    },
    // Sin dominio configurado no se apunta a un sitemap inventado: mejor no
    // decir nada que mandar a los rastreadores a una URL que no existe.
    ...(sitio ? { sitemap: new URL("/sitemap.xml", sitio).toString() } : {}),
  };
}
