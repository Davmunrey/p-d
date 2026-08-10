import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal. Un «gasto apuntado» anunciado a
 * gritos interrumpe lo que estuviera leyendo un lector de pantalla; un fallo sí
 * merece interrumpir.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  "gasto-creado": { clave: "panel.presupuesto.gastos.avisoCreado", error: false },
  "gasto-editado": { clave: "panel.presupuesto.gastos.avisoEditado", error: false },
  "gasto-borrado": { clave: "panel.presupuesto.gastos.avisoBorrado", error: false },
  concepto: { clave: "panel.presupuesto.gastos.errorConcepto", error: true },
  categoria: { clave: "panel.presupuesto.gastos.errorCategoria", error: true },
  importe: { clave: "panel.presupuesto.gastos.errorImporte", error: true },
  "sin-categorias": { clave: "panel.presupuesto.gastos.sinCategorias", error: true },
  "tiene-pagos": { clave: "panel.presupuesto.gastos.errorTienePagos", error: true },
  "no-existe": { clave: "panel.presupuesto.gastos.errorNoExiste", error: true },
  "sin-permiso": { clave: "panel.presupuesto.gastos.errorSinPermiso", error: true },
  error: { clave: "panel.presupuesto.gastos.errorGuardar", error: true },
};

export function AvisoGastos({ estado }: { estado: string }) {
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
