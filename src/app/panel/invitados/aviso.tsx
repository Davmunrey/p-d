import { t, type ClaveCopy } from "@/lib/copy";

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
  "enlace-emitido": { clave: "panel.invitados.enlaceEmitido", error: false },
  "persona-anadida": { clave: "panel.invitados.personaAnadida", error: false },
  "persona-quitada": { clave: "panel.invitados.personaQuitada", error: false },
  nombre: { clave: "panel.invitados.errorNombre", error: true },
  "nombre-persona": { clave: "panel.invitados.errorNombrePersona", error: true },
  acompanantes: { clave: "panel.invitados.errorAcompanantes", error: true },
  "no-existe": { clave: "panel.invitados.errorNoExiste", error: true },
  "quitar-con-respuesta": { clave: "panel.invitados.errorQuitarConRespuesta", error: true },
  "sin-permiso": { clave: "panel.invitados.errorSinPermiso", error: true },
  error: { clave: "panel.invitados.errorGuardar", error: true },
};

export function AvisoEstado({ estado }: { estado: string }) {
  const aviso = AVISOS[estado];
  if (!aviso) return null;

  return (
    <p
      role={aviso.error ? "alert" : "status"}
      className={`mt-elemento rounded-campo p-interno text-pequeno ${
        aviso.error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      }`}
    >
      {t(aviso.clave)}
    </p>
  );
}
