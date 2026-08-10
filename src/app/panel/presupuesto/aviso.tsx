import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal. Un «categoría creada» anunciado a
 * gritos interrumpe lo que estuviera leyendo un lector de pantalla; un fallo sí
 * merece interrumpir.
 *
 * `decidir-gastos` no ha fallado —se está preguntando a dónde van los gastos—
 * pero se anuncia igual: quien no ve la pantalla tiene que enterarse de que su
 * borrado no ha ocurrido y de que hay una decisión esperándole.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  "categoria-creada": { clave: "panel.presupuesto.avisoCreada", error: false },
  "categoria-editada": { clave: "panel.presupuesto.avisoEditada", error: false },
  "categoria-borrada": { clave: "panel.presupuesto.avisoBorrada", error: false },
  "gastos-movidos": { clave: "panel.presupuesto.avisoGastosMovidos", error: false },
  "decidir-gastos": { clave: "panel.presupuesto.avisoDecidirGastos", error: true },
  nombre: { clave: "panel.presupuesto.errorNombre", error: true },
  importe: { clave: "panel.presupuesto.errorImporte", error: true },
  orden: { clave: "panel.presupuesto.errorOrden", error: true },
  destino: { clave: "panel.presupuesto.errorDestino", error: true },
  "no-existe": { clave: "panel.presupuesto.errorNoExiste", error: true },
  "sin-permiso": { clave: "panel.presupuesto.errorSinPermiso", error: true },
  error: { clave: "panel.presupuesto.errorGuardar", error: true },
};

export function AvisoPresupuesto({ estado }: { estado: string }) {
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
