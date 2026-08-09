import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * CLIENTE DE SUPABASE EN EL SERVIDOR
 *
 * POR QUÉ HAY DOS FORMAS DE LEER LA BASE EN ESTE PROYECTO
 *
 * La web pública lee por SQL directo (`src/lib/bbdd/`): son consultas anónimas,
 * conocidas de antemano, y así se ahorra el salto por la API.
 *
 * El panel lee por aquí. La diferencia no es de gusto: cada consulta del panel
 * tiene que ejecutarse **con la identidad de quien ha entrado**, para que RLS
 * decida qué puede ver. Este cliente lleva el JWT de la sesión en cada
 * petición, así que `auth.uid()` funciona dentro de las políticas sin que
 * nosotros pasemos el identificador a mano — que es justo el sitio por donde se
 * cuelan los fallos de autorización.
 *
 * Las cookies se leen y escriben a través de Next, no del navegador: la sesión
 * vive en cookies `httpOnly` y nunca pasa por JavaScript de cliente.
 */

/** `false` si falta configuración: quien llama decide qué enseñar. */
export const hayAutenticacion = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export async function clienteServidor() {
  if (!hayAutenticacion) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Configúralas en Vercel → Settings → Environment Variables.",
    );
  }

  const almacen = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(nuevas) {
          try {
            for (const { name, value, options } of nuevas) {
              almacen.set(name, value, options);
            }
          } catch {
            // Desde un Server Component no se pueden escribir cookies. No es un
            // fallo: el middleware ya refresca la sesión en cada petición, así
            // que aquí se puede ignorar sin perder nada.
          }
        },
      },
    },
  );
}
