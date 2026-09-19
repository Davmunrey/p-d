/**
 * LO QUE DECIDE LA PUERTA, EN UNA FUNCIÓN QUE SE PUEDE PROBAR
 *
 * Vive aquí y no en `acciones.ts` porque aquel fichero es `"use server"` y sólo
 * puede exportar funciones asíncronas: un `export function` ahí compila, pasa
 * el lint y revienta al abrir la pantalla.
 *
 * Y vive SEPARADA porque el fallo que arregla no da error. Comprobar el acceso
 * son dos preguntas —¿se pudo leer el perfil? ¿está activo?— y las dos
 * respuestas negativas dejan el mismo valor a la vista: sin fila. Escritas
 * seguidas, la segunda se traga a la primera sin que nada se queje, y la web
 * contesta «esta cuenta todavía no tiene acceso al panel» cuando lo que ha
 * pasado es que la base no contestó.
 *
 * Probarlo contra un Supabase caído costaría levantar uno y tirarlo; aquí son
 * microsegundos, y lo que hay que sostener es justo esta regla.
 */

/** Los motivos con los que se vuelve a la puerta. Cada uno tiene su copy. */
export type MotivoDeLaPuerta =
  "credenciales" | "sin-configurar" | "sin-acceso" | "error" | "enlace-invalido";

/** Lo que se sabe del perfil después de intentar leerlo. */
export interface LecturaDelPerfil {
  /** La consulta falló: no se sabe nada, ni que sí ni que no. */
  fallo: boolean;
  /** `perfiles.activo`, o `null`/`undefined` si no vino ninguna fila. */
  activo: boolean | null | undefined;
}

/**
 * Qué contestar tras leer el perfil de quien acaba de acertar la contraseña.
 *
 * `null` es «que pase». Los otros dos no son intercambiables:
 *
 *   · `error` — no se pudo comprobar. No se afirma nada sobre sus permisos,
 *     porque no se sabe. Se le dice que lo intente otra vez, que es lo único
 *     cierto y lo único que puede hacer.
 *   · `sin-acceso` — se comprobó y no lo tiene. Eso sí es una afirmación, y
 *     sólo se hace habiendo mirado.
 *
 * La diferencia importa porque manda a la persona a sitios distintos: uno a
 * esperar diez segundos, el otro a dar de alta una cuenta. Con los dos casos
 * bajo el mismo mensaje, un corte de red se leía como una cuenta sin permisos
 * — y en la única pantalla donde quien lo lee no puede comprobar nada.
 */
export function motivoDeLaPuerta(lectura: LecturaDelPerfil): MotivoDeLaPuerta | null {
  if (lectura.fallo) return "error";
  if (!lectura.activo) return "sin-acceso";
  return null;
}
