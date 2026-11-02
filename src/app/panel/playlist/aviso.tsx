import { avisoDe } from "@/lib/avisos";
import { t, type ClaveCopy } from "@/lib/copy";

export const AVISOS_PLAYLIST: Readonly<Record<string, { clave: ClaveCopy; error: boolean }>> = {
  "cancion-ocultada": { clave: "panel.playlist.cancionOcultada", error: false },
  "cancion-mostrada": { clave: "panel.playlist.cancionMostrada", error: false },
  "no-existe": { clave: "panel.playlist.errorNoExiste", error: true },
  "sin-permiso": { clave: "panel.playlist.errorSinPermiso", error: true },
  error: { clave: "panel.playlist.errorGuardar", error: true },
};

/**
 * `role="alert"` sólo para lo que ha ido mal: un «canción retirada» anunciado
 * a gritos interrumpe lo que estuviera leyendo un lector de pantalla; un fallo
 * sí merece interrumpir.
 */
export function AvisoPlaylist({ estado }: { estado: string }) {
  const aviso = avisoDe(AVISOS_PLAYLIST, estado);
  if (!aviso) return null;

  return (
    <p
      role={aviso.error ? "alert" : "status"}
      className={`rounded-campo p-interno text-pequeno ${
        aviso.error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      }`}
    >
      {t(aviso.clave)}
    </p>
  );
}
