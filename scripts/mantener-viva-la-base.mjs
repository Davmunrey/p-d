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

/**
 * LA CADENA, O LO QUE HAGA FALTA PARA ARMARLA.
 *
 * `DATABASE_URL` es lo preferente, pero puede no estar — y no está por
 * casualidad: en este repositorio faltaba, y este mismo guion llevaba desde el
 * 1 de septiembre fallando en todas sus ejecuciones programadas por eso. El
 * toque no se daba, y Supabase acabó suspendiendo el proyecto por inactividad.
 *
 * El fallo era ruidoso, como se pretendía. Lo que no había era nadie mirando un
 * trabajo programado en rojo. Así que ahora, antes de rendirse, se arma la
 * cadena con los dos secretos que el flujo de migraciones ya necesita de todas
 * formas: el identificador del proyecto y la contraseña.
 *
 * `db.<ref>.supabase.co` es la conexión directa, la que no pasa por el
 * agrupador y por tanto no necesita saber la región — el dato que no se puede
 * deducir del identificador. En proyectos recientes resuelve sólo por IPv6 y un
 * runner de GitHub no llega; por eso es un intento, y si falla se dice qué
 * poner y dónde.
 */
function cadenaDeConexion() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const proyecto = process.env.SUPABASE_PROJECT_REF;
  const clave = process.env.SUPABASE_DB_PASSWORD;
  if (!proyecto || !clave) return null;

  // La contraseña puede llevar `@`, `:`, `/`, `#` o `?`, y cualquiera de ellos
  // sin escapar parte la URL por la mitad.
  return `postgresql://postgres:${encodeURIComponent(clave)}@db.${proyecto}.supabase.co:5432/postgres`;
}

const cadena = cadenaDeConexion();

if (!cadena) {
  console.error(
    "Falta DATABASE_URL, y tampoco están SUPABASE_PROJECT_REF y " +
      "SUPABASE_DB_PASSWORD para armarla. Sin cadena no hay base a la que dar " +
      "el toque: configúrala como secreto del repositorio.",
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
