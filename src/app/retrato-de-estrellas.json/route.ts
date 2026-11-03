import { SEGUNDOS_CACHE_RETRATO } from "@/config/constants";
import { obtenerRetrato } from "@/lib/bbdd/landing";

/**
 * LAS ESTRELLAS DEL RETRATO, PARA LA PANTALLA DE ERROR
 *
 * La pantalla de error de la parte pública se pinta en el navegador —Next la
 * hace componente de cliente— y no puede preguntar a la base, así que pide
 * aquí el retrato para dibujarlo sobre el titular, como la 404. Son los mismos
 * números que la landing ya lleva en su HTML: la proporción y las estrellas.
 *
 * SIN EL TEXTO ALTERNATIVO. Nombra a quien sale en la foto, y en una pantalla
 * de error el retrato es adorno: no se anuncia, así que no hace falta mandarlo.
 *
 * Sin retrato publicado, 404; con la base caída, 503. Ninguna de las dos se
 * guarda: la pantalla se queda sin dibujo, que es lo que tiene que pasar, y la
 * siguiente vez se vuelve a preguntar.
 */
export const dynamic = "force-dynamic";

const SIN_GUARDAR = { "Cache-Control": "no-store" };

export async function GET() {
  let retrato;
  try {
    retrato = await obtenerRetrato();
  } catch {
    return new Response(null, { status: 503, headers: SIN_GUARDAR });
  }
  if (!retrato) return new Response(null, { status: 404, headers: SIN_GUARDAR });

  return Response.json(
    { proporcion: retrato.proporcion, estrellas: retrato.estrellas },
    { headers: { "Cache-Control": `public, max-age=${SEGUNDOS_CACHE_RETRATO}` } },
  );
}
