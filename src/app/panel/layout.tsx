import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { NavegacionPanel } from "@/components/panel/navegacion-panel";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { ID_CONTENIDO, RUTA_ACCESO } from "@/config/constants";
import { nombresDeLaBoda } from "@/lib/bbdd/landing";
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

/*
  CADA PANTALLA CON SU TÍTULO, Y «PANEL» DETRÁS. Con «Panel» en todas, el
  anunciador de rutas de Next —que sólo habla cuando cambia el título— se
  quedaba callado al pasar de Invitados a Presupuesto, y con varias pestañas
  abiertas no se distinguía cuál era cuál.
*/
export const metadata: Metadata = {
  title: { template: `%s · ${t("panel.titulo")}`, default: t("panel.titulo") },
  robots: { index: false, follow: false },
};

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  // Los nombres de la cabecera lateral salen de la base, a la vez que se
  // comprueba el acceso: si los novios los corrigen en Ajustes, el panel
  // también lo dice al momento. Son datos públicos, los mismos de la portada.
  const [acceso, nombres] = await Promise.all([accesoActual(), nombresDeLaBoda()]);

  // Ni sesión, ni perfil, ni perfil activo: los tres acaban en la puerta, y sin
  // un mensaje que distinga cuál de los tres era.
  if (!acceso) redirect(RUTA_ACCESO);

  return (
    <div className="min-h-dvh bg-fondo">
      <a
        href={`#${ID_CONTENIDO}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-interno focus:top-interno focus:capa-modal focus:rounded-campo focus:bg-superficie focus:px-interno focus:py-interno-compacto focus:text-pequeno"
      >
        {t("panel.saltarAlContenido")}
      </a>

      <NavegacionPanel marca={nombres ?? t("meta.titulo")} />

      {/*
        El hueco lo deja el contenido, no la navegación: está fija, así que no
        empuja nada. Abajo en móvil —donde vive la barra— y a la izquierda en
        escritorio.

        EN PAPEL NO HAY NI NAVEGACIÓN NI SESIÓN. El lateral es `fixed`, y fijo
        en una hoja impresa se repite en cada página: la lista de mesas que se
        da a la finca salía en dos tercios del ancho, con el menú del panel y
        «Cerrar sesión» en todas las hojas.
      */}
      <div className="hueco-barra-inferior md:pb-0 md:pl-lateral print:pb-0 print:pl-0">
        <header className="flex flex-wrap items-center justify-between gap-interno border-b border-borde px-interno py-interno-compacto print:hidden">
          <p className="text-pequeno text-tinta-suave">
            {t("panel.sesionDe")}{" "}
            <strong className="font-normal text-tinta">{acceso.nombre ?? acceso.correo}</strong>
          </p>

          <form action={cerrarSesion}>
            <BotonEnvio jerarquia="terciario">{t("acceso.cerrarSesion")}</BotonEnvio>
          </form>
        </header>

        <main id={ID_CONTENIDO} className="px-interno py-elemento">
          {children}
        </main>
      </div>
    </div>
  );
}
