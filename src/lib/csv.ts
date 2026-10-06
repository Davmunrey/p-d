/**
 * LEER UN CSV QUE VIENE DE EXCEL, Y ESCRIBIR UNO QUE EXCEL ABRA BIEN
 *
 * No se usa una librería porque el problema no es analizar CSV —eso son treinta
 * líneas— sino las dos cosas que hace Excel y que ninguna librería adivina por
 * ti: el separador y la codificación. Las dos están resueltas aquí, y las dos
 * tienen test.
 *
 * Este módulo no sabe nada de invitados: entra texto o bytes y salen filas de
 * cadenas. Quién es «nombre» y quién «apellidos» lo decide
 * `lib/importacion-invitados.ts`. En la otra dirección, `celda()` es la que
 * usan las tres rutas que sirven un CSV: lo que sale se puede volver a meter.
 */

/** Los separadores que se prueban, en orden de probabilidad en España. */
const SEPARADORES = [";", ",", "\t"] as const;

/**
 * Con qué está separado el fichero.
 *
 * NO SE PUEDE FIJAR EN `;` Y YA. Excel en configuración regional española
 * exporta con punto y coma, porque la coma es el separador decimal; el mismo
 * Excel en inglés, y cualquier herramienta que siga el estándar, exporta con
 * coma. Un fichero llega de una familia y otro de la otra.
 *
 * Se elige mirando la primera línea: gana el separador que produce más
 * columnas. Es una heurística, pero es la que acierta con los dos casos reales
 * — y con un fichero de una sola columna da igual cuál se elija.
 */
export function detectarSeparador(texto: string): string {
  // La primera línea con algo escrito: una hoja que empieza con una fila en
  // blanco tiene la cabecera en la segunda, y en la vacía no hay nada que contar.
  const primera = texto.split(/\r?\n/).find((linea) => linea.trim() !== "") ?? "";

  let mejor: string = SEPARADORES[0];
  let columnas = 0;
  for (const separador of SEPARADORES) {
    const cuantas = analizarLinea(primera, separador).length;
    if (cuantas > columnas) {
      columnas = cuantas;
      mejor = separador;
    }
  }
  return mejor;
}

/**
 * De bytes a texto, aguantando lo que suelte Excel.
 *
 * «Zubeldía» se rompe de las dos maneras posibles, así que hay que acertar:
 * leer un fichero Latin-1 como UTF-8 da «ZubeldÃ­a», y al revés da un rombo con
 * una interrogación. Ninguno de los dos se puede arreglar después.
 *
 * Se intenta UTF-8 en modo estricto: si los bytes no son UTF-8 válido, el
 * decodificador LANZA en lugar de meter caracteres de reemplazo, y ese fallo es
 * justo la señal que hace falta para caer a Windows-1252 —que es lo que Excel
 * llama «Latin-1» y es un superconjunto suyo—. Sin `fatal: true` no habría
 * fallo que detectar: saldría el texto roto y tan tranquilos.
 *
 * El BOM se quita si viene: es una marca de codificación, no un carácter del
 * primer rótulo, y sin quitarlo la primera columna nunca casa con su nombre.
 */
export function decodificar(bytes: ArrayBuffer): string {
  const utf16 = codificacionUtf16(bytes);
  if (utf16) return new TextDecoder(utf16).decode(bytes).replace(/^﻿/, "");

  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return texto.replace(/^﻿/, "");
}

/**
 * EL «TEXTO UNICODE» DE EXCEL ES UTF-16, y siempre lleva su BOM delante. Sin
 * reconocerlo, cada letra llega con un byte nulo pegado: no casa ningún rótulo
 * y, peor, parece un binario.
 */
function codificacionUtf16(bytes: ArrayBuffer): "utf-16le" | "utf-16be" | null {
  const [primero, segundo] = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (primero === 0xff && segundo === 0xfe) return "utf-16le";
  if (primero === 0xfe && segundo === 0xff) return "utf-16be";
  return null;
}

/**
 * LAS FIRMAS DE LO QUE NO ES UN CSV AUNQUE SE SUBA COMO TAL.
 *
 * Un .xlsx, un .numbers y un .ods son un ZIP por dentro, y empiezan por
 * `PK\x03\x04`; el .xls de toda la vida es un contenedor OLE2. Decodificados
 * como texto salen cuatrocientos caracteres de basura, y la pantalla decía
 * «Faltan las columnas Grupo, Nombre» y los enseñaba como columnas ignoradas,
 * sin decir que el problema era el formato.
 */
const FIRMAS_BINARIAS = [
  [0x50, 0x4b, 0x03, 0x04],
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
] as const;

/**
 * Si los bytes son de una hoja de cálculo sin exportar —o de cualquier otro
 * binario— en vez de texto. Además de las firmas, un byte nulo: ningún CSV lo
 * lleva, y cualquier binario casi seguro que sí.
 */
export function noEsTexto(bytes: ArrayBuffer): boolean {
  if (codificacionUtf16(bytes)) return false;
  const vista = new Uint8Array(bytes);
  const conFirma = FIRMAS_BINARIAS.some((firma) =>
    firma.every((byte, posicion) => vista[posicion] === byte),
  );
  return conFirma || vista.includes(0);
}

/**
 * Una línea, respetando las comillas.
 *
 * Dentro de comillas, el separador es un carácter más —«Zubeldía, Ainhoa» es
 * UNA celda— y dos comillas seguidas son una comilla literal. Es el mismo
 * formato que escribe la exportación de este panel, así que lo que sale se
 * puede volver a meter.
 */
function analizarLinea(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];

    if (entreComillas) {
      if (caracter === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        actual += caracter;
      }
      continue;
    }

    if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === separador) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += caracter;
    }
  }

  celdas.push(actual);
  return celdas;
}

/** Una fila del fichero y su número en la hoja de cálculo, contando desde 1. */
export interface FilaCsv {
  celdas: string[];
  linea: number;
}

/**
 * El fichero entero en filas de celdas, cada una con su número de fila.
 *
 * Las líneas se parten a mano y no con `split("\n")` sobre todo el texto:
 * una celda entrecomillada puede contener un salto de línea —un campo de
 * alergias escrito en dos renglones— y partir por saltos lo rompería en dos
 * filas inservibles.
 *
 * Las filas completamente vacías se descartan: una hoja de cálculo casi siempre
 * termina con una línea en blanco, y no es una persona sin nombre. PERO SE
 * CUENTAN. Antes el número de fila se calculaba sobre lo que quedaba, y una
 * fila en blanco separando dos familias —algo de lo más normal— desplazaba en
 * uno todos los errores de debajo: «Fila 3 · Falta el nombre» señalaba la fila
 * vacía, y con doscientas filas, a la persona equivocada. El número es el de la
 * fila de la hoja: una celda con un salto de línea dentro sigue siendo una.
 */
export function analizarCsvConLineas(
  texto: string,
  separador = detectarSeparador(texto),
): FilaCsv[] {
  const filas: FilaCsv[] = [];
  let celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  let linea = 0;

  const cerrarFila = () => {
    celdas.push(actual);
    actual = "";
    linea += 1;
    if (celdas.some((celda) => celda.trim() !== "")) filas.push({ celdas, linea });
    celdas = [];
  };

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];

    if (entreComillas) {
      if (caracter === '"') {
        if (texto[i + 1] === '"') {
          actual += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        actual += caracter;
      }
      continue;
    }

    if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === separador) {
      celdas.push(actual);
      actual = "";
    } else if (caracter === "\n") {
      cerrarFila();
    } else if (caracter === "\r") {
      // Se ignora: los finales de Windows son `\r\n` y el `\n` ya cierra.
    } else {
      actual += caracter;
    }
  }

  // La última fila, si el fichero no termina en salto de línea.
  if (actual !== "" || celdas.length > 0) cerrarFila();

  return filas;
}

/** Lo mismo, sin los números de fila. */
export function analizarCsv(texto: string, separador = detectarSeparador(texto)): string[][] {
  return analizarCsvConLineas(texto, separador).map((fila) => fila.celdas);
}

/**
 * UNA CELDA DE CSV, LA MISMA EN TODOS LOS FICHEROS QUE SALEN DEL PANEL
 *
 * Se entrecomilla SIEMPRE, no sólo cuando hay comas. Un campo de alergias
 * lleva comas, saltos de línea y comillas con total naturalidad —«Celíaca, y
 * alérgica a los frutos secos»— y decidir campo a campo es justo donde se
 * cuela el fichero que Excel abre partido por la mitad.
 *
 * Y NO PUEDE EMPEZAR POR LO QUE EXCEL LEE COMO FÓRMULA. Las comillas no lo
 * impiden: al abrir un CSV, Excel las quita y DESPUÉS interpreta el contenido,
 * así que una celda que empiece por `=`, `+`, `-`, `@`, tabulador o retorno de
 * carro se evalúa. Es un texto que escribe un invitado desde una URL pública
 * —las alergias del RSVP— y que abre un tercero: el catering. Con
 * `=HYPERLINK("https://…";"Ver alergias")` la celda no enseña el texto, enseña
 * un enlace a donde quiera quien lo escribió; con `=1+1` enseña `2`. Se
 * antepone un apóstrofo, que es la mitigación que recomienda OWASP: Excel lo
 * toma como marca de texto y el resto se ve tal cual.
 */
const EMPIEZA_COMO_FORMULA = /^[=+\-@\t\r]/;

export function celda(valor: string | number | null | undefined): string {
  const texto = String(valor ?? "");
  const inofensivo = EMPIEZA_COMO_FORMULA.test(texto) ? `'${texto}` : texto;
  return `"${inofensivo.replaceAll('"', '""')}"`;
}
