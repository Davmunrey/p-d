import type { NextConfig } from "next";

import {
  PESO_MAXIMO_VIDEO_MB,
  RUTA_INVITACION,
  RUTA_PLAYLIST,
  RUTA_RSVP_ANTIGUA,
} from "./src/config/constants";

/**
 * Cabeceras de seguridad.
 *
 * Vivían en `netlify.toml`. Al pasar a Vercel se traen aquí, que además es
 * mejor sitio: viajan con el código, se aplican igual en local y en cualquier
 * plataforma, y no dependen de un fichero específico del proveedor.
 */
const CABECERAS_SEGURIDAD = [
  // Impide que el navegador adivine el tipo de un fichero y lo ejecute como
  // algo que no es.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nadie debe poder meter esta web dentro de un iframe: es la defensa contra
  // el secuestro de clics.
  { key: "X-Frame-Options", value: "DENY" },
  // No filtrar la ruta completa al navegar a otro dominio. Importante aquí: las
  // URL del RSVP llevan el token de invitación dentro.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

/**
 * De dónde se aceptan imágenes remotas.
 *
 * `next/image` rechaza cualquier origen que no esté declarado, y con razón: sin
 * esa lista, quien pudiera escribir una URL en la base convertiría nuestro
 * optimizador en un servicio gratuito para redimensionar imágenes ajenas.
 *
 * El host sale de la variable de entorno, no escrito a mano: es el mismo
 * proyecto de Supabase que ya usa el resto de la aplicación, y así no hay dos
 * sitios que puedan discrepar. Si la variable falta, la lista queda vacía y no
 * se acepta ninguna imagen remota, que es lo seguro.
 */
function origenesDeImagen() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];

  try {
    const { protocol, hostname } = new URL(url);
    return [
      {
        protocol: protocol.replace(":", "") as "http" | "https",
        hostname,
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    console.warn("NEXT_PUBLIC_SUPABASE_URL no es una URL válida: no se servirán fotos.");
    return [];
  }
}

const nextConfig: NextConfig = {
  images: { remotePatterns: origenesDeImagen() },
  /*
    EL TOPE DE LAS ACCIONES DE SERVIDOR, QUE POR DEFECTO ES 1 MB. Las subidas
    del panel —fotos, vídeos, contratos— viajan por una acción de servidor, y
    Next corta el cuerpo ANTES de que corra `subirMedio`: una foto de 3 MB
    acababa en la pantalla de avería sin pasar por ninguna comprobación
    nuestra, mientras la ayuda del formulario prometía diez megas. Se declara
    el mayor de los topes que el módulo promete, y un unitario lo ata a la
    constante. Ojo: Vercel corta los cuerpos de más de 4,5 MB antes de llegar
    aquí; es un límite de plataforma, no de esta configuración. Por eso, con
    JavaScript, las fotos y los vídeos van del navegador a Storage y no por la
    acción (ver `panel/medios/formulario-subida.tsx`); este tope queda para el
    camino sin JavaScript y para los sitios que aún suben por el servidor.
  */
  experimental: { serverActions: { bodySizeLimit: `${PESO_MAXIMO_VIDEO_MB}mb` } },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: CABECERAS_SEGURIDAD,
      },
      {
        // El panel privado y la página de sistema de diseño no se indexan.
        source: "/panel/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/panel",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // La puerta de entrada tampoco tiene nada que hacer en un buscador.
        source: "/acceso/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/acceso",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/cocina",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // El enlace de invitación es personal: que no acabe en un buscador.
        source: `${RUTA_INVITACION}/:path*`,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },

  /*
    LO QUE CAMBIÓ DE SITIO AL QUITAR EL RSVP DE LA WEB.

    · Los primeros enlaces de invitación se repartieron como `/rsvp/<token>`.
      Siguen en los WhatsApp de las familias, así que siguen funcionando: van
      al enlace de ahora, que recuerda la invitación y lleva a la portada.
    · El panel tenía «Mensajes y playlist» en `/panel/mensajes`. Sin formulario
      ya no entran mensajes, y lo que queda es la playlist: un marcador viejo
      llega a ella en lugar de a un 404.
  */
  async redirects() {
    return [
      {
        source: `${RUTA_RSVP_ANTIGUA}/:token`,
        destination: `${RUTA_INVITACION}/:token`,
        permanent: true,
      },
      {
        source: "/panel/mensajes/playlist/:resto*",
        destination: `${RUTA_PLAYLIST}/:resto*`,
        permanent: true,
      },
      { source: "/panel/mensajes", destination: RUTA_PLAYLIST, permanent: true },
    ];
  },
};

export default nextConfig;
