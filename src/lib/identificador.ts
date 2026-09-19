/**
 * Un identificador de la base, antes de mandárselo a PostgREST.
 *
 * `/panel/invitados/familia-perez` o `?categoria=inexistente` son URLs que
 * alguien va a escribir —o que van a quedar en un marcador cuando se borre
 * algo—, y comparar eso con una columna `uuid` no devuelve «no hay nada»:
 * devuelve un `22P02` de PostgreSQL, que la pantalla enseña como una avería
 * con botón de reintentar y que queda registrado como incidente. Un error de
 * sintaxis de SQL no es lo que hay que enseñarle a nadie, así que lo que no
 * tiene forma de identificador ni llega a salir de aquí: es «no existe», y
 * la página contesta 404.
 *
 * VIVE EN SU PROPIO MÓDULO porque lo necesitan tres capas distintas —las
 * lecturas de proveedores, las de invitados y las acciones de contenido— y
 * la última copia que vivió dentro de un fichero fue justo la que no se
 * aplicó en el siguiente.
 */
const ES_IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdentificador(valor: string): boolean {
  return ES_IDENTIFICADOR.test(valor);
}
