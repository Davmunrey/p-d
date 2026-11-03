import postgres from "postgres";

/**
 * UN RETRATO DE ESTRELLAS DE PRUEBA
 *
 * El seed no trae retrato: se calcula al subir una foto recortada en el panel,
 * y eso no se siembra. Los tests que lo necesitan se fabrican uno en la base
 * —un círculo de estrellas con algunas principales—, que es lo que el panel
 * guarda: aquí se prueba lo que la landing hace con él. Cómo se calcula desde
 * la foto lo prueban los unitarios de `src/lib/retrato/`.
 *
 * La ruta es fija, así que se borra antes de crearlo por si quedó de una
 * ejecución anterior.
 */
export const RUTA_RETRATO_DE_PRUEBA = "desarrollo/e2e-retrato.png";
export const ALTERNATIVO_RETRATO_DE_PRUEBA = "(DES) Tres figuras de prueba en la nieve";
export const ESTRELLAS_RETRATO_DE_PRUEBA = 60;

/** Un círculo de estrellas; una de cada diez, principal. */
const ESTRELLAS = {
  proporcion: 0.8,
  estrellas: Array.from({ length: ESTRELLAS_RETRATO_DE_PRUEBA }, (_, i) => {
    const angulo = (i / ESTRELLAS_RETRATO_DE_PRUEBA) * 2 * Math.PI - Math.PI / 2;
    return [
      Number((0.5 + 0.5 * Math.cos(angulo)).toFixed(4)),
      Number((0.5 + 0.5 * Math.sin(angulo)).toFixed(4)),
      i % 10 === 0 ? 1 : 0.5,
    ];
  }),
};

function conBase<T>(trabajo: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  });
  return trabajo(sql).finally(() => sql.end());
}

export async function ponerRetratoDePrueba(publicado = true): Promise<void> {
  await conBase(async (sql) => {
    await sql`delete from public.medios where ruta_almacenamiento = ${RUTA_RETRATO_DE_PRUEBA}`;
    await sql`
      insert into public.medios
        (ruta_almacenamiento, texto_alternativo, seccion, tipo, publicado, orden, ancho, alto, estrellas)
      values (
        ${RUTA_RETRATO_DE_PRUEBA}, ${sql.json({ es: ALTERNATIVO_RETRATO_DE_PRUEBA })}, 'retrato',
        'imagen', ${publicado}, 0, 800, 1000, ${sql.json(ESTRELLAS)}
      )
    `;
  });
}

export async function quitarRetratoDePrueba(): Promise<void> {
  await conBase(
    (sql) =>
      sql`delete from public.medios where ruta_almacenamiento = ${RUTA_RETRATO_DE_PRUEBA}`,
  );
}
