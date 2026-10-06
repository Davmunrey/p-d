"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { MODULOS_ENTREGADOS, moduloActivo, type ClaveModulo } from "@/config/modulos";
import { t } from "@/lib/copy";

/**
 * NAVEGACIÓN DEL PANEL
 *
 * DOS SITIOS MUY DISTINTOS. En el portátil se planifica: sesiones largas,
 * saltando entre módulos, y el lateral fijo permite hacerlo sin perder de
 * vista dónde está uno. En el móvil se consulta el día de la boda, con una
 * mano y a menudo de pie, así que los destinos bajan al alcance del pulgar en
 * lugar de esconderse tras un menú que hay que abrir.
 *
 * Es la misma lista pintada dos veces con CSS, no dos componentes: un solo
 * sitio donde añadir un módulo, y ningún riesgo de que el móvil se quede atrás.
 *
 * ES CLIENTE SÓLO POR `usePathname`. Los enlaces son enlaces y funcionan sin
 * JavaScript; el subrayado del activo también, porque Next resuelve la ruta al
 * renderizar en el servidor y llega ya puesto en el HTML.
 *
 *
 * SIN PRECARGA, Y NO ES UN AJUSTE FINO: ES DEJAR DE PEDIR DIECIOCHO PÁGINAS
 * ENTERAS POR CADA VISITA.
 *
 * Todas las rutas del panel son `force-dynamic` —leen de la base en cada
 * petición—, así que precargar un enlace del menú **no** es leer un fichero
 * estático: es renderizar esa pantalla entera en el servidor, con sus consultas,
 * para tirarla si no se pulsa. Y esta lista se pinta dos veces, la de escritorio
 * y la del móvil, así que cada enlace se precarga por duplicado: con nueve
 * módulos son dieciocho renderizados de más por cada pantalla que se abre. En
 * Vercel eso son dieciocho invocaciones que se pagan y que no las pide nadie.
 *
 * Se ve en el registro de CI: al abrir `/panel/medios` salen dos tandas enteras
 * de peticiones `_rsc` —una por cada copia del menú, con su propio identificador
 * de compilación— y **todas acaban abortadas**, porque nadie llegó a pulsar.
 *
 * Un panel privado que usan dos personas no gana nada con eso. Lo que sí puede
 * perder es la acción que se está enviando en ese momento: es la sospecha de
 * #126, donde la respuesta de una acción llega bien y el enrutador no la aplica
 * mientras tiene esa tanda de peticiones en vuelo.
 */

/** Sólo se pinta lo terminado: un menú con huecos es peor que un menú corto. */
function etiquetaDe(clave: ClaveModulo): string {
  return t(`panel.modulos.${clave}`);
}

/**
 * `marca` son los nombres de los novios, leídos de la base por el layout: aquí
 * no se escriben, que es un componente de cliente y la base no llega.
 */
export function NavegacionPanel({ marca }: { marca: string }) {
  const ruta = usePathname();
  const activo = moduloActivo(ruta);
  const tira = useRef<HTMLUListElement>(null);

  /*
    EL MÓDULO ACTUAL, A LA VISTA EN LA BARRA DEL MÓVIL. La tira se desplaza en
    horizontal y, al abrir un módulo del final, su enlace quedaba fuera de la
    pantalla: no se veía dónde estaba uno. Se centra moviendo sólo la tira
    —`scrollLeft`, no `scrollIntoView`, que también movería la página—.
  */
  useEffect(() => {
    const contenedor = tira.current;
    const enlace = contenedor?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!contenedor || !enlace) return;
    contenedor.scrollLeft =
      enlace.offsetLeft - (contenedor.clientWidth - enlace.offsetWidth) / 2;
  }, [activo]);

  return (
    <>
      {/* Lateral, en escritorio */}
      <nav
        aria-label={t("panel.navegacion")}
        className="fixed inset-y-0 left-0 capa-lateral hidden w-lateral flex-col gap-elemento overflow-y-auto overscroll-contain border-r border-borde bg-superficie px-interno py-elemento md:flex"
      >
        <Link
          href="/"
          prefetch={false}
          className="px-interno-compacto font-titulo text-titulo-3 leading-titulo-corto text-tinta-marca transicion-color hover:text-tinta"
        >
          {marca}
        </Link>

        <ul className="grid gap-linea">
          {MODULOS_ENTREGADOS.map((modulo) => (
            <li key={modulo.clave}>
              <Enlace
                ruta={modulo.ruta}
                etiqueta={etiquetaDe(modulo.clave)}
                activo={modulo.clave === activo}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Barra inferior, en móvil */}
      <nav
        aria-label={t("panel.navegacion")}
        className="fixed inset-x-0 bottom-0 capa-lateral border-t border-borde bg-superficie barra-inferior md:hidden"
      >
        {/*
          SE DESPLAZA DE VERDAD EN HORIZONTAL. Cada destino mide lo que mide su
          rótulo. Antes se repartían el ancho a partes iguales —`flex-1
          basis-0`— y con trece módulos en 390 px cada casilla tenía 28 px: los
          rótulos, que no se parten, se montaban unos encima de otros y no se
          leía ninguno. El degradado del final dice «hay más» sin escribirlo,
          como en la barra de la portada.
        */}
        <ul
          ref={tira}
          className="desvanecer-final flex h-barra-movil items-stretch gap-linea overflow-x-auto px-interno-compacto"
        >
          {MODULOS_ENTREGADOS.map((modulo) => (
            <li key={modulo.clave} className="flex shrink-0">
              <Enlace
                ruta={modulo.ruta}
                etiqueta={etiquetaDe(modulo.clave)}
                activo={modulo.clave === activo}
                centrado
              />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function Enlace({
  ruta,
  etiqueta,
  activo,
  centrado = false,
}: {
  ruta: string;
  etiqueta: string;
  activo: boolean;
  centrado?: boolean;
}) {
  return (
    <Link
      href={ruta}
      // Ver la cabecera del fichero: precargar una ruta `force-dynamic` es
      // renderizarla entera para tirarla.
      prefetch={false}
      // `aria-current` es lo que hace que un lector de pantalla diga «página
      // actual». El color solo no lo cuenta, y el subrayado tampoco.
      aria-current={activo ? "page" : undefined}
      className={[
        "flex min-h-control-compacto w-full items-center whitespace-nowrap rounded-campo px-interno-compacto text-etiqueta uppercase tracking-etiqueta transicion-color",
        centrado ? "justify-center" : "",
        activo
          ? "bg-marca-tenue text-tinta-marca"
          : "text-tinta-suave hover:bg-superficie-hundida hover:text-tinta",
      ].join(" ")}
    >
      {etiqueta}
    </Link>
  );
}
