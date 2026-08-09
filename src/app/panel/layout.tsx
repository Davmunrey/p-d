import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { NavegacionPanel } from "@/components/panel/navegacion-panel";
import { Boton } from "@/components/ui/boton";
import { ID_CONTENIDO, RUTA_ACCESO } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { t } from "@/lib/copy";

import { cerrarSesion } from "../acceso/acciones";

/**
 * EL MARCO DEL PANEL
 *
 * Aquí se comprueba el acceso una sola vez y valen todas las pantallas de
 * dentro: el layout envuelve a todas, así que ninguna puede olvidarse de
 * mirarlo. El middleware ya ha echado a quien no tiene sesión; lo que se
 * decide aquí es lo otro, si además tiene **perfil activo**.
 *
 * `force-dynamic` porque el panel depende de quién mira. Cachear una página
 * que enseña el nombre de quien ha entrado es servirle a la siguiente persona
 * la sesión de la anterior.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("panel.titulo"),
  robots: { index: false, follow: false },
};

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  const acceso = await accesoActual();

  // Ni sesión, ni perfil, ni perfil activo: los tres acaban en la puerta, y sin
  // un mensaje que distinga cuál de los tres era.
  if (!acceso) redirect(RUTA_ACCESO);

  return (
    <div className="min-h-dvh bg-fondo">
      <a
        href={`#${ID_CONTENIDO}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-interno focus:top-interno focus:z-modal focus:rounded-campo focus:bg-superficie focus:px-interno focus:py-interno-compacto focus:text-pequeno"
      >
        {t("panel.saltarAlContenido")}
      </a>

      <NavegacionPanel />

      {/*
        El hueco lo deja el contenido, no la navegación: está fija, así que no
        empuja nada. Abajo en móvil —donde vive la barra— y a la izquierda en
        escritorio.
      */}
      <div className="hueco-barra-inferior md:pb-0 md:pl-lateral">
        <header className="flex flex-wrap items-center justify-between gap-interno border-b border-borde px-interno py-interno-compacto">
          <p className="text-pequeno text-tinta-suave">
            {t("panel.sesionDe")}{" "}
            <strong className="font-normal text-tinta">{acceso.nombre ?? acceso.correo}</strong>
          </p>

          <form action={cerrarSesion}>
            <Boton type="submit" jerarquia="terciario">
              {t("acceso.cerrarSesion")}
            </Boton>
          </form>
        </header>

        <main id={ID_CONTENIDO} className="px-interno py-elemento">
          {children}
        </main>
      </div>
    </div>
  );
}
