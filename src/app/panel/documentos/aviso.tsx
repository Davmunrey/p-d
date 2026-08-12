import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal. Un «documento apuntado» anunciado
 * a gritos interrumpe lo que estuviera leyendo un lector de pantalla; un fallo
 * sí merece interrumpir.
 *
 * `confirmar-borrado` no es ninguna de las dos cosas —no ha fallado nada, se
 * está preguntando— pero se anuncia como aviso: quien no ve la pantalla tiene
 * que enterarse de que su borrado no ha ocurrido todavía.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  apuntado: { clave: "panel.documentos.avisoApuntado", error: false },
  editado: { clave: "panel.documentos.avisoEditado", error: false },
  borrado: { clave: "panel.documentos.avisoBorrado", error: false },
  conseguido: { clave: "panel.documentos.avisoConseguido", error: false },
  titulo: { clave: "panel.documentos.errorTitulo", error: true },
  "de-quien": { clave: "panel.documentos.errorDeQuien", error: true },
  "estado-invalido": { clave: "panel.documentos.errorEstado", error: true },
  "sin-fecha-obtencion": { clave: "panel.documentos.errorSinFechaObtencion", error: true },
  fecha: { clave: "panel.documentos.errorFecha", error: true },
  "confirmar-borrado": { clave: "panel.documentos.avisoConfirmarBorrado", error: true },
  "no-existe": { clave: "panel.documentos.errorNoExiste", error: true },
  "sin-permiso": { clave: "panel.documentos.errorSinPermiso", error: true },
  error: { clave: "panel.documentos.errorGuardar", error: true },
};

export function AvisoDocumentos({ estado }: { estado: string }) {
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
