"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
 */

/** Sólo se pinta lo terminado: un menú con huecos es peor que un menú corto. */
function etiquetaDe(clave: ClaveModulo): string {
  return t(`panel.modulos.${clave}`);
}

export function NavegacionPanel() {
  const ruta = usePathname();
  const activo = moduloActivo(ruta);

  return (
    <>
      {/* Lateral, en escritorio */}
      <nav
        aria-label={t("panel.navegacion")}
        className="fixed inset-y-0 left-0 capa-lateral hidden w-lateral flex-col gap-elemento border-r border-borde bg-superficie px-interno py-elemento md:flex"
      >
        <Link
          href="/"
          className="px-interno-compacto font-titulo text-titulo-3 leading-titulo-corto text-tinta-marca transicion-color hover:text-tinta"
        >
          {t("meta.titulo")}
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
          Se desplaza en horizontal si un día no caben. Es lo único que aguanta
          crecer de dos módulos a nueve sin volverse ilegible ni esconder la
          mitad detrás de un botón más.
        */}
        <ul className="flex h-barra-movil items-stretch overflow-x-auto">
          {MODULOS_ENTREGADOS.map((modulo) => (
            <li key={modulo.clave} className="flex min-w-0 flex-1 basis-0">
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
