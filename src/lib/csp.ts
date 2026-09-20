/**
 * LA CONTENT-SECURITY-POLICY, A PARTIR DE LO QUE LA WEB CARGA DE VERDAD
 *
 * Es la única cabecera de seguridad que faltaba, y la única que de verdad
 * frena un script inyectado. Se construye aquí, en una función pura, para
 * poder probarla; el middleware sólo pone el nonce y la cabecera.
 *
 * CON NONCE Y NO CON HASHES: Next mete dieciséis `<script>` en línea con el
 * payload de la página, distinto en cada render porque lleva datos de la base.
 * Un hash por render no existe; un nonce por petición, sí. Next lo lee de la
 * propia cabecera en la petición y lo pone en cada script que emite.
 *
 * EL INVENTARIO, leído del código y contrastado con el HTML de producción:
 *   · scripts   → los de `/_next/static` y los en línea de Next (nonce), y los
 *                 que PostHog carga desde su servidor.
 *   · estilos   → la hoja de `/_next/static` y atributos `style=`: `next/image`
 *                 los escribe con `fill` y con el marcador borroso, y dos
 *                 pantallas del panel posicionan con `style={{}}`.
 *   · imágenes  → `/_next/image`, `data:` (marcadores borrosos) y el bucket
 *                 público de Supabase (póster del vídeo, miniaturas del panel).
 *   · vídeo     → el bucket.
 *   · fuentes   → locales.
 *   · conexión  → PostHog y Sentry, si están configurados. Supabase sólo se
 *                 habla desde el servidor: no hay cliente en el navegador.
 *   · marcos    → el mapa de OpenStreetMap; que nos enmarquen, nadie.
 *
 * `'unsafe-eval'` sólo fuera de producción: el modo de desarrollo de Next lo
 * necesita, y en producción es justo lo que se quiere prohibir.
 */

export interface OrigenesCsp {
  supabase?: string | null;
  posthog?: string | null;
  sentry?: string | null;
  mapa: string;
  desarrollo: boolean;
}

function origenDe(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    return new URL(valor).origin;
  } catch {
    return null;
  }
}

export function construirCsp(nonce: string, origenes: OrigenesCsp): string {
  const supabase = origenDe(origenes.supabase);
  const posthog = origenDe(origenes.posthog);
  const sentry = origenDe(origenes.sentry);
  const mapa = origenDe(origenes.mapa);

  const lista = (...valores: (string | null)[]) => valores.filter(Boolean).join(" ");

  const directivas = [
    `default-src 'self'`,
    // `'strict-dynamic'`: lo que cargue un script con nonce —los trozos que Next
    // pide después— también vale, y los navegadores que lo entienden ignoran
    // la lista de dominios; los antiguos se quedan con ella.
    `script-src ${lista("'self'", `'nonce-${nonce}'`, "'strict-dynamic'", posthog, origenes.desarrollo ? "'unsafe-eval'" : null)}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${lista("'self'", "data:", "blob:", supabase)}`,
    `media-src ${lista("'self'", supabase)}`,
    `font-src 'self'`,
    `connect-src ${lista("'self'", posthog, sentry)}`,
    `frame-src ${lista(mapa)}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ];

  return directivas.join("; ");
}
