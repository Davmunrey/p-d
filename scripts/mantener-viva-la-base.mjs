#!/usr/bin/env node
/**
 * BODA-95 · QUE SUPABASE NO PAUSE EL PROYECTO
 *
 * El plan gratuito pausa los proyectos que pasan una semana sin actividad.
 * Entre que se manda la reserva de fecha y que empiezan a llegar las
 * confirmaciones puede haber meses de silencio — y la web se caería justo
 * cuando alguien por fin entra a confirmar. Esto le da un toque a la base cada
 * pocos días para que el contador no llegue nunca a la semana.
 *
 * LA CONSULTA NO ESCRIBE NADA, y es a propósito. Un `insert` de prueba dejaría
 * basura que alguien tendría que limpiar, y un `update` sobre una fila de
 * verdad tocaría `actualizado_en` y ensuciaría cualquier consulta que mire
 * cuándo cambió algo. Se lee una fila y se tira.
 *
 * Y SE LEE UNA TABLA DEL PROYECTO, no `select 1`. Un `select 1` lo contesta
 * PostgreSQL sin tocar nada nuestro: diría que la base responde aunque el
 * esquema estuviera vacío o los permisos rotos. Leer `configuracion_boda` es
 * la comprobación mínima que además significa algo.
 *
 * FALLA RUIDOSAMENTE. Si esto no puede conectarse, lo más probable es que el
 * proyecto YA esté pausado, que es exactamente lo que hay que saber. Salir con
 * cero y un mensajito en el registro convertiría el aviso en nada: el flujo
 * saldría verde y nadie miraría.
 */

import postgres from "postgres";

const cadena = process.env.DATABASE_URL;

if (!cadena) {
  console.error(
    "Falta DATABASE_URL. Sin ella no hay base a la que dar el toque: " +
      "configúrala como secreto del repositorio.",
  );
  process.exit(1);
}

const sql = postgres(cadena, {
  max: 1,
  prepare: false,
  // Corto a propósito: si la base no contesta en diez segundos, no es lentitud,
  // es que no está. Esperar más sólo retrasa el aviso.
  connect_timeout: 10,
  idle_timeout: 5,
  onnotice: () => {},
});

try {
  const filas = await sql`select 1 as vive from public.configuracion_boda limit 1`;

  // Cero filas no es un fallo de conexión: la base respondió. Pero sí es raro
  // —la configuración de la boda no se borra— y merece decirse sin tumbar el
  // flujo, que lo que vigila es que el proyecto siga despierto.
  if (filas.length === 0) {
    console.warn("La base responde, pero `configuracion_boda` está vacía.");
  }

  console.log("La base está despierta.");
} catch (error) {
  console.error(
    "No se ha podido leer de la base. Si el proyecto es del plan gratuito, " +
      "lo más probable es que Supabase lo haya pausado y haya que reactivarlo " +
      "a mano desde su panel.",
  );
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
