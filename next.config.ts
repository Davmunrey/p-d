import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: CABECERAS_SEGURIDAD,
      },
      {
        // El panel privado y la página de sistema de diseño no se indexan.
        source: "/app/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/cocina",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // El enlace de invitación es personal: que no acabe en un buscador.
        source: "/rsvp/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
