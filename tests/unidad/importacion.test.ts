import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import copy from "../../content/copy.es.json";
import {
  analizarCsv,
  analizarCsvConLineas,
  decodificar,
  detectarSeparador,
  noEsTexto,
} from "../../src/lib/csv";
import {
  claveAproximada,
  clavePersona,
  leerImportacion,
  plantillaDeImportacion,
  textosDelFichero,
  type Lado,
} from "../../src/lib/importacion-invitados";

/**
 * BODA-53 · LO QUE UN CSV DE VERDAD LE HACE A UN PARSER
 *
 * Estos casos no son inventados: son lo que sale de Excel, de Numbers y de una
 * hoja compartida entre dos familias. Van en test unitario y no en E2E porque
 * son quince variantes de la misma pantalla, y quince recorridos de navegador
 * para probar quince cadenas de texto es tardar diez minutos en saber algo que
 * se puede saber en diez milisegundos.
 */

describe("Leer el CSV que suelta una hoja de cálculo", () => {
  it("acierta el separador tanto con punto y coma como con coma", () => {
    // Excel en español exporta con `;` porque la coma es el decimal.
    expect(detectarSeparador("Grupo;Nombre;Apellidos")).toBe(";");
    // El mismo Excel en inglés, y cualquier cosa que siga el estándar.
    expect(detectarSeparador("Grupo,Nombre,Apellidos")).toBe(",");
    expect(detectarSeparador("Grupo\tNombre\tApellidos")).toBe("\t");
  });

  it("una coma dentro de comillas es texto, no un separador", () => {
    const filas = analizarCsv('Grupo,Nombre\n"Zubeldía, familia",Ainhoa');
    expect(filas[1]).toEqual(["Zubeldía, familia", "Ainhoa"]);
  });

  it("dos comillas seguidas son una comilla", () => {
    const filas = analizarCsv('Nombre\n"Ana ""la peque"""');
    expect(filas[1]).toEqual(['Ana "la peque"']);
  });

  it("un salto de línea dentro de una celda no parte la fila", () => {
    // Pasa de verdad: un campo escrito en dos renglones en la hoja.
    const filas = analizarCsv('Grupo;Nota\nFamilia;"Primera línea\nSegunda línea"');
    expect(filas).toHaveLength(2);
    expect(filas[1][1]).toBe("Primera línea\nSegunda línea");
  });

  it("las líneas en blanco del final no son personas sin nombre", () => {
    // Una hoja de cálculo casi siempre termina así.
    expect(analizarCsv("Grupo;Nombre\nFamilia;Ana\n\n\n")).toHaveLength(2);
  });

  it("aguanta los finales de línea de Windows", () => {
    expect(analizarCsv("Grupo;Nombre\r\nFamilia;Ana\r\n")).toEqual([
      ["Grupo", "Nombre"],
      ["Familia", "Ana"],
    ]);
  });

  /**
   * EL CASO QUE ROMPE TODAS LAS IMPORTACIONES DE ESPAÑA.
   *
   * Excel en Windows guarda en Windows-1252 salvo que le insistas. Leer esos
   * bytes como UTF-8 convierte «Zubeldía» en «ZubeldÃ­a», y una vez dentro de
   * la base ya no hay forma de saber si el apellido era así.
   */
  it("lee «Zubeldía» venga en UTF-8 o en el Latin-1 de Excel", () => {
    const enUtf8 = new TextEncoder().encode("Zubeldía");
    expect(decodificar(enUtf8.buffer as ArrayBuffer)).toBe("Zubeldía");

    // Los mismos caracteres en Windows-1252: la í es un solo byte, 0xED.
    const enLatin1 = Uint8Array.from([0x5a, 0x75, 0x62, 0x65, 0x6c, 0x64, 0xed, 0x61]);
    expect(decodificar(enLatin1.buffer as ArrayBuffer)).toBe("Zubeldía");
  });

  it("se come el BOM, que si no la primera columna nunca casa", () => {
    const conBom = new TextEncoder().encode("﻿Grupo;Nombre");
    expect(decodificar(conBom.buffer as ArrayBuffer)).toBe("Grupo;Nombre");
  });

  /**
   * EL NÚMERO DE FILA ES EL DE LA HOJA, CON LAS VACÍAS CONTADAS. Antes se
   * contaba sobre lo que quedaba al quitarlas, y una fila en blanco entre dos
   * familias desplazaba todos los errores de debajo.
   */
  it("cuenta las filas en blanco, de en medio y de antes de la cabecera", () => {
    const filas = analizarCsvConLineas("\nGrupo;Nombre\nFamilia A;Ana\n;;\nFamilia B;Bea");
    expect(filas.map((fila) => fila.linea)).toEqual([2, 3, 5]);
    expect(filas[0].celdas).toEqual(["Grupo", "Nombre"]);
  });

  it("una celda con un salto de línea dentro sigue siendo una sola fila de la hoja", () => {
    const filas = analizarCsvConLineas('Grupo;Nota\nFamilia;"Uno\nDos"\nOtra;Tres');
    expect(filas.map((fila) => fila.linea)).toEqual([1, 2, 3]);
  });

  it("con una fila en blanco arriba, el separador sale de la cabecera", () => {
    expect(detectarSeparador("\nGrupo,Nombre,Apellidos")).toBe(",");
  });

  /**
   * UN .XLSX SUBIDO TAL CUAL. Decodificado como texto daba «Faltan las columnas
   * Grupo, Nombre» con cuatrocientos caracteres de basura como columnas
   * ignoradas. Se reconoce antes de decodificar, por su firma.
   */
  it("reconoce una hoja sin exportar, y no confunde un CSV con ella", () => {
    const bytes = (valores: number[]) => Uint8Array.from(valores).buffer as ArrayBuffer;
    // .xlsx, .numbers y .ods son un ZIP; el .xls viejo, un OLE2.
    expect(noEsTexto(bytes([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe(true);
    expect(noEsTexto(bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(true);
    // Cualquier binario con un byte nulo.
    expect(noEsTexto(bytes([0x47, 0x00, 0x72]))).toBe(true);

    const csv = new TextEncoder().encode("Grupo;Nombre\nFamilia;Ana").buffer as ArrayBuffer;
    expect(noEsTexto(csv)).toBe(false);
    // «PK» al principio de un CSV de verdad no es una firma: le faltan dos bytes.
    const pk = new TextEncoder().encode("PK;Nombre\nFamilia;Ana").buffer as ArrayBuffer;
    expect(noEsTexto(pk)).toBe(false);
  });

  it("el «Texto Unicode» de Excel es UTF-16: se lee, y no pasa por binario", () => {
    const texto = "Grupo\tNombre\nFamilia\tAinhoa Zubeldía";
    const utf16 = new Uint8Array(2 + texto.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < texto.length; i += 1) {
      utf16[2 + i * 2] = texto.charCodeAt(i) & 0xff;
      utf16[3 + i * 2] = texto.charCodeAt(i) >> 8;
    }
    expect(noEsTexto(utf16.buffer as ArrayBuffer)).toBe(false);
    expect(decodificar(utf16.buffer as ArrayBuffer)).toBe(texto);
  });
});

describe("Decidir qué se da de alta y qué no", () => {
  const CABECERA = "Grupo;Nombre;Apellidos;Lado;Niño";

  it("un fichero bueno sale entero y con sus tipos puestos", () => {
    const lectura = leerImportacion(
      `${CABECERA}\nFamilia Zubeldía;Ainhoa;Zubeldía;novia;no\nFamilia Zubeldía;Unai;Zubeldía;novia;sí`,
    );

    expect(lectura.errores).toEqual([]);
    expect(lectura.filas).toHaveLength(2);
    expect(lectura.filas[0]).toEqual({
      grupo: "Familia Zubeldía",
      lado: "novia",
      nombre: "Ainhoa",
      apellidos: "Zubeldía",
      nino: false,
    });
    expect(lectura.filas[1].nino).toBe(true);
  });

  it("los rótulos valen con acentos, sin ellos y en mayúsculas", () => {
    const lectura = leerImportacion("GRUPO;nombre;NIÑO\nFamilia;Ana;x");
    expect(lectura.errores).toEqual([]);
    expect(lectura.filas[0].nino).toBe(true);
  });

  it("el orden de las columnas da igual", () => {
    const lectura = leerImportacion("Nombre;Grupo\nAna;Familia");
    expect(lectura.errores).toEqual([]);
    expect(lectura.filas[0]).toMatchObject({ grupo: "Familia", nombre: "Ana" });
  });

  it("sin las columnas obligatorias no se lee nada, y se dice cuál falta", () => {
    const lectura = leerImportacion("Nombre;Apellidos\nAna;Pérez");
    expect(lectura.filas).toEqual([]);
    expect(lectura.errores[0].motivo).toContain(copy.panel.importar.columna.grupo);
  });

  it("una columna que no se entiende se ignora, y se avisa", () => {
    const lectura = leerImportacion("Grupo;Nombre;Talla de camiseta\nFamilia;Ana;M");
    expect(lectura.errores).toEqual([]);
    expect(lectura.columnasIgnoradas).toEqual(["Talla de camiseta"]);
  });

  /**
   * EL CRITERIO DEL TICKET. Una fila mal no importa media lista: el error se
   * señala con su número de fila y la importación entera se queda parada.
   */
  it("señala la fila mala por su número, el de la hoja", () => {
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;;;\n;Unai;;;\nFamilia;Uxue;;;`);

    // La cabecera es la 1, así que la fila sin grupo es la 3.
    expect(lectura.errores).toHaveLength(1);
    expect(lectura.errores[0].linea).toBe(3);
    expect(lectura.errores[0].motivo).toBe(copy.panel.importar.errorSinGrupo);
  });

  it("aunque haya filas en blanco separando familias", () => {
    // El caso del hallazgo: a Familia B le falta el nombre en la fila 4.
    const lectura = leerImportacion(
      "Grupo;Nombre;Lado\nFamilia A;Ana;novia\n;;\nFamilia B;;novio",
    );
    expect(lectura.errores).toEqual([{ linea: 4, motivo: copy.panel.importar.errorSinNombre }]);
  });

  /**
   * «NIÑO» SE VALIDA COMO EL LADO. Antes, cualquier cosa que no fuera un «sí»
   * era un adulto: «Niña» o «7» entraban sin aviso con `es_nino = false`.
   */
  it("en «Niño», sí es sí, no y vacío son no, y lo demás es un error", () => {
    const bien = leerImportacion(
      `${CABECERA}\nF;Ana;;;Sí\nF;Bea;;;${copy.panel.invitados.no}\nF;Ceci;;;\nF;Dani;;;x`,
    );
    expect(bien.errores).toEqual([]);
    expect(bien.filas.map((fila) => fila.nino)).toEqual([true, false, false, true]);

    const mal = leerImportacion(`${CABECERA}\nF;Ana;;;Niña\nF;Bea;;;7`);
    expect(mal.filas).toEqual([]);
    expect(mal.errores.map((error) => error.linea)).toEqual([2, 3]);
    expect(mal.errores[0].motivo).toContain("Niña");
    expect(mal.errores[0].motivo).toContain(copy.panel.importar.columna.nino);
  });

  it("un lado que no existe es un error, no un valor por defecto silencioso", () => {
    // Poner «ambos» y seguir sería decidir por los novios de qué lado va
    // alguien, y eso se nota luego en la mesa presidencial.
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;;primos;`);
    expect(lectura.filas).toEqual([]);
    expect(lectura.errores[0].motivo).toContain("primos");
  });

  it("«constructor» en la columna del lado no cuela por la cadena de prototipos", () => {
    /*
      `"constructor" in LADOS` es cierto para cualquier objeto —lo hereda de
      `Object.prototype`— y `LADOS["constructor"]` es una función. Con `in`, esa
      fila pasaba por válida y guardaba una función como lado; la vista previa
      intentaba pintar `t("panel.invitados.lados.function Object() …")`, `t()`
      lanza si la clave no existe, y la página de importación se caía entera.
      Ahora es un error de fila, como cualquier otro lado inventado.
    */
    for (const colado of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;;${colado};`);
      expect(lectura.filas, colado).toEqual([]);
      expect(lectura.errores[0].motivo, colado).toContain(colado);
    }
  });

  it("una celda más larga de lo que admite la base señala la fila, no tumba el fichero", () => {
    /*
      Sin esto, la vista previa daba por buena una fila con 90 caracteres en
      «nombre», y era la base la que la rechazaba al confirmar: 150 filas fuera
      de golpe con «no se ha podido importar», sin número de línea. Quien
      importa tenía que adivinar cuál era.
    */
    const largo = "a".repeat(81);
    const lectura = leerImportacion(
      `${CABECERA}\nFamilia;Ana;;novia;\nFamilia;${largo};;novia;`,
    );

    expect(lectura.filas.map((fila) => fila.nombre)).toEqual(["Ana"]);
    expect(lectura.errores).toHaveLength(1);
    expect(lectura.errores[0].linea).toBe(3);
    expect(lectura.errores[0].motivo).toContain("80");
    expect(lectura.errores[0].motivo).toContain(copy.panel.importar.columna.nombre);
  });

  it("sin lado se asume «ambos», que es el valor por defecto de la base", () => {
    const lectura = leerImportacion("Grupo;Nombre\nFamilia;Ana");
    expect(lectura.filas[0].lado).toBe("ambos");
  });

  /**
   * EL LADO ES DE LA INVITACIÓN. En la base no hay lado por persona: la vista
   * previa enseñaba el de cada fila y la base se quedaba con el del grupo, sin
   * avisar. Ahora la fila hereda el de su invitación, y si dice otro es error.
   */
  it("en una invitación nueva manda la primera fila que dice un lado", () => {
    const lectura = leerImportacion(
      `${CABECERA}\nFamilia Ruiz;Luis;;;\nFamilia Ruiz;Ana;;novia;\nFamilia Ruiz;Eva;;;`,
    );
    expect(lectura.errores).toEqual([]);
    // Luis va antes que Ana, pero su invitación es la misma: de la novia.
    expect(lectura.filas.map((fila) => fila.lado)).toEqual(["novia", "novia", "novia"]);
  });

  it("dos lados distintos en la misma invitación es un error de la segunda fila", () => {
    const lectura = leerImportacion(
      `${CABECERA}\nFamilia Ruiz;Ana;;La novia;\nfamilia ruíz;Luis;;El novio;`,
    );
    expect(lectura.filas.map((fila) => fila.nombre)).toEqual(["Ana"]);
    expect(lectura.errores).toHaveLength(1);
    expect(lectura.errores[0].linea).toBe(3);
    expect(lectura.errores[0].motivo).toContain(copy.panel.invitados.lados.novia);
    expect(lectura.errores[0].motivo).toContain("El novio");
  });

  it("en una invitación que ya existe manda su lado, y sin lado se hereda", () => {
    const ladosExistentes = new Map<string, Lado>([
      [claveAproximada("Familia Carmona"), "novia"],
    ]);
    const lectura = leerImportacion(
      `${CABECERA}\nFamilia Carmona;Rocío;;;\nFamilia Carmona;Paco;;novio;\nFamilia Nueva;Eva;;;`,
      { ladosExistentes },
    );
    expect(lectura.filas.map((fila) => [fila.nombre, fila.lado])).toEqual([
      ["Rocío", "novia"],
      ["Eva", "ambos"],
    ]);
    expect(lectura.errores.map((error) => error.linea)).toEqual([3]);
    // Y la vista previa sabe cuál de las dos es nueva.
    expect(lectura.nuevas).toEqual([false, true]);
  });

  it("cuenta las invitaciones con la misma clave con que las junta la base", () => {
    const lectura = leerImportacion(
      `${CABECERA}\nFamilia Pérez;Ana;;;\nFamilia Perez;Marta;;;\nFamilia Zubeldía;Unai;;;`,
    );
    expect(lectura.invitaciones).toBe(2);
    expect(lectura.nuevas).toEqual([true, true, true]);
  });

  /**
   * LA CLAVE LA PONE QUIEN LLAMA: en el servidor, la de la base. Aquí una que
   * hace lo que hace `unaccent` con el apóstrofo del móvil, para probar que
   * los duplicados se miran con ella y no con la aproximación.
   */
  it("los duplicados se miran con la clave que se le pasa", () => {
    const comoLaBase = (texto: string) => claveAproximada(texto.replaceAll("’", "'"));
    const yaExisten = new Set([clavePersona("Familia", "Luca", "D'Angelo", comoLaBase)]);
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Luca;D’Angelo;;`, {
      yaExisten,
      clave: comoLaBase,
    });
    expect(lectura.filas).toEqual([]);
    expect(lectura.errores[0].motivo).toContain("D’Angelo");
  });

  it("textosDelFichero da todo lo que la lectura va a necesitar en forma de clave", () => {
    const contenido = `${CABECERA}\n Familia ;Ana; Pérez ;;\nFamilia;Bea;;;`;
    const textos = new Set(textosDelFichero(contenido));
    const pedidos: string[] = [];
    leerImportacion(contenido, {
      clave: (texto) => {
        pedidos.push(texto);
        return claveAproximada(texto);
      },
    });
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.filter((texto) => !textos.has(texto))).toEqual([]);
  });

  it("caza a quien viene dos veces en el mismo fichero", () => {
    // Una hoja compartida entre dos familias trae repetidos con naturalidad.
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;Pérez;;\nFamilia;ana;pérez;;`);
    expect(lectura.filas).toHaveLength(1);
    expect(lectura.errores).toHaveLength(1);
    expect(lectura.errores[0].linea).toBe(3);
  });

  it("caza a quien ya estaba en la base", () => {
    const yaExisten = new Set([clavePersona("Familia", "Ana", "Pérez")]);
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;Pérez;;`, { yaExisten });
    expect(lectura.filas).toEqual([]);
    expect(lectura.errores[0].motivo).toContain("Ana Pérez");
  });

  it("un fichero vacío lo dice en vez de importar cero personas en silencio", () => {
    const lectura = leerImportacion("");
    expect(lectura.errores[0].motivo).toBe(copy.panel.importar.errorVacio);
  });

  it("por encima del tope no se lee: ése no es el fichero de la boda", () => {
    const filas = Array.from({ length: 600 }, (_, i) => `Familia ${i};Persona ${i}`).join("\n");
    const lectura = leerImportacion(`Grupo;Nombre\n${filas}`);
    expect(lectura.filas).toEqual([]);
    expect(lectura.errores[0].motivo).toContain("600");
  });
});

describe("La plantilla que ofrece la propia pantalla", () => {
  const CABECERA = "Grupo;Nombre;Apellidos;Lado;Niño";

  /*
    La fila de muestra decía «La novia» en la columna del lado —el rótulo de la
    pantalla— y el importador sólo aceptaba «novia»: quien descargaba la
    plantilla y la subía sin tocarla veía su única fila rechazada.
  */
  it("se importa tal cual, sin un solo error", () => {
    const lectura = leerImportacion(`\uFEFF${plantillaDeImportacion()}`);
    expect(lectura.errores).toEqual([]);
    expect(lectura.columnasIgnoradas).toEqual([]);
    expect(lectura.filas).toEqual([
      {
        grupo: copy.panel.importar.muestraGrupo,
        nombre: copy.panel.importar.muestraNombre,
        apellidos: copy.panel.importar.muestraApellidos,
        lado: "novia",
        nino: false,
      },
    ]);
  });

  it("el lado vale escrito como lo escribe la pantalla", () => {
    const lectura = leerImportacion(
      `${CABECERA}\nA;Ana;;${copy.panel.invitados.lados.novio};\nB;Bea;;${copy.panel.invitados.lados.ambos.toUpperCase()};`,
    );
    expect(lectura.errores).toEqual([]);
    expect(lectura.filas.map((fila) => fila.lado)).toEqual(["novio", "ambos"]);
  });
});

describe("Un solo criterio de «la misma invitación»", () => {
  /*
    La vista previa comparaba sin acentos y la base con ellos: avisaba de que
    Ana ya estaba en «Familia Perez» y después creaba una segunda invitación
    para Marta. La base usa ahora `sin_acentos` (20261005110000) y la pantalla
    esta clave; las dos tienen que decir lo mismo.
  */
  it("ni las tildes ni las mayúsculas ni los espacios de los bordes separan invitaciones", () => {
    expect(claveAproximada("Familia Pérez")).toBe(claveAproximada("familia perez"));
    expect(claveAproximada("  FAMILIA PÉREZ ")).toBe(claveAproximada("Familia Perez"));
  });

  it("y sí las separa un nombre distinto", () => {
    expect(claveAproximada("Familia Pérez")).not.toBe(claveAproximada("Familia Pérez García"));
  });

  /*
    La comparación de verdad (con «Col·lell», «Øyvind» o el apóstrofo del
    móvil) se prueba contra la base en `panel-importar.spec.ts`. Aquí, que la
    base tiene UNA definición y que la importación la usa en los tres sitios.
  */
  it("la base decide con una sola función, y la importación la usa en las tres comparaciones", () => {
    const migracion = readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "supabase",
        "migrations",
        "20261006110000_claves_de_importacion.sql",
      ),
      "utf8",
    );
    const importar = migracion.slice(migracion.indexOf("function public.importar_invitados"));
    expect(importar.match(/public\.clave_de_importacion\(/g)).toHaveLength(6);
    expect(importar).not.toMatch(/sin_acentos/);
  });
});
