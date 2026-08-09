import "server-only";

import postgres from "postgres";

/**
 * ACCESO A LA BASE DE DATOS
 *
 * Las páginas públicas se renderizan en el servidor y leen por SQL directo, no
 * a través de la API REST. Dos razones:
 *
 *  1. Una consulta menos por salto de red. La landing pinta seis secciones; con
 *     REST serían seis peticiones HTTP encadenadas desde la función serverless.
 *  2. La misma consulta se ejecuta igual en local y en producción, así que los
 *     tests E2E corren contra una base real en CI sin depender de credenciales
 *     de nadie.
 *
 * LA SEGURIDAD NO SE RELAJA POR ELLO
 *
 * Toda lectura pública se ejecuta dentro de una transacción con
 * `set local role anon`. Es exactamente el mismo rol que usaría PostgREST, así
 * que las políticas RLS se aplican igual: si una consulta pide algo que un
 * invitado no debe ver, devuelve cero filas aquí también.
 *
 * Nunca se concatena una variable en el SQL: la librería parametriza todo lo
 * que se interpola en la plantilla etiquetada.
 */

const CADENA_CONEXION = process.env.DATABASE_URL;

if (!CADENA_CONEXION && process.env.NODE_ENV !== "test") {
  // Fallar al arrancar y no en la primera petición: un despliegue sin base de
  // datos debe romper el build, no la web delante de un invitado.
  throw new Error(
    "Falta DATABASE_URL. Configúrala en el entorno (Vercel → Settings → Environment Variables).",
  );
}

declare global {
  var __sqlBoda: postgres.Sql | undefined;
}

/**
 * Una sola instancia por proceso. En desarrollo, Next recarga los módulos en
 * cada cambio: sin este cacheo se abriría una conexión nueva por recarga hasta
 * agotar el pool.
 */
export const sql =
  globalThis.__sqlBoda ??
  postgres(CADENA_CONEXION ?? "", {
    // Las funciones serverless son efímeras y concurrentes: pocas conexiones
    // por instancia, y que sobren antes que agotar el límite del servidor.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__sqlBoda = sql;
}

/**
 * Ejecuta una lectura con los privilegios de un visitante anónimo.
 *
 * Todo lo que renderiza la landing pasa por aquí. Si algún día una consulta
 * devuelve de más, será porque una política RLS está mal — no porque el
 * frontend se haya olvidado de filtrar.
 */
export async function leerComoAnonimo<T>(
  consulta: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`set local role anon`;
    return consulta(tx);
  }) as Promise<T>;
}
