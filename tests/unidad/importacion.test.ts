import { describe, expect, it } from "vitest";

import copy from "../../content/copy.es.json";
import { analizarCsv, decodificar, detectarSeparador } from "../../src/lib/csv";
import { clavePersona, leerImportacion } from "../../src/lib/importacion-invitados";

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

  it("un lado que no existe es un error, no un valor por defecto silencioso", () => {
    // Poner «ambos» y seguir sería decidir por los novios de qué lado va
    // alguien, y eso se nota luego en la mesa presidencial.
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;;primos;`);
    expect(lectura.filas).toEqual([]);
    expect(lectura.errores[0].motivo).toContain("primos");
  });

  it("sin lado se asume «ambos», que es el valor por defecto de la base", () => {
    const lectura = leerImportacion("Grupo;Nombre\nFamilia;Ana");
    expect(lectura.filas[0].lado).toBe("ambos");
  });

  it("caza a quien viene dos veces en el mismo fichero", () => {
    // Una hoja compartida entre dos familias trae repetidos con naturalidad.
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;Pérez;;\nFamilia;ana;pérez;;`);
    expect(lectura.filas).toHaveLength(1);
    expect(lectura.errores).toHaveLength(1);
    expect(lectura.errores[0].linea).toBe(3);
  });

  it("caza a quien ya estaba en la base", () => {
    const yaHay = new Set([clavePersona("Familia", "Ana", "Pérez")]);
    const lectura = leerImportacion(`${CABECERA}\nFamilia;Ana;Pérez;;`, yaHay);
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
