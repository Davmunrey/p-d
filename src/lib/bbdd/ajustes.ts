import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * La moneda de la boda, para escribir los importes.
 *
 * Vive en `configuracion_boda` y no en una constante: la regla 1 del proyecto
 * es que un valor que puede cambiar sin que cambie la lógica es configuración.
 * Si la lectura falla se devuelve `null` y quien llama decide — pero nadie
 * inventa un «EUR» de respaldo, que sería enseñar importes en una moneda que
 * no es la de la boda y hacerlo además en silencio.
 */
export async function obtenerMonedaBoda(): Promise<string | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("configuracion_boda")
    .select("moneda")
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer la moneda de la boda:", error);
    return null;
  }

  return (data as { moneda: string } | null)?.moneda ?? null;
}
