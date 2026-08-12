import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal. Un «proveedor guardado»
 * anunciado a gritos interrumpe lo que estuviera leyendo un lector de
 * pantalla; un fallo sí merece interrumpir.
 *
 * `confirmar-borrado` no es ninguna de las dos cosas —no ha fallado nada, se
 * está preguntando— pero se anuncia como aviso: quien no ve la pantalla tiene
 * que enterarse de que su borrado no ha ocurrido todavía.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  creado: { clave: "panel.proveedores.avisoCreado", error: false },
  editado: { clave: "panel.proveedores.avisoEditado", error: false },
  borrado: { clave: "panel.proveedores.avisoBorrado", error: false },
  "estado-cambiado": { clave: "panel.proveedores.avisoEstadoCambiado", error: false },
  "contacto-anadido": { clave: "panel.proveedores.avisoContactoAnadido", error: false },
  "contacto-quitado": { clave: "panel.proveedores.avisoContactoQuitado", error: false },
  "categoria-creada": { clave: "panel.proveedores.avisoCategoriaCreada", error: false },
  "categoria-borrada": { clave: "panel.proveedores.avisoCategoriaBorrada", error: false },
  nombre: { clave: "panel.proveedores.errorNombre", error: true },
  categoria: { clave: "panel.proveedores.errorCategoria", error: true },
  importe: { clave: "panel.proveedores.errorImporte", error: true },
  valoracion: { clave: "panel.proveedores.errorValoracion", error: true },
  "contacto-sin-via": { clave: "panel.proveedores.errorContactoSinVia", error: true },
  estado: { clave: "panel.proveedores.errorEstado", error: true },
  "descarte-sin-motivo": { clave: "panel.proveedores.errorDescarteSinMotivo", error: true },
  "confirmar-contratado": { clave: "panel.proveedores.avisoConfirmarContratado", error: true },
  "confirmar-borrado": { clave: "panel.proveedores.avisoConfirmarBorrado", error: true },
  "documento-subido": { clave: "panel.proveedores.avisoDocumentoSubido", error: false },
  "documento-borrado": { clave: "panel.proveedores.avisoDocumentoBorrado", error: false },
  "confirmar-documento": { clave: "panel.proveedores.avisoConfirmarDocumento", error: true },
  "documento-sin-fichero": { clave: "panel.proveedores.errorDocumentoSinFichero", error: true },
  "documento-nombre": { clave: "panel.proveedores.errorDocumentoNombre", error: true },
  "documento-tipo": { clave: "panel.proveedores.errorDocumentoTipo", error: true },
  "documento-peso": { clave: "panel.proveedores.errorDocumentoPeso", error: true },
  "sin-configurar": { clave: "panel.proveedores.errorSinConfigurar", error: true },
  "servicio-creado": { clave: "panel.proveedores.avisoServicioCreado", error: false },
  "servicio-editado": { clave: "panel.proveedores.avisoServicioEditado", error: false },
  "servicio-borrado": { clave: "panel.proveedores.avisoServicioBorrado", error: false },
  "servicio-nombre": { clave: "panel.proveedores.errorServicioNombre", error: true },
  "servicio-precio": { clave: "panel.proveedores.errorServicioPrecio", error: true },
  "servicio-cantidad": { clave: "panel.proveedores.errorServicioCantidad", error: true },
  "servicio-minimo": { clave: "panel.proveedores.errorServicioMinimo", error: true },
  "servicio-minimo-suelto": {
    clave: "panel.proveedores.errorServicioMinimoSuelto",
    error: true,
  },
  elegido: { clave: "panel.proveedores.avisoElegido", error: false },
  "no-existe": { clave: "panel.proveedores.errorNoExiste", error: true },
  "en-uso": { clave: "panel.proveedores.errorEnUso", error: true },
  "sin-permiso": { clave: "panel.proveedores.errorSinPermiso", error: true },
  error: { clave: "panel.proveedores.errorGuardar", error: true },
};

export function AvisoProveedores({ estado }: { estado: string }) {
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
