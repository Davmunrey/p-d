import type { ReactNode } from "react";

import { PestanasModulo } from "@/components/panel/pestanas-modulo";

/**
 * Los mensajes y la playlist: llegan por el mismo formulario, y la playlist
 * vivía debajo de los mensajes, donde nadie la buscaba.
 */
export default function LayoutMensajes({ children }: { children: ReactNode }) {
  return (
    <>
      <PestanasModulo modulo="mensajes" />
      {children}
    </>
  );
}
