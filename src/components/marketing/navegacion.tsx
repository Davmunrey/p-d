"use client";

import { useEffect, useRef, useState } from "react";

import { anclaDe } from "@/config/secciones";
import { t } from "@/lib/copy";

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

/**
 * La primera LETRA de un nombre, para el monograma.
 *
 * Y letra de verdad, no el primer carácter: un nombre entre comillas o con un
 * paréntesis delante daría un monograma de puntuación —«( & (»— que es
 * exactamente lo que salía con los nombres del seed. Es raro en una boda, pero
 * cuesta una expresión regular y evita un logo roto.
 *
 * `\p{L}` con el indicador `u` para que valgan los acentos y la ñ: «Álvaro» da
 * «Á», no la letra siguiente.
 */
function inicial(nombre: string): string {
  return nombre.match(/\p{L}/u)?.[0].toUpperCase() ?? "";
}

export function Navegacion({
  enlaces,
  etiqueta,
  marca,
  nombreNovia,
  nombreNovio,
}: {
  enlaces: EnlaceSeccion[];
  etiqueta: string;
  /** Los dos nombres juntos: es el nombre accesible del enlace al inicio. */
  marca: string;
  nombreNovia: string;
  nombreNovio: string;
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
          EL MONOGRAMA, COMO LA ENTREGA, y no los nombres completos.

          Con nombres largos, «Paloma y David» empujaba la tira de secciones y
          se comía las primeras: en producción se leía «TRÁS» donde ponía
          «CUENTA ATRÁS». La entrega ya lo había resuelto reduciendo la marca a
          dos iniciales, y así cabe hasta en un móvil estrecho — que antes
          obligaba a esconder la marca entera.

          Las iniciales salen de los nombres de la base, no escritas a mano: es
          una boda concreta, y el día que cambien los nombres cambia el logo.
        */}
        <a
          href={`#${anclaDe("portada")}`}
          aria-label={marca}
          className="flex h-cabecera shrink-0 items-center font-titulo text-titulo-3 leading-titulo-corto tracking-titulo text-tinta transicion-color hover:text-tinta-marca"
        >
          {inicial(nombreNovia)}
          {/*
            El nexo del monograma sale del copy como cualquier otro texto
            visible: la entrega usa «&» en el logo y «y» en la portada, y son
            dos decisiones tipográficas distintas que alguien puede querer
            cambiar sin tocar código.
          */}
          <span aria-hidden="true" className="mx-linea text-acento italic">
            {t("navegacion.monogramaConector")}
          </span>
          {inicial(nombreNovio)}
        </a>

        {/*
          SE RECORTA POR EL FINAL, NO POR EL PRINCIPIO.

          Con `justify-end` y desbordamiento horizontal, lo que sobra se corta
          por la IZQUIERDA: las primeras secciones quedaban fuera y no había
          forma de llegar a ellas. Alineando al principio y empujando con margen
          automático, la tira se desplaza hacia donde uno espera y ninguna
          sección queda inalcanzable. Es lo que hacía la entrega.

          Y el corte se desvanece en lugar de tajarse a media palabra: un rótulo
          partido en seco parece un fallo, mientras que un degradado dice «esto
          sigue» sin escribirlo. También de la entrega.
        */}
        <nav aria-label={etiqueta} className="desvanecer-final ml-auto min-w-0">
          <ul
            ref={tira}
            className="flex h-cabecera items-stretch justify-start gap-interno overflow-x-auto"
          >
            {enlaces.map((enlace) => {
              const activo = enlace.ancla === anclaActiva;

              /*
                CONFIRMAR NO ES UNA SECCIÓN MÁS, y la entrega lo dibuja así: un
                botón relleno al final de la tira, no un rótulo igual que los
                demás. Es lo único que se le pide al invitado, y perdido entre
                otras trece entradas del mismo peso deja de pedirse.

                Se reconoce por la sección y no por su posición: el orden lo
                deciden los novios desde el panel, y atarlo al último elemento
                convertiría un cambio de orden en un botón que desaparece.
              */
              const esConfirmar = enlace.seccion === "rsvp";

              return (
                <li key={enlace.seccion} className="flex shrink-0 items-stretch">
                  <a
                    href={`#${enlace.ancla}`}
                    data-ancla={enlace.ancla}
                    aria-current={activo ? "location" : undefined}
                    className={[
                      /*
                        EL ENLACE OCUPA EL ALTO DE LA BARRA, no el de su texto.
                        Con `py-linea` el área que se puede tocar eran 28 px, muy
                        por debajo de los 44 que hace falta acertar con el pulgar
                        —y esto se va a ver en móvil casi siempre—. Estirarlo no
                        cambia nada de lo que se ve: cambia lo que se puede
                        pulsar, que es lo que estaba mal.
                      */
                      "flex items-center whitespace-nowrap text-etiqueta uppercase tracking-etiqueta transicion-color",
                      esConfirmar
                        ? "my-auto rounded-boton bg-accion px-elemento py-interno-compacto text-tinta-sobre-accion hover:bg-accion-hover"
                        : activo
                          ? "marca-activa border-borde-marca text-tinta-marca"
                          : "marca-activa border-transparent text-tinta-suave hover:text-tinta",
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
