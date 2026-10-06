/**
 * CÓMO SE ESCRIBE UN VALOR DE CSS PARA QUE LO LEA UNA PERSONA
 *
 * `/cocina` enseña bajo cada token lo que el navegador ha resuelto de verdad,
 * no lo que alguien copió del CSS: si el valor de la ficha y el de la pantalla
 * no coinciden, es que hay un token mal, y eso es justo lo que el catálogo
 * tiene que dejar ver. Pero el navegador contesta en su idioma —`rgb(18, 23,
 * 34)`, `0.25s`, `22.4px`— y la entrega lo escribe como lo diría quien diseña:
 * `#121722`, `250 ms`, `22 px`.
 *
 * Estas funciones son esa traducción. Son puras para poder probarlas sin
 * navegador, y si no reconocen lo que les llega lo devuelven tal cual: una
 * ficha con el valor en crudo es fea, pero una con un valor inventado miente.
 */

const LOCALE = "es-ES";

const numero = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const porcentaje = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  maximumFractionDigits: 0,
});
const milisegundos = new Intl.NumberFormat(LOCALE, {
  style: "unit",
  unit: "millisecond",
  maximumFractionDigits: 0,
});
const segundos = new Intl.NumberFormat(LOCALE, {
  style: "unit",
  unit: "second",
  maximumFractionDigits: 2,
});

/** Los milisegundos desde los que una duración se lee mejor en segundos. */
const UN_SEGUNDO = 1000;

/**
 * `rgb(18, 23, 34)` → `#121722`. Con transparencia, la opacidad va aparte y en
 * porcentaje —`#14140F · 55 %`—, que es como la entrega habla de los velos.
 */
export function colorLegible(computado: string): string {
  const canales = computado.trim().match(/^rgba?\(([^)]+)\)$/)?.[1];
  if (!canales) return computado;

  const [r, g, b, alfa = 1] = canales
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if ([r, g, b, alfa].some((valor) => !Number.isFinite(valor))) return computado;

  const hex = `#${[r!, g!, b!]
    .map((canal) => Math.round(canal).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;

  return alfa < 1 ? `${hex} · ${porcentaje.format(alfa)}` : hex;
}

/** `22.4px` → `22,4 px`. Lo que no viene en píxeles —un `50%`— se deja como está. */
export function longitudLegible(computado: string): string {
  const px = computado.trim().match(/^(-?[\d.]+)px$/)?.[1];
  return px === undefined ? computado : `${numero.format(Number(px))} px`;
}

/** `0.94` → `0,94`. */
export function numeroLegible(computado: string): string {
  const valor = Number(computado.trim());
  return computado.trim() !== "" && Number.isFinite(valor) ? numero.format(valor) : computado;
}

/** `250ms` → `250 ms`; `1.4s` o `1400ms` → `1,4 s`. */
export function duracionLegible(computado: string): string {
  const partes = computado.trim().match(/^([\d.]+)(m?s)$/);
  if (!partes) return computado;

  const ms = Number(partes[1]) * (partes[2] === "s" ? UN_SEGUNDO : 1);
  return ms >= UN_SEGUNDO ? segundos.format(ms / UN_SEGUNDO) : milisegundos.format(ms);
}

/**
 * Una transición semántica es duración y curva juntas —`250ms cubic-bezier(0.2,
 * 0.7, 0.3, 1)`—, y las tablas del catálogo las enseñan por separado.
 */
export function transicionLegible(computado: string): { duracion: string; curva: string } {
  const [, tiempo = "", curva = ""] = computado.trim().match(/^(\S+)\s*(.*)$/) ?? [];
  return { duracion: duracionLegible(tiempo), curva: curva.trim() };
}

/**
 * `rgba(20, 20, 15, 0.45) 0px 24px 60px -34px` → `0 24px 60px -34px`. El color
 * de la sombra ya está en su ficha de color; aquí lo que se compara es la forma.
 */
export function sombraLegible(computado: string): string {
  if (computado.trim() === "none") return computado;
  return computado
    .split(/,(?![^(]*\))/)
    .map((sombra) =>
      sombra
        .replace(/rgba?\([^)]*\)/g, "")
        .replace(/(^|\s)-?0px/g, (_, antes: string) => `${antes}0`)
        .trim()
        .replace(/\s+/g, " "),
    )
    .join(", ");
}

/**
 * En px, el espaciado entre letras; en la entrega, en em. `3.3px` sobre `11px`
 * → `0,3 em`. Sin espaciado, nada.
 */
export function espaciadoLegible(espaciado: string, tamano: string): string | null {
  const px = Number.parseFloat(espaciado);
  const base = Number.parseFloat(tamano);
  if (!Number.isFinite(px) || !Number.isFinite(base) || px === 0 || base === 0) return null;
  return `${numero.format(px / base)} em`;
}

/**
 * La familia, por su nombre en la entrega. El navegador devuelve la pila
 * entera, y la primera es el alias que `next/font` le pone al fichero
 * (`"serif"`), que no le dice nada a nadie. Así que se compara la pila con la
 * de cada token de familia y se contesta con el nombre que le corresponde.
 */
export function familiaLegible(
  pila: string,
  familias: readonly { pila: string; nombre: string }[],
): string {
  const normal = (valor: string) => valor.replace(/["'\s]/g, "").toLowerCase();
  return (
    familias.find((familia) => normal(familia.pila) === normal(pila))?.nombre ??
    pila.split(",")[0]!.replace(/["']/g, "").trim()
  );
}
