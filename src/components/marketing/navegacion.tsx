"use client";

import { useEffect, useRef, useState } from "react";

import { Monograma } from "@/components/ui/monograma";

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
  inicio,
  enlaces,
  etiqueta,
  nombreNovia,
  nombreNovio,
  empiezaDeNoche = false,
}: {
  /** A dónde lleva el monograma: la portada, o el contenido si no hay portada. */
  inicio: string;
  enlaces: EnlaceSeccion[];
  etiqueta: string;
  nombreNovia: string;
  nombreNovio: string;
  /** Si lo primero de la página es de noche: así no destella clara al cargar. */
  empiezaDeNoche?: boolean;
}) {
  const cabecera = useRef<HTMLElement>(null);
  const tira = useRef<HTMLUListElement>(null);
  const anclaActiva = useAnclaVisible(enlaces, cabecera);
  const sobreLaNoche = useSobreLaNoche(cabecera, empiezaDeNoche);
  const quedaTira = useQuedaPorLaDerecha(tira);

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

  /*
    TRANSPARENTE ARRIBA, VELADA AL BAJAR. `cabecera-compacta` la funde de
    transparente a velada en los primeros 90 px de scroll, sin JavaScript;
    donde el navegador no sepa de `scroll()`, se queda `velada` de siempre.

    Y DE NOCHE CUANDO PASA POR LA NOCHE. Sobre la portada, la cuenta atrás o el
    final, la cabecera se vuelve un bloque inverso —tinta clara y velo marino—
    con los mismos componentes: el monograma oscuro sobre el cielo no se veía.
  */
  return (
    <header
      ref={cabecera}
      data-seccion={sobreLaNoche ? "inversa" : undefined}
      className="velada cabecera-compacta capa-cabecera fixed inset-x-0 top-0 border-b border-borde-tenue"
    >
      <div className="mx-auto flex h-cabecera max-w-contenido items-center gap-interno px-margen-cabecera">
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
          href={inicio}
          /*
            A 23 px con el espaciado abierto (+.04em) y el «&» al 72 % del
            cuerpo, que es como la entrega dibuja el monograma en la barra: no
            es un titular pequeño, es una marca, y tiene sus propios tokens.
          */
          className="flex h-cabecera shrink-0 items-center transicion-color hover:text-tinta"
        >
          {/*
            EL NOMBRE DEL ENLACE LO DA EL MONOGRAMA: los dos nombres en texto
            para lectores de pantalla y las iniciales calladas. Con un
            `aria-label` encima, axe 4.14 exige que lo que se ve («A & L»)
            forme parte de ese nombre (WCAG 2.5.3) y lo marca como grave.
          */}
          <Monograma nombreNovia={nombreNovia} nombreNovio={nombreNovio} />
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

          PERO SOLO CUANDO SIGUE. Puesto siempre, en escritorio —donde la tira
          cabe entera— borraba media «R» de «Cómo llegar» sin que hubiera nada
          detrás, y al llegar al final de la tira en el móvil seguía velando la
          última sección. Un degradado que dice «hay más» cuando no lo hay es
          justo el fallo que venía a evitar.
        */}
        {/*
          CONFIRMAR VA FUERA DE LA TIRA, como en la entrega. Dentro de la tira
          era su último elemento, así que en el móvil quedaba fuera de la
          pantalla —había que deslizar la barra para encontrar lo único que se
          le pide al invitado— y en escritorio se deshacía en el degradado del
          final. Sigue dentro del <nav>: es parte del menú, y el lector de
          pantalla lo encuentra donde siempre, el último.
        */}
        <nav aria-label={etiqueta} className="ml-auto flex min-w-0 items-center gap-tira-nav">
          <div className={quedaTira ? "desvanecer-final min-w-0" : "min-w-0"}>
            <ul
              ref={tira}
              className="flex h-cabecera items-stretch justify-start gap-tira-nav overflow-x-auto"
            >
              {enlaces.map((enlace) => {
                const activo = enlace.ancla === anclaActiva;

                return (
                  <li key={enlace.seccion} className="flex shrink-0 items-stretch">
                    <a
                      href={`#${enlace.ancla}`}
                      data-ancla={enlace.ancla}
                      aria-current={activo ? "location" : undefined}
                      className={[
                        /*
                          EL ENLACE OCUPA EL ALTO DE LA BARRA, no el de su
                          texto. Con `py-linea` el área que se puede tocar eran
                          28 px, muy por debajo de los 44 que hace falta acertar
                          con el pulgar —y esto se va a ver en móvil casi
                          siempre—. Estirarlo no cambia nada de lo que se ve:
                          cambia lo que se puede pulsar, que es lo que estaba
                          mal.
                        */
                        "flex items-center whitespace-nowrap text-menu uppercase tracking-menu transicion-color",
                        activo
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
          </div>
        </nav>
      </div>
    </header>
  );
}

/**
 * Si a la tira le queda contenido por la derecha: desborda y no se ha
 * deslizado hasta el final. Se vuelve a medir al deslizarla y cuando cambia su
 * ancho —girar el móvil, cambiar el tamaño de la ventana—.
 *
 * Antes de hidratar se supone que sí queda, que es lo que pasa en el móvil:
 * ahí es donde importa que el corte no se lea como un fallo desde el primer
 * fotograma. En escritorio el degradado desaparece al hidratar.
 */
function useQuedaPorLaDerecha(tira: React.RefObject<HTMLElement | null>): boolean {
  const [queda, setQueda] = useState(true);

  useEffect(() => {
    const elemento = tira.current;
    if (!elemento) return;

    // Un píxel de holgura: el ancho de desplazamiento se redondea y, con
    // zoom, el final exacto puede quedarse a medio píxel.
    const medir = () =>
      setQueda(elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 1);
    medir();

    elemento.addEventListener("scroll", medir, { passive: true });
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    observador?.observe(elemento);

    return () => {
      elemento.removeEventListener("scroll", medir);
      observador?.disconnect();
    };
  }, [tira]);

  return queda;
}

/**
 * Si la cabecera está sobre un bloque de noche (`[data-seccion="inversa"]`).
 *
 * Se mide la franja de la cabecera contra las secciones inversas al hacer
 * scroll, una vez por fotograma como mucho: son tres o cuatro rectángulos, y
 * un `IntersectionObserver` necesitaría un margen calculado con el alto de la
 * ventana que cambia al girar el móvil.
 */
function useSobreLaNoche(
  cabecera: React.RefObject<HTMLElement | null>,
  empiezaDeNoche: boolean,
): boolean {
  const [sobre, setSobre] = useState(empiezaDeNoche);

  useEffect(() => {
    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const franja = cabecera.current?.getBoundingClientRect();
      if (!franja) return;
      const mitad = franja.top + franja.height / 2;
      const noches = document.querySelectorAll('main [data-seccion="inversa"]');
      setSobre(
        [...noches].some((noche) => {
          const caja = noche.getBoundingClientRect();
          return caja.top <= mitad && caja.bottom >= mitad;
        }),
      );
    };
    const pedir = () => {
      if (!pedido) pedido = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      cancelAnimationFrame(pedido);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, [cabecera]);

  return sobre;
}

/**
 * El `id` de la sección del menú en la que está el invitado, o `null` si la
 * que tiene debajo de la barra no está en el menú. Antes de hidratar no hay
 * sección marcada, que es un estado correcto y no un fallo: los enlaces
 * funcionan igual.
 */
function useAnclaVisible(
  enlaces: EnlaceSeccion[],
  cabecera: React.RefObject<HTMLElement | null>,
): string | null {
  const [activa, setActiva] = useState<string | null>(null);

  // `enlaces` es un array nuevo en cada render: se depende de su contenido, no
  // de su identidad.
  const anclas = enlaces.map((enlace) => enlace.ancla).join(",");

  /*
    LA SECCIÓN QUE PASA POR DEBAJO DE LA BARRA, mirando TODAS las de la página
    y no sólo las del menú. Antes se observaban sólo las del menú, en una franja
    hasta el primer tercio de la pantalla: en vuestra estrella, el margen de
    abajo de «Cómo llegar» aún asomaba por esa franja y el menú decía «Cómo
    llegar» con el invitado ya confirmando. Ahora, si lo que pasa bajo la barra
    no está en el menú —la estrella, los regalos, la playlist—, no se marca
    nada, que es la verdad.

    Se mide al hacer scroll, una vez por fotograma como mucho, como hace la
    cabecera para saber si va sobre la noche: son una docena de rectángulos.
  */
  useEffect(() => {
    const delMenu = new Set(anclas.split(",").filter(Boolean));
    if (delMenu.size === 0) return;

    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const linea = cabecera.current?.getBoundingClientRect().bottom ?? 0;
      const debajo = [...document.querySelectorAll("main section[id]")].find((seccion) => {
        const caja = seccion.getBoundingClientRect();
        return caja.top <= linea && caja.bottom > linea;
      });
      setActiva(debajo && delMenu.has(debajo.id) ? debajo.id : null);
    };
    const pedir = () => {
      if (!pedido) pedido = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    return () => {
      cancelAnimationFrame(pedido);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, [anclas, cabecera]);

  return activa;
}
