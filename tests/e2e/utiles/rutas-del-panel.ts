import { readdirSync } from "node:fs";
import { join } from "node:path";

import { CLAVES_LISTA, rutaDeLista } from "../../../src/config/contenido-landing";

/**
 * LAS RUTAS DEL PANEL SALEN DEL DISCO, NO DE UNA LISTA
 *
 * Una lista escrita a mano se queda atrás con la primera pantalla nueva: el
 * repaso móvil del panel decía «recorre TODAS» y cubría once de veintiséis, y
 * el guion del día —la pantalla que se usa de pie y con el móvil— no estaba.
 * Lo mismo que ya aprendió el barrido de accesibilidad, en un solo sitio.
 *
 * Las rutas con parámetro se devuelven aparte: `[lista]` se resuelve desde su
 * config; las fichas de invitado y de proveedor necesitan una fila sembrada y
 * cada spec decide qué hace con ellas, pero decidiéndolo.
 */
export const RUTAS_CON_PARAMETRO_CONOCIDAS = [
  "/panel/contenido/[lista]",
  "/panel/invitados/[id]",
  "/panel/proveedores/[id]",
];

export function descubrirRutasDelPanel(): { estaticas: string[]; conParametro: string[] } {
  const raiz = join(__dirname, "..", "..", "..", "src", "app");

  const recorrer = (directorio: string): string[] =>
    readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
      const camino = join(directorio, entrada.name);
      if (entrada.isDirectory()) return recorrer(camino);
      if (entrada.name !== "page.tsx") return [];
      return [camino.slice(raiz.length).replace(/\/page\.tsx$/, "") || "/"];
    });

  const todas = recorrer(join(raiz, "panel")).sort();

  return {
    estaticas: [
      ...todas.filter((ruta) => !ruta.includes("[")),
      ...CLAVES_LISTA.map((clave) => rutaDeLista(clave)),
    ],
    conParametro: todas.filter((ruta) => ruta.includes("[")),
  };
}
