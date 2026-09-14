import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BODA-125 · El tono de voz de la entrega, comprobado
 *
 * El sistema de marca lo escribe así, palabra por palabra:
 *
 *   «Cuidado y cercano, en segunda persona del plural. Frases cortas y
 *    directas, con calidez pero sin chistes ni exclamaciones de más.
 *    Información primero; la elegancia está en no adornar.»
 *
 * Y da sus contraejemplos: «¡¡El día más feliz de nuestras vidas!!» y «No te
 * lo puedes perder 🎉».
 *
 * Hasta este ticket eso no estaba escrito en ninguna parte del repo —ni en la
 * documentación, ni en `CLAUDE.md`, ni en un test—, así que lo único que
 * mantenía el tono era que quien escribiera se acordara. Un tono que depende
 * de la memoria se pierde en la tercera tanda de copys.
 *
 * SE COMPRUEBA LO QUE LA WEB DICE, NO LO QUE CITA. Es la distinción que hace
 * que este test sea útil en vez de molesto, y no es teórica: al escribirlo,
 * las dos únicas coincidencias de todo el fichero eran una cita entre comillas
 * angulares —un título de canción, «Tú me dejaste de querer»— y el propio
 * contraejemplo del catálogo, que existe justo para enseñar lo que no se hace.
 * Un test que los diera por infracciones obligaría a cambiar el título de una
 * canción de C. Tangana y a borrar la sección que explica la regla.
 */

const RAIZ = join(__dirname, "..", "..");

const copia = JSON.parse(readFileSync(join(RAIZ, "content/copy.es.json"), "utf8")) as Record<
  string,
  unknown
>;

/**
 * Los bloques que lee un INVITADO. El panel queda fuera a propósito: ahí la web
 * les habla a los novios, en su propia casa, y tutear a quien se casa no es una
 * falta de tono — es lo natural.
 */
const DE_INVITADO = [
  "alojamiento",
  "correos",
  "cuentaAtras",
  "dresscode",
  "errores",
  "galeria",
  "historia",
  "landing",
  "navegacion",
  "pie",
  "playlist",
  "portada",
  "preguntas",
  "programa",
  "regalos",
  "rsvp",
  "saveTheDate",
  "transporte",
];

/** Cada cadena del fichero, con la ruta de claves que lleva hasta ella. */
function* cadenas(nodo: unknown, camino = ""): Generator<[string, string]> {
  if (typeof nodo === "string") {
    yield [camino, nodo];
  } else if (Array.isArray(nodo)) {
    for (const [i, hijo] of nodo.entries()) yield* cadenas(hijo, `${camino}[${i}]`);
  } else if (nodo && typeof nodo === "object") {
    for (const [clave, hijo] of Object.entries(nodo)) {
      yield* cadenas(hijo, camino ? `${camino}.${clave}` : clave);
    }
  }
}

const DE_INVITADO_SET = new Set(DE_INVITADO);

function copysDeInvitado() {
  return [...cadenas(copia)].filter(([clave]) => DE_INVITADO_SET.has(clave.split(".")[0]));
}

/**
 * Quita lo entrecomillado: comillas angulares, inglesas y rectas. Lo que va
 * dentro es de otro —un título de canción, la frase de alguien— y la web
 * responde de cómo lo presenta, no de cómo está escrito.
 */
function sinCitas(texto: string) {
  return texto
    .replace(/«[^»]*»/g, " ")
    .replace(/“[^”]*”/g, " ")
    .replace(/"[^"]*"/g, " ");
}

describe("el tono de voz de la entrega", () => {
  it("hay copys de invitado que comprobar", () => {
    // Si el barrido dejara de encontrarlos, todo lo de abajo pasaría en vacío.
    expect(copysDeInvitado().length).toBeGreaterThan(50);
  });

  it("ningún copy de invitado lleva exclamaciones de más", () => {
    const infractores = copysDeInvitado()
      .filter(([, texto]) => /¡¡|!!/.test(texto))
      .map(([clave]) => clave);

    expect(
      infractores,
      "«¡¡El día más feliz de nuestras vidas!!» es el contraejemplo literal de la entrega",
    ).toEqual([]);
  });

  it("la web habla de vosotros, no de tú", () => {
    const tuteo = /\b(tú|ti|contigo|tuyo|tuya|tuyos|tuyas|te lo|te la|te los|te las)\b/i;

    const infractores = copysDeInvitado()
      .filter(([, texto]) => tuteo.test(sinCitas(texto)))
      .map(([clave]) => clave);

    expect(
      infractores,
      "la entrega pide segunda persona del PLURAL: «Confirmadnos», no «Confirmame»",
    ).toEqual([]);
  });

  it("ningún copy de invitado lleva emoji", () => {
    // «No te lo puedes perder 🎉» es el otro contraejemplo de la entrega.
    const emoji = /\p{Extended_Pictographic}/u;

    const infractores = copysDeInvitado()
      .filter(([, texto]) => emoji.test(texto))
      .map(([clave]) => clave);

    expect(infractores, "el catálogo lo dice: calidez sí, reclamo no").toEqual([]);
  });

  /**
   * El catálogo queda fuera de las tres reglas de arriba, y no por descuido:
   * su sección de tono de voz EXISTE para enseñar los contraejemplos. Este test
   * comprueba justo lo contrario — que sigan ahí —, porque una regla sin su
   * ejemplo de lo que no se hace se entiende a medias.
   */
  it("el catálogo conserva los contraejemplos de la entrega", () => {
    const cocina = (copia.cocina ?? {}) as Record<string, string>;

    expect(cocina.vozNoUno, "falta el contraejemplo de las exclamaciones").toMatch(/¡¡.*!!/);
    expect(cocina.vozNoTres, "falta el contraejemplo del emoji").toMatch(
      /\p{Extended_Pictographic}/u,
    );
    expect(cocina.vozComoTexto, "falta el párrafo que explica el tono").toContain(
      "segunda persona del plural",
    );
  });
});
