import type { ReactNode } from "react";

import { PestanasModulo } from "@/components/panel/pestanas-modulo";

/**
 * «Por sentar», el plano y «Mesa a mesa»: eran una sola pantalla de treinta y
 * ocho mil píxeles en un móvil.
 */
export default function LayoutMesas({ children }: { children: ReactNode }) {
  return (
    <>
      <PestanasModulo modulo="mesas" />
      {children}
    </>
  );
}
