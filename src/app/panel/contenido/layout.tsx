import type { ReactNode } from "react";

import { PestanasModulo } from "@/components/panel/pestanas-modulo";

/** Las pestañas del módulo, encima de cada una de sus pantallas. */
export default function LayoutContenido({ children }: { children: ReactNode }) {
  return (
    <>
      <PestanasModulo modulo="contenido" />
      {children}
    </>
  );
}
