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
 *
 * SIN BASE DE DATOS, LA WEB SIGUE DESPLEGANDO
 *
 * Este módulo NO lanza al importarse. Hacerlo tumbaba el build entero —también
 * el 404 y la página de sistema de diseño, que no tocan la base— cuando lo
 * único que faltaba era una variable de entorno. Un despliegue sin
 * `DATABASE_URL` levanta igual y las páginas que necesitan datos muestran que
 * están sin configurar, que es información útil; el fallo se registra en el
 * log del servidor para que no pase inadvertido.
 */

const CADENA_CONEXION = process.env.DATABASE_URL;

/** Si es falso, no hay a dónde conectarse: falta configurar el entorno. */
export const hayBaseDeDatos = Boolean(CADENA_CONEXION);

declare global {
  var __sqlBoda: postgres.Sql | undefined;
}

function crearCliente(): postgres.Sql | null {
  if (!CADENA_CONEXION) return null;

  return postgres(CADENA_CONEXION, {
    // Las funciones serverless son efímeras y concurrentes: pocas conexiones
    // por instancia, y que sobren antes que agotar el límite del servidor.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });
}

/**
 * Una sola instancia por proceso. En desarrollo, Next recarga los módulos en
 * cada cambio: sin este cacheo se abriría una conexión nueva por recarga hasta
 * agotar el pool.
 */
const cliente = globalThis.__sqlBoda ?? crearCliente();

if (process.env.NODE_ENV !== "production" && cliente) {
  globalThis.__sqlBoda = cliente;
}

export const sql = cliente;

/**
 * Ejecuta una lectura con los privilegios de un visitante anónimo.
 *
 * Devuelve `null` si no se pudo leer —sin base de datos configurada, o con la
 * base caída—. Quien llama decide qué enseñar; lo que nunca hace es inventarse
 * datos para rellenar el hueco.
 */
export async function leerComoAnonimo<T>(
  consulta: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T | null> {
  if (!cliente) {
    console.error(
      "Sin DATABASE_URL: la web se sirve sin datos. Configúrala en Vercel → Settings → Environment Variables.",
    );
    return null;
  }

  try {
    return (await cliente.begin(async (tx) => {
      await tx`set local role anon`;
      return consulta(tx);
    })) as T;
  } catch (error) {
    // Se registra entero: un fallo de lectura en la landing es un incidente,
    // aunque la página aguante y muestre su estado de reserva.
    console.error("Fallo al leer de la base de datos:", error);
    return null;
  }
}
