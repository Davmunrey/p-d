import postgres from "postgres";

import type { Seccion } from "../../../src/config/secciones";

/**
 * ENCENDER Y APAGAR SECCIONES DESDE UN TEST
 *
 * Varios ficheros necesitan lo mismo: apagar una sección, comprobar que
 * desaparece de la web **y del menú**, y devolverla como estaba. Estaba escrito
 * tres veces, y tres copias de la misma consulta acaban divergiendo justo
 * cuando una de ellas deja de restaurar el estado y contamina al resto de la
 * suite.
 *
 * Se escribe por SQL directo y no por el panel a propósito: lo que se prueba es
 * que la landing obedece a la tabla, no que el panel sepa escribir en ella.
 */
export async function fijarSeccionVisible(seccion: Seccion, visible: boolean): Promise<void> {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) throw new Error("Sin DATABASE_URL no se puede tocar `secciones_landing`.");

  const sql = postgres(cadena, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`
      update public.secciones_landing
         set visible = ${visible}
       where seccion = ${seccion}::public.seccion_landing
    `;
  } finally {
    await sql.end();
  }
}

/**
 * Apaga la sección, ejecuta el trabajo y la vuelve a encender pase lo que pase.
 *
 * El `finally` no es cortesía: sin él, un test que falla deja la sección
 * apagada y los siguientes fallan por un motivo que no tiene nada que ver con
 * lo que están probando.
 */
export async function conSeccionApagada(seccion: Seccion, trabajo: () => Promise<void>) {
  await fijarSeccionVisible(seccion, false);
  try {
    await trabajo();
  } finally {
    await fijarSeccionVisible(seccion, true);
  }
}
