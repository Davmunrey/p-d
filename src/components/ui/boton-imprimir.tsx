"use client";

import type { ReactNode } from "react";

import { Boton } from "@/components/ui/boton";

/**
 * IMPRIMIR CON UN BOTÓN, no con el menú del navegador.
 *
 * En el móvil, imprimir vive escondido dentro de «Compartir», y la pantalla
 * que existe para sacar la hoja en papel sólo tenía un rótulo que decía
 * «Imprimir por mesas» sin nada que pulsar. No se imprime a sí mismo.
 */
export function BotonImprimir({ children }: { children: ReactNode }) {
  return (
    <Boton
      type="button"
      jerarquia="secundario"
      className="print:hidden"
      onClick={() => window.print()}
    >
      {children}
    </Boton>
  );
}
