import { MAXIMO_ACOMPANANTES } from "@/config/constants";
import { t, type ClaveCopy } from "@/lib/copy";
import { avisoDe } from "@/lib/avisos";

/**
 * El resultado de la última acción, en una frase.
 *
 * Vive suelto porque lo usan las dos pantallas del módulo —la lista y la
 * ficha—, y porque el mapa de estados es lo único que hay que mirar para saber
 * qué puede decir esta pantalla.
 *
 * `role="alert"` sólo cuando es un error. Un «invitación creada» anunciado a
 * gritos interrumpe lo que estuviera leyendo el lector de pantalla; un fallo,
 * sí merece interrumpir.
 */

const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  creada: { clave: "panel.invitados.creada", error: false },
  importados: { clave: "panel.invitados.avisoImportados", error: false },
  "enlace-emitido": { clave: "panel.invitados.enlaceEmitido", error: false },
  "persona-anadida": { clave: "panel.invitados.personaAnadida", error: false },
  "persona-editada": { clave: "panel.invitados.personaEditada", error: false },
  "persona-quitada": { clave: "panel.invitados.personaQuitada", error: false },
  nombre: { clave: "panel.invitados.errorNombre", error: true },
  "nombre-largo": { clave: "panel.invitados.errorNombreLargo", error: true },
  "nombre-persona": { clave: "panel.invitados.errorNombrePersona", error: true },
  "persona-larga": { clave: "panel.invitados.errorPersonaLarga", error: true },
  correo: { clave: "panel.invitados.errorCorreo", error: true },
  acompanantes: { clave: "panel.invitados.errorAcompanantes", error: true },
  "no-existe": { clave: "panel.invitados.errorNoExiste", error: true },
  "quitar-con-respuesta": { clave: "panel.invitados.errorQuitarConRespuesta", error: true },
  "persona-no-existe": { clave: "panel.invitados.errorPersonaNoExiste", error: true },
  "confirmar-emision": { clave: "panel.invitados.errorConfirmarEmision", error: true },
  "invitacion-editada": { clave: "panel.invitados.invitacionEditada", error: false },
  "invitacion-borrada": { clave: "panel.invitados.invitacionBorrada", error: false },
  "acompanantes-ocupados": { clave: "panel.invitados.errorAcompanantesOcupados", error: true },
  "borrar-con-respuestas": { clave: "panel.invitados.errorBorrarConRespuestas", error: true },
  "respuesta-apuntada": { clave: "panel.invitados.respuestaApuntada", error: false },
  "respuesta-sin-estado": { clave: "panel.invitados.errorRespuestaSinEstado", error: true },
  "menu-infantil": { clave: "panel.invitados.errorMenuInfantil", error: true },
  "alergias-largas": { clave: "panel.invitados.errorAlergiasLargas", error: true },
  "sin-permiso": { clave: "panel.invitados.errorSinPermiso", error: true },
  error: { clave: "panel.invitados.errorGuardar", error: true },
};

export function AvisoEstado({ estado }: { estado: string }) {
  const aviso = avisoDe(AVISOS, estado);
  if (!aviso) return null;

  return (
    <p
      role={aviso.error ? "alert" : "status"}
      className={`mt-elemento rounded-campo p-interno text-pequeno ${
        aviso.error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      }`}
    >
      {/* El tope sale de la constante: el copy lleva el hueco, no el número. */}
      {t(aviso.clave, { maximo: MAXIMO_ACOMPANANTES })}
    </p>
  );
}
