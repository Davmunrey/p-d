"use client";

import { useEffect, useRef, useState } from "react";

import { anclaDe } from "@/config/secciones";

/**
 * NAVEGACIÓN DE LA LANDING
 *
 * Es de cliente por una sola razón: marcar en qué sección está el invitado
 * mientras baja. Todo lo demás —qué enlaces hay, en qué orden y con qué
 * rótulo— llega ya resuelto desde el servidor, así que el fichero de copys no
 * viaja al navegador y el menú funciona igual antes de hidratar: son anclas.
 *
 * EN MÓVIL NO HAY HAMBURGUESA, y es deliberado. Un menú desplegable son dos
 * toques, un panel que atrapa el foco, una trampa de scroll y un montón de
 * ARIA que se rompe en cuanto alguien mueve el diseño. Una tira que se desplaza
 * en horizontal enseña las secciones de golpe, se toca a la primera y no
 * necesita ni estado ni `aria-expanded`.
 */

export interface EnlaceSeccion {
  /** Valor del enumerado. Solo se usa como clave de React. */
  seccion: string;
  /** `id` del elemento al que salta y que se observa para marcarlo. */
  ancla: string;
  rotulo: string;
}

export function Navegacion({
  enlaces,
  etiqueta,
  marca,
}: {
  enlaces: EnlaceSeccion[];
  etiqueta: string;
  marca: string;
}) {
  const cabecera = useRef<HTMLElement>(null);
  const tira = useRef<HTMLUListElement>(null);
  const anclaActiva = useAnclaVisible(enlaces, cabecera);

  // La sección activa se trae a la vista dentro de la tira: si no, en móvil el
  // invitado va por «Playlist» y el menú sigue enseñando «Inicio».
  useEffect(() => {
    if (!anclaActiva || !tira.current) return;

    const elemento = tira.current.querySelector(`[data-ancla="${anclaActiva}"]`);
    if (!(elemento instanceof HTMLElement)) return;

    // `scroll-behavior: auto !important` del CSS no alcanza a un scroll pedido
    // por JavaScript con `behavior: "smooth"`: hay que preguntar aquí también.
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elemento.scrollIntoView({
      behavior: sinMovimiento ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [anclaActiva]);

  return (
    <header
      ref={cabecera}
      className="velada capa-cabecera fixed inset-x-0 top-0 border-b border-borde-tenue"
    >
      <div className="mx-auto flex h-cabecera max-w-amplio items-center gap-interno px-interno">
        {/*
          En móvil la marca no cabe: dos nombres largos dejaban la tira de
          secciones reducida a «INICIO CUE…». Se esconde y la barra entera es
          para navegar, que es a lo que se viene. Los nombres siguen siendo lo
          primero que se lee en la portada, así que no se pierde nada.
        */}
        <a
          href={`#${anclaDe("portada")}`}
          className="hidden shrink-0 font-titulo text-titulo-3 leading-titulo-corto text-tinta transicion-color hover:text-tinta-marca sm:block"
        >
          {marca}
        </a>

        <nav aria-label={etiqueta} className="min-w-0 flex-1">
          <ul
            ref={tira}
            className="flex items-center gap-interno overflow-x-auto sm:justify-end"
          >
            {enlaces.map((enlace) => {
              const activo = enlace.ancla === anclaActiva;
              return (
                <li key={enlace.seccion} className="shrink-0">
                  <a
                    href={`#${enlace.ancla}`}
                    data-ancla={enlace.ancla}
                    aria-current={activo ? "location" : undefined}
                    className={[
                      "marca-activa block whitespace-nowrap py-linea text-etiqueta uppercase tracking-etiqueta transicion-color",
                      activo
                        ? "border-borde-marca text-tinta-marca"
                        : "border-transparent text-tinta-suave hover:text-tinta",
                    ].join(" ")}
                  >
                    {enlace.rotulo}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/**
 * Devuelve el `id` de la sección que ocupa la franja de lectura: la banda que
 * va justo por debajo de la barra hasta el primer tercio de la pantalla. Es lo
 * que una persona percibe como «dónde estoy». Observando la ventana entera
 * habría dos secciones activas a la vez.
 *
 * El alto se MIDE del propio elemento en lugar de leer el token, porque
 * `rootMargin` solo acepta píxeles y porcentajes: ni `calc()` ni `var()`.
 *
 * Sin `IntersectionObserver` —o antes de hidratar— no hay sección marcada, que
 * es un estado correcto y no un fallo: los enlaces funcionan igual.
 */
function useAnclaVisible(
  enlaces: EnlaceSeccion[],
  cabecera: React.RefObject<HTMLElement | null>,
): string | null {
  const [activa, setActiva] = useState<string | null>(null);

  // El orden importa para desempatar, pero `enlaces` es un array nuevo en cada
  // render: se depende de su contenido, no de su identidad.
  const anclas = enlaces.map((enlace) => enlace.ancla).join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const orden = anclas.split(",").filter(Boolean);
    if (orden.length === 0) return;

    const visibles = new Set<string>();
    const altoBarra = cabecera.current?.offsetHeight ?? 0;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) visibles.add(entrada.target.id);
          else visibles.delete(entrada.target.id);
        }
        // La primera del documento entre las visibles: al bajar, la sección
        // nueva no roba el marcado hasta que la anterior sale del todo.
        setActiva(orden.find((ancla) => visibles.has(ancla)) ?? null);
      },
      { rootMargin: `-${altoBarra}px 0px -70% 0px` },
    );

    for (const ancla of orden) {
      const elemento = document.getElementById(ancla);
      if (elemento) observador.observe(elemento);
    }

    return () => observador.disconnect();
  }, [anclas, cabecera]);

  return activa;
}
