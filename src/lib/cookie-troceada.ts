/**
 * UNA COOKIE QUE NO CABE, REPARTIDA EN VARIAS
 *
 * Los navegadores tiran una cookie de más de 4096 bytes sin decir nada: ni
 * error, ni aviso, ni nada en la consola. Sobrevive la anterior, y el
 * formulario que la escribió sigue como si hubiera guardado. Con el borrador
 * del RSVP eso pasaba dentro de lo que la pantalla permite: cuatro personas
 * con menú, alergias y autobús, más un mensaje de dos mil caracteres con
 * tildes, medían 4.445 bytes una vez codificados. Pulsar «Atrás» perdía el
 * mensaje, sin un solo error.
 *
 * Aquí no hay nada del RSVP: entra un objeto y salen trozos con nombre, o
 * entran trozos y sale el objeto. Es puro a propósito, para poder probarlo
 * sin levantar nada.
 *
 * SE CODIFICA EN BASE64URL, no en JSON a pelo, y no es capricho: Next
 * escribe el valor con `encodeURIComponent`, que convierte cada espacio en
 * tres bytes y cada tilde en seis. Trocear el JSON sin codificar dejaría
 * trozos que crecen al escribirse y vuelven a pasarse del tope. Base64url
 * sólo usa letras, números, `-` y `_`: lo que se corta es lo que se escribe.
 */

/** Convierte el objeto en un texto que ninguna cookie va a reescribir. */
export function codificar(objeto: unknown): string {
  return Buffer.from(JSON.stringify(objeto), "utf8").toString("base64url");
}

/**
 * El objeto de vuelta, o `null` si el texto no es de los nuestros.
 *
 * Admite también un JSON sin codificar: es lo que llevaban las cookies
 * escritas antes de trocearlas, y un invitado a medio RSVP en el momento del
 * despliegue no tiene por qué perder su borrador.
 */
export function decodificar(texto: string): unknown {
  try {
    if (texto.startsWith("{")) return JSON.parse(texto);
    return JSON.parse(Buffer.from(texto, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** El texto partido en trozos de como mucho `tamano` caracteres. */
export function trocear(texto: string, tamano: number): string[] {
  const trozos: string[] = [];
  for (let desde = 0; desde < texto.length; desde += tamano) {
    trozos.push(texto.slice(desde, desde + tamano));
  }
  return trozos.length > 0 ? trozos : [""];
}

/** `boda:rsvp`, `boda:rsvp.1`, `boda:rsvp.2`… El primero sin sufijo. */
export function nombreDelTrozo(base: string, indice: number): string {
  return indice === 0 ? base : `${base}.${indice}`;
}

/**
 * Une los trozos leyéndolos en orden hasta el primero que falte. Un hueco
 * corta la lectura: lo que venga después no se sabe de qué borrador es.
 */
export function unirTrozos(leer: (nombre: string) => string | undefined, base: string): string {
  let todo = "";
  for (let indice = 0; ; indice += 1) {
    const trozo = leer(nombreDelTrozo(base, indice));
    if (trozo === undefined) break;
    todo += trozo;
  }
  return todo;
}

/**
 * Los nombres de trozo que sobran a partir de `desde`: los de un borrador
 * anterior más largo. Si no se borran, la próxima lectura los pegaría al
 * final del nuevo y no se entendería nada.
 */
export function trozosSobrantes(
  nombres: readonly string[],
  base: string,
  desde: number,
): string[] {
  return nombres.filter((nombre) => {
    if (nombre === base) return desde === 0;
    if (!nombre.startsWith(`${base}.`)) return false;
    const indice = Number(nombre.slice(base.length + 1));
    return Number.isInteger(indice) && indice >= Math.max(desde, 1);
  });
}
