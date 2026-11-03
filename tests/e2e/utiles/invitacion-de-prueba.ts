import postgres from "postgres";
import type { Page } from "@playwright/test";

import { RUTA_INVITACION } from "../../../src/config/constants";

/**
 * ENTRAR COMO INVITADO, PARA LO QUE SÓLO VE UN INVITADO.
 *
 * Hay secciones —la playlist— que sólo salen a quien llega con el enlace de
 * su invitación. Los tests que miden cómo se ven necesitan entrar así: crean
 * un grupo de usar y tirar con un token conocido, con alguien dentro (un
 * grupo vacío todavía no es de nadie y su enlace no se recuerda), y abren el
 * enlace. Es el mismo camino que sigue la familia: el enlace deja la cookie y
 * lleva a la portada.
 *
 * El grupo se borra antes de crearlo, por si quedó de una ejecución anterior:
 * el token es fijo y su huella es única.
 */
const MARCA = "(DES) Invitado de prueba";

function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  });
  return trabajo(sql).finally(() => sql.end());
}

export async function entrarComoInvitado(pagina: Page, sufijo: string): Promise<void> {
  const token = `desarrollo-invitado-${sufijo}-000000`;
  await conBase(async (sql) => {
    await sql`delete from public.grupos_invitacion where huella_token = public.huella_token(${token})`;
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre, lado, maximo_acompanantes, huella_token)
      values (${`${MARCA} ${sufijo}`}, 'ambos', 0, public.huella_token(${token}))
      returning id
    `;
    await sql`
      insert into public.invitados (grupo_id, nombre, apellidos)
      values (${grupo.id}, ${`${MARCA} ${sufijo}`}, '(DES)')
    `;
  });
  await pagina.goto(`${RUTA_INVITACION}/${token}`);
}

/** Borra los grupos que han creado los tests con `entrarComoInvitado`. */
export async function borrarInvitadosDePrueba(): Promise<void> {
  await conBase(
    (sql) => sql`delete from public.grupos_invitacion where nombre like ${`${MARCA}%`}`,
  );
}
