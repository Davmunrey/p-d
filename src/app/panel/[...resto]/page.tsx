import { notFound } from "next/navigation";

/**
 * Cualquier dirección del panel que no casa con ninguna pantalla. Sin esta
 * ruta, Next la mandaba a la 404 de la raíz —la de los invitados— en vez de a
 * la del panel, que conserva el menú.
 */
export default function RutaDelPanelQueNoExiste(): never {
  notFound();
}
