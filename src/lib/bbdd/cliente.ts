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

/** Se lanza cuando no se pudo leer. No confundir con «no hay datos». */
export class ErrorDeLectura extends Error {
  constructor(motivo: string, options?: ErrorOptions) {
    super(motivo, options);
    this.name = "ErrorDeLectura";
  }
}

/**
 * Ejecuta una lectura con los privilegios de un visitante anónimo.
 *
 * LANZA si no se pudo leer, y no devuelve `null`. La diferencia importa más de
 * lo que parece: «la base dice que no hay ninguna fila» es un dato, y «no he
 * podido preguntarle a la base» es una avería. Devolviendo `null` para las dos
 * cosas, quien llama no puede distinguirlas — y acaba cacheando la avería como
 * si fuera un resultado.
 *
 * Eso pasó de verdad: un despliegue sin `DATABASE_URL` horneó la pantalla de
 * «estamos preparando la web» y la sirvió cacheada durante una hora. Con la
 * avería propagándose como excepción, la caché no la guarda y la siguiente
 * visita vuelve a intentarlo.
 *
 * Lo que nunca hace, ni lanzando ni devolviendo, es inventarse datos para
 * rellenar el hueco.
 */
export async function leerComoAnonimo<T>(
  consulta: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  if (!cliente) {
    const motivo =
      "Sin DATABASE_URL: la web se sirve sin datos. Configúrala en Vercel → Settings → Environment Variables.";
    console.error(motivo);
    throw new ErrorDeLectura(motivo);
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
    throw new ErrorDeLectura("No se pudo leer de la base de datos.", { cause: error });
  }
}

/**
 * Lo mismo, pero para una llamada que ESCRIBE.
 *
 * Mismo rol y misma transacción; lo que cambia es qué se hace con el fallo.
 * Aquí el error se propaga tal cual, sin envolverlo en `ErrorDeLectura`,
 * porque quien llama necesita leerle el código a la base: `RSV03` es «el plazo
 * se ha cerrado» y hay que decírselo al invitado con esas palabras, mientras
 * que un fallo de conexión es una avería y se cuenta de otra manera. Envolver
 * los dos en el mismo error los volvería indistinguibles.
 *
 * Escribir como `anon` no es un descuido: es exactamente el rol con el que
 * entraría la petición por PostgREST, así que las políticas RLS y las
 * funciones `security definer` se comportan igual aquí que allí.
 */
export async function llamarComoAnonimo<T>(
  consulta: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  if (!cliente) {
    const motivo =
      "Sin DATABASE_URL: no hay a dónde escribir. Configúrala en Vercel → Settings → Environment Variables.";
    console.error(motivo);
    throw new ErrorDeLectura(motivo);
  }

  return (await cliente.begin(async (tx) => {
    await tx`set local role anon`;
    return consulta(tx);
  })) as T;
}
