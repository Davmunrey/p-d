import { RUTA_RESERVA_LA_FECHA } from "@/config/constants";

/**
 * EL SAVE THE DATE, EN SU SUBDOMINIO
 *
 * El Save the Date se manda antes que la web, y con su propia dirección
 * (`savethedate.tudominio.com`): quien la abre ve el sobre en la raíz, sin
 * `/reserva-la-fecha` detrás. Es la misma página, servida por el middleware
 * con un `rewrite`: la dirección del navegador no cambia.
 *
 * Sólo la raíz. Lo demás del subdominio —las imágenes, el evento del
 * calendario, la vista previa al compartir— sigue en sus rutas de siempre,
 * que son las que la propia página enlaza.
 *
 * El host viene de una variable de entorno (`HOST_RESERVA_LA_FECHA`): es una
 * dirección, no un dato de la boda. Sin ella, no hay subdominio.
 *
 * Devuelve la ruta que hay que servir, o `null` si la petición no es la raíz
 * del subdominio.
 */
export function rutaEnElSubdominio(
  host: string | null,
  ruta: string,
  hostReserva: string | undefined,
): string | null {
  if (!host || !hostReserva?.trim()) return null;
  if (normalizar(host) !== normalizar(hostReserva)) return null;
  return ruta === "/" ? RUTA_RESERVA_LA_FECHA : null;
}

/** En minúsculas y sin el punto final que admite DNS: `Save.Ejemplo.es.` es `save.ejemplo.es`. */
function normalizar(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}
