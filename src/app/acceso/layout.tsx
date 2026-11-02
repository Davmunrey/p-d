import type { ReactNode } from "react";

/**
 * LA PUERTA DEL PANEL VA CON EL PANEL. Entrar, recuperar la contraseña y
 * ponerla nueva son pantallas de los novios, no de los invitados: llevan el
 * tema sobrio del panel y no el neobrutalista de la web pública. `contents`
 * para que el envoltorio no cuente en la composición: sólo marca la zona, y
 * los semánticos del panel bajan por herencia.
 */
export default function LayoutAcceso({ children }: { children: ReactNode }) {
  return (
    <div data-zona="panel" className="contents">
      {children}
    </div>
  );
}
