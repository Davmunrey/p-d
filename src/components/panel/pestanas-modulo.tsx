"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { PESTANAS, pestanaActiva, type ModuloConPestanas } from "@/config/modulos";
import { t, type ClaveCopy } from "@/lib/copy";

/**
 * LAS PESTAÑAS DE UN MÓDULO: SUS PANTALLAS HERMANAS, SIEMPRE EN EL MISMO SITIO
 *
 * Gastos, pagos y gráficas colgaban de tres enlaces pequeños bajo la
 * descripción del presupuesto, y cada una tenía su propio «Volver»; el día de
 * la boda, una fila de baldosas y otro «Volver» en cada pantalla; importar
 * invitados y quién no ha contestado, dos botones entre otros. Nada decía
 * cuántas pantallas tenía un módulo ni en cuál se estaba.
 *
 * Aquí se ven todas, arriba de cada una, y la abierta se subraya con la misma
 * marca que la navegación de la web. La lista vive en `config/modulos.ts`.
 *
 * SE DESPLAZA EN HORIZONTAL EN EL MÓVIL, y la abierta se pone a la vista al
 * llegar: «En papel», la última del día de la boda, quedaba fuera de la
 * pantalla y no se sabía que estaba marcada. Se mueve sólo la tira —
 * `scrollLeft`, no `scrollIntoView`, que también movería la página—.
 */
export function PestanasModulo({
  modulo,
  ocultas = [],
}: {
  modulo: ModuloConPestanas;
  /** Las que este perfil no puede usar: a un lector no se le ofrece importar. */
  ocultas?: readonly string[];
}) {
  const ruta = usePathname();
  const pestanas = PESTANAS[modulo].filter((pestana) => !ocultas.includes(pestana.clave));
  const activa = pestanaActiva(ruta, pestanas);
  const tira = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const contenedor = tira.current;
    const enlace = contenedor?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!contenedor || !enlace) return;
    const sobra = enlace.offsetLeft + enlace.offsetWidth - contenedor.clientWidth;
    if (sobra > 0 || enlace.offsetLeft < contenedor.scrollLeft) {
      contenedor.scrollLeft =
        enlace.offsetLeft - (contenedor.clientWidth - enlace.offsetWidth) / 2;
    }
  }, [activa]);

  return (
    <nav
      aria-label={t("panel.pestanas.de", { modulo: t(`panel.modulos.${modulo}`) })}
      className="mb-elemento print:hidden"
    >
      <ul
        ref={tira}
        className="desvanecer-final flex gap-elemento overflow-x-auto border-b border-borde"
      >
        {pestanas.map((pestana) => {
          const abierta = pestana.clave === activa;
          return (
            <li key={pestana.clave} className="flex shrink-0">
              <Link
                href={pestana.ruta}
                // Las pantallas del panel son `force-dynamic`: precargar es
                // renderizarlas enteras para tirarlas (ver `navegacion-panel`).
                prefetch={false}
                aria-current={abierta ? "page" : undefined}
                className={[
                  "marca-activa inline-flex min-h-control-compacto items-center whitespace-nowrap text-pequeno transicion-color",
                  abierta
                    ? "border-borde-marca text-tinta-marca"
                    : "border-transparent text-tinta-suave hover:text-tinta",
                ].join(" ")}
              >
                {t(pestana.rotulo as ClaveCopy)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
