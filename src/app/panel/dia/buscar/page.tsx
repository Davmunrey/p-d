import Link from "next/link";
import { redirect } from "next/navigation";

import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_DIA } from "@/config/constants";
import { obtenerInvitadosDelDia } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { Buscador } from "./buscador";

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
        <Link href={RUTA_DIA} className="text-pequeno text-tinta-suave underline">
          {t("panel.dia.volver")}
        </Link>
        <Titulo2 como="h1" className="mt-pila">
          {t("panel.dia.buscar.titulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("panel.dia.buscar.entradilla")}</Cuerpo>
      </div>

      <Buscador invitados={invitados} />
    </>
  );
}
