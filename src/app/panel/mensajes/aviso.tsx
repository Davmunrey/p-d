import { t, type ClaveCopy } from "@/lib/copy";
import { avisoDe } from "@/lib/avisos";

type Avisos = Readonly<Record<string, { clave: ClaveCopy; error: boolean }>>;

/**
 * LOS AVISOS DE LAS DOS PESTAÑAS, JUNTOS
 *
 * Las acciones de los mensajes y las de las canciones viven en el mismo
 * `acciones.ts`, y cada una vuelve a su pestaña con su `?estado=`. Los dos
 * mapas van aquí, al lado de las acciones que los producen: cuando se añada un
 * estado, se ve de un vistazo a qué pestaña le falta su frase.
 */
export const AVISOS_MENSAJES: Avisos = {
  marcado: { clave: "panel.mensajes.marcado", error: false },
  destacado: { clave: "panel.mensajes.avisoDestacado", error: false },
  "sin-destacar": { clave: "panel.mensajes.avisoSinDestacar", error: false },
  "mensaje-cambiado": { clave: "panel.mensajes.errorMensajeCambiado", error: true },
  "mensaje-no-existe": { clave: "panel.mensajes.errorMensajeNoExiste", error: true },
  "sin-permiso": { clave: "panel.mensajes.errorSinPermiso", error: true },
  error: { clave: "panel.mensajes.errorGuardar", error: true },
};

export const AVISOS_PLAYLIST: Avisos = {
  "cancion-ocultada": { clave: "panel.mensajes.cancionOcultada", error: false },
  "cancion-mostrada": { clave: "panel.mensajes.cancionMostrada", error: false },
  "no-existe": { clave: "panel.mensajes.errorNoExiste", error: true },
  "sin-permiso": { clave: "panel.mensajes.errorSinPermiso", error: true },
  error: { clave: "panel.mensajes.errorGuardar", error: true },
};

/**
 * `role="alert"` sólo para lo que ha ido mal: un «mensaje actualizado»
 * anunciado a gritos interrumpe lo que estuviera leyendo un lector de
 * pantalla; un fallo sí merece interrumpir.
 */
export function AvisoMensajes({ avisos, estado }: { avisos: Avisos; estado: string }) {
  const aviso = avisoDe(avisos, estado);
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
