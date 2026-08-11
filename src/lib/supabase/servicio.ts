import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * BODA-29 · EL CLIENTE QUE SE SALTA LA RLS, Y POR QUÉ EXISTE
 *
 * Este proyecto tiene una regla que no se negocia: cada consulta del panel se
 * ejecuta con la identidad de quien ha entrado, para que RLS decida qué puede
 * ver. Éste es lo contrario, y hace falta explicar por qué se acepta la
 * excepción en vez de dejarla como una comodidad.
 *
 * NO SE PUEDEN CREAR POLÍTICAS SOBRE `storage.objects`. Esas tablas son de
 * `supabase_storage_admin` y las migraciones corren como `postgres`, que tiene
 * permisos de datos pero no propiedad: `create policy` falla con «must be owner
 * of table». Comprobado contra el proyecto real, y costó un despliegue.
 *
 * Consecuencia: `storage.objects` tiene RLS activada y CERO políticas, o sea
 * que **deniega a todo el mundo**, incluida la sesión de un editor. Sin este
 * cliente no habría forma de subir una foto desde el panel — ni con la sesión
 * más legítima del mundo.
 *
 * QUÉ IMPIDE QUE ESTO SEA UN AGUJERO
 *
 *   · `server-only`. Si alguien lo importa desde un componente de cliente, la
 *     compilación se cae. La clave no puede acabar en el navegador por
 *     descuido, sólo a propósito.
 *   · No lleva `NEXT_PUBLIC_`. Next sólo incrusta en el bundle lo que lleva ese
 *     prefijo; sin él, la variable no sale del servidor ni queriendo.
 *   · SÓLO SE USA PARA STORAGE. Los datos siguen leyéndose y escribiéndose con
 *     el cliente de sesión, donde RLS hace su trabajo. Esto no es un atajo para
 *     saltarse permisos incómodos: es la única llave que abre una puerta que no
 *     tiene cerradura para nadie más.
 *   · Quién puede subir lo decide `puede_editar()` ANTES de llamar aquí, en la
 *     acción de servidor, y eso se prueba de extremo a extremo. La autorización
 *     no desaparece: cambia de sitio, del motor de la base a nuestro código, y
 *     por eso tiene que estar probada donde se ve.
 *
 * Nunca se expone al navegador un camino de escritura a Storage: el fichero
 * viaja al servidor y es el servidor quien lo sube y quien compone la ruta.
 */

/** `false` si falta la clave: quien llama decide qué enseñar. */
export const haySubidaDeMedios = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export function clienteDeServicio() {
  if (!haySubidaDeMedios) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Está en Supabase → Settings → API Keys → " +
        "service_role, y se configura en Vercel → Settings → Environment Variables. " +
        "Sin ella no se puede subir ningún fichero: Storage no admite escrituras " +
        "con la sesión de un usuario.",
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      /*
        SIN SESIÓN Y SIN REFRESCO. Este cliente no representa a nadie: no tiene
        que guardar tokens, ni renovarlos, ni leer cookies. Dejarlo con la
        configuración de un cliente de navegador haría que intentara persistir
        una sesión que no existe, en un servidor donde no hay dónde.
      */
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
