"use client";

import { useEffect, useRef, type ReactNode } from "react";

import {
  colorLegible,
  espaciadoLegible,
  familiaLegible,
  longitudLegible,
  numeroLegible,
  sombraLegible,
  transicionLegible,
} from "@/lib/valor-css";

/**
 * LOS VALORES RESUELTOS DEL CATÁLOGO
 *
 * Lo único de `/cocina` que necesita el navegador: leer lo que ha resuelto
 * para cada token. No se escribe ni un valor en el código —sería la copia que
 * la regla 1 prohíbe, y la primera en quedarse vieja—; se le pregunta a la
 * página ya pintada, que es la única que no puede equivocarse sobre sí misma.
 *
 * El texto se escribe directamente en el nodo y no con estado: es una lectura
 * que no cambia nada más de la página, y así no hay un segundo render por
 * ficha. Se repite al cambiar el tamaño de la ventana porque el espaciado y
 * los tamaños fluidos son `clamp()`: valen distinto en un móvil.
 */

export type Lectura =
  "color" | "longitud" | "radio" | "sombra" | "duracion" | "curva" | "numero";

/** La propiedad con la que una sonda pinta el token para que el navegador lo resuelva. */
const PROPIEDAD_SONDA = {
  color: "color",
  longitud: "width",
  radio: "borderTopLeftRadius",
  sombra: "boxShadow",
} as const;

function leer(token: string, como: Lectura): string {
  const crudo = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${token}`)
    .trim();

  /*
    Las transiciones y los números se leen del propio token, no de una sonda:
    con «reducir movimiento» la hoja de estilos acorta toda transición de la
    página, y la tabla diría que todo dura lo mismo.
  */
  if (como === "duracion") return transicionLegible(crudo).duracion;
  if (como === "curva") return transicionLegible(crudo).curva;
  if (como === "numero") return numeroLegible(crudo);

  const propiedad = PROPIEDAD_SONDA[como];
  const sonda = document.createElement("span");
  sonda.style.position = "absolute";
  sonda.style.visibility = "hidden";
  sonda.style[propiedad] = `var(--${token})`;
  document.body.appendChild(sonda);
  const resuelto = getComputedStyle(sonda)[propiedad];
  sonda.remove();

  if (como === "color") return colorLegible(resuelto);
  if (como === "sombra") return sombraLegible(resuelto);
  return longitudLegible(resuelto);
}

export function ValorResuelto({
  token,
  como,
  className = "",
}: {
  token: string;
  como: Lectura;
  className?: string;
}) {
  const nodo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const medir = () => {
      if (nodo.current) nodo.current.textContent = leer(token, como);
    };
    medir();
    window.addEventListener("resize", medir, { passive: true });
    return () => window.removeEventListener("resize", medir);
  }, [token, como]);

  return <span ref={nodo} className={className} data-valor-de={token} />;
}

/**
 * El elemento que de verdad pinta la muestra. Un componente puede envolver su
 * texto —el conector es un `span` dentro de un párrafo—, y lo que hay que
 * medir es la letra, no la caja.
 */
function elementoQuePinta(caja: HTMLElement): Element | null {
  const tieneTextoPropio = (nodo: Element) =>
    [...nodo.childNodes].some(
      (hijo) => hijo.nodeType === Node.TEXT_NODE && hijo.textContent?.trim(),
    );

  let nodo = caja.firstElementChild;
  while (nodo && nodo.children.length === 1 && !tieneTextoPropio(nodo)) {
    nodo = nodo.firstElementChild;
  }
  return nodo;
}

/**
 * UNA FILA DE LA ESCALA TIPOGRÁFICA: el token, su ficha —familia · peso ·
 * tamaño— y la muestra pintada con el componente real.
 *
 * La ficha se mide sobre la muestra, no se escribe: así, si un componente se
 * equivoca de familia o de peso, la fila lo dice en vez de taparlo. Que es
 * exactamente lo que pasaba antes de este catálogo: todas las muestras salían
 * en la serif romana y nadie podía saberlo mirando la página.
 */
export function FilaTipografica({
  token,
  familias,
  cursiva,
  children,
}: {
  token: string;
  /** El nombre de cada familia en la entrega y el token que la declara. */
  familias: readonly { token: string; nombre: string }[];
  /** La palabra con la que se dice que la muestra va en cursiva. */
  cursiva: string;
  children: ReactNode;
}) {
  const muestra = useRef<HTMLDivElement>(null);
  const ficha = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const medir = () => {
      const pinta = muestra.current ? elementoQuePinta(muestra.current) : null;
      if (!pinta || !ficha.current) return;

      const raiz = getComputedStyle(document.documentElement);
      const estilo = getComputedStyle(pinta);
      ficha.current.textContent = [
        familiaLegible(
          estilo.fontFamily,
          familias.map((familia) => ({
            nombre: familia.nombre,
            pila: raiz.getPropertyValue(`--${familia.token}`),
          })),
        ),
        estilo.fontWeight,
        estilo.fontStyle === "italic" ? cursiva : null,
        longitudLegible(estilo.fontSize),
        espaciadoLegible(estilo.letterSpacing, estilo.fontSize),
      ]
        .filter(Boolean)
        .join(" · ");
    };
    medir();
    window.addEventListener("resize", medir, { passive: true });
    return () => window.removeEventListener("resize", medir);
  }, [familias, cursiva]);

  return (
    <li
      className="grid gap-interno-compacto border-b border-borde py-elemento sm:grid-cols-[var(--spacing-columna-token)_minmax(0,1fr)] sm:items-baseline sm:gap-elemento"
      data-muestra-de={token}
    >
      <div className="min-w-0">
        <code className="block text-pequeno text-marca">--{token}</code>
        <span ref={ficha} className="mt-linea block text-pequeno text-tinta-suave" />
      </div>
      <div ref={muestra} className="min-w-0 wrap-anywhere">
        {children}
      </div>
    </li>
  );
}
