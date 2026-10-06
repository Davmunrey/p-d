import type { Metadata } from "next";

import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_PANEL } from "@/config/constants";
import { t } from "@/lib/copy";

/**
 * LO QUE NO EXISTE, DENTRO DEL PANEL
 *
 * Una invitación borrada en otra pestaña, un enlace viejo o una dirección mal
 * escrita sacaban a la 404 de la web de los invitados: sin la navegación del
 * panel y con un botón que llevaba a la portada pública. Para volver había que
 * teclear la dirección. Aquí se queda dentro, con el menú a la vista, y la
 * puerta de vuelta es el resumen.
 */
export const metadata: Metadata = { title: t("panel.noEncontrado.titulo") };

export default function NoEncontradaEnElPanel() {
  return (
    <div className="grid max-w-texto gap-pila">
      <Titulo2 como="h1">{t("panel.noEncontrado.titulo")}</Titulo2>
      <Cuerpo>{t("panel.noEncontrado.texto")}</Cuerpo>
      <EnlaceSuave href={RUTA_PANEL}>{t("panel.noEncontrado.volver")}</EnlaceSuave>
    </div>
  );
}
