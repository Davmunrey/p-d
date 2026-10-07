import type { ReactNode } from "react";

import { PestanasModulo } from "@/components/panel/pestanas-modulo";
import { accesoActual } from "@/lib/sesion";

/**
 * Las pestañas de Invitados encima de cada una de sus pantallas. Un lector no
 * importa —la base no le deja—, así que esa pestaña no se le enseña.
 */
export default async function LayoutInvitados({ children }: { children: ReactNode }) {
  const acceso = await accesoActual();
  return (
    <>
      <PestanasModulo
        modulo="invitados"
        ocultas={acceso?.rol === "lector" ? ["importar"] : []}
      />
      {children}
    </>
  );
}
