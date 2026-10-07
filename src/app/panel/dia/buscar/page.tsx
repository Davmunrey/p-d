import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_ACCESO } from "@/config/constants";
import { obtenerInvitadosDelDia } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { Buscador } from "./buscador";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.dia.buscar.titulo") };

/**
 * BODA-102 (#69) · EL BUSCADOR DE INVITADOS
 *
 * La lista entera se lee aquí y se manda al navegador de una vez. Con ciento
 * veinte invitados son unos pocos kilobytes, y a cambio buscar sigue
 * funcionando cuando el móvil se queda sin datos — que es exactamente cuando
 * alguien pregunta dónde se sienta.
 */
export const dynamic = "force-dynamic";

export default async function PaginaBuscarDelDia() {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const invitados = await obtenerInvitadosDelDia();

  return (
    <>
      <div className="max-w-texto">
        <Titulo2 como="h1">{t("panel.dia.buscar.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.dia.buscar.entradilla")}</Cuerpo>
      </div>

      <Buscador invitados={invitados} />
    </>
  );
}
