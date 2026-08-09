import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_ACCESO } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { t } from "@/lib/copy";

import { cerrarSesion } from "../acceso/acciones";

/**
 * PANEL — provisional
 *
 * Esto es todavía el mínimo para que el acceso tenga a dónde llevar: enseña
 * quién ha entrado y deja salir. La navegación, los módulos y la portada con
 * los números son BODA-42 y BODA-43.
 *
 * Lo que sí es definitivo es la puerta: sin acceso, aquí no se pinta nada.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("meta.titulo"),
  robots: { index: false, follow: false },
};

export default async function PaginaPanel() {
  const acceso = await accesoActual();

  // Ni sesión, ni perfil, ni perfil activo: los tres acaban en la puerta. Sin
  // mensaje que distinga cuál de los tres era.
  if (!acceso) redirect(RUTA_ACCESO);

  return (
    <main className="mx-auto grid min-h-dvh max-w-contenido content-start gap-elemento px-interno py-seccion-compacta">
      <div>
        <Etiqueta>{acceso.rol}</Etiqueta>
        <Titulo2 como="h1" className="mt-pila">
          {acceso.nombre ?? acceso.correo}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("meta.descripcion")}</Cuerpo>
      </div>

      <form action={cerrarSesion}>
        <Boton type="submit" jerarquia="secundario">
          {t("acceso.cerrarSesion")}
        </Boton>
      </form>
    </main>
  );
}
