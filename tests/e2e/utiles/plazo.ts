import postgres from "postgres";

/**
 * ABRIR Y CERRAR EL PLAZO DE CONFIRMACIÓN DESDE UN TEST
 *
 * El plazo vive en `configuracion_boda.fecha_limite_rsvp` y lo aplica un
 * trigger contra `now()`, nunca contra una fecha que mande el cliente. Para
 * probar qué pasa cuando se cierra hay que moverlo de verdad: no hay forma de
 * simularlo desde el navegador, y simularlo sería probar otra cosa.
 *
 * ES ESTADO GLOBAL, así que quien lo toca lo devuelve. `conPlazoCerrado` existe
 * justamente para que devolverlo no dependa de acordarse: si el test falla a
 * media, el `finally` deja la boda con su plazo original y el resto de la suite
 * no se entera.
 */
async function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) throw new Error("Sin DATABASE_URL no se puede mover el plazo.");

  const sql = postgres(cadena, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await trabajo(sql);
  } finally {
    await sql.end();
  }
}

/** La fecha límite que hay ahora mismo, para poder devolverla tal cual. */
export async function plazoActual(): Promise<Date | null> {
  const filas = await conBase(
    (sql) => sql<{ fecha_limite_rsvp: Date | null }[]>`
      select fecha_limite_rsvp from public.configuracion_boda
    `,
  );
  return filas[0]?.fecha_limite_rsvp ?? null;
}

export async function fijarPlazo(fecha: Date | null): Promise<void> {
  await conBase(
    (sql) => sql`
      update public.configuracion_boda set fecha_limite_rsvp = ${fecha}
    `,
  );
}

/**
 * Cierra el plazo, ejecuta el trabajo y lo deja como estaba.
 *
 * El ayer se calcula sobre el reloj de la base y no sobre el del test: si el
 * contenedor va desfasado respecto al servidor, una fecha «de ayer» calculada
 * aquí podría caer en el futuro de allí y el plazo no llegaría a cerrarse — un
 * test que pasa sin haber probado nada.
 */
export async function conPlazoCerrado(trabajo: () => Promise<void>): Promise<void> {
  const original = await plazoActual();

  const [{ ayer }] = await conBase(
    (sql) => sql<{ ayer: Date }[]>`select now() - interval '1 day' as ayer`,
  );

  await fijarPlazo(ayer);
  try {
    await trabajo();
  } finally {
    await fijarPlazo(original);
  }
}
