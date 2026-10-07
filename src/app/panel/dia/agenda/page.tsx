import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_ACCESO } from "@/config/constants";
import { obtenerAgendaDelDia } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { ListaAgenda } from "./lista";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.dia.agenda.titulo") };

/**
 * BODA-101 (#68) · LOS TELÉFONOS DEL DÍA
 *
 * Cuando el autobús no aparece, lo que hace falta es el número del conductor en
 * dos toques. Esta pantalla existe para que esos dos toques sean «Teléfonos» y
 * el número.
 *
 * LA LISTA VIAJA ENTERA Y DE UNA VEZ. Se lee aquí, en el servidor, y se filtra
 * en el navegador: es lo que hace que siga funcionando cuando la finca se queda
 * sin cobertura, que es el criterio del ticket y no un detalle de rendimiento.
 *
 * LOS TELÉFONOS SON ENLACES `tel:` DE VERDAD, que es el criterio de aceptación
 * literal: en un móvil, pulsar el número llama. Escribirlo como texto obligaría
 * a copiarlo a mano con una sola mano libre.
 */
export const dynamic = "force-dynamic";

export default async function PaginaAgendaDelDia() {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const proveedores = await obtenerAgendaDelDia();

  return (
    <>
      <div className="max-w-texto">
        <Titulo2 como="h1">{t("panel.dia.agenda.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.dia.agenda.entradilla")}</Cuerpo>
      </div>

      {proveedores.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto text-pequeno text-tinta-suave">
          {t("panel.dia.agenda.vacio")}
        </Cuerpo>
      ) : (
        <ListaAgenda proveedores={proveedores} />
      )}
    </>
  );
}
