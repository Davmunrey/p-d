import type { ReactNode } from "react";

import { BotonEnlace } from "@/components/ui/boton";

/**
 * LA ACCIÓN DE CREAR, ARRIBA, Y LA MISMA EN TODAS LAS PANTALLAS.
 *
 * Cada pantalla del panel lleva su alta al final, debajo de lo que ya hay —que
 * es lo que se viene a mirar—, y con cuarenta filas encima apuntar la
 * siguiente exigía bajar miles de píxeles para encontrar el formulario: el de
 * proveedores quedaba a cuatro mil quinientos. Invitados lo resolvió con un
 * botón bajo el título que salta al alta; esta es esa pieza, para todas.
 *
 * Sólo para quien puede crear: a un lector no se le ofrece un formulario que
 * no va a ver.
 */
export function AccionArriba({
  ancla,
  jerarquia = "primario",
  children,
}: {
  /** El `id` de la sección del alta, sin la almohadilla. */
  ancla: string;
  /** Secundaria donde crear es raro y lo que se viene a hacer es mirar. */
  jerarquia?: "primario" | "secundario";
  children: ReactNode;
}) {
  return (
    <div className="mt-elemento print:hidden">
      <BotonEnlace href={`#${ancla}`} jerarquia={jerarquia}>
        {children}
      </BotonEnlace>
    </div>
  );
}
