import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal. Un «pago apuntado» anunciado a
 * gritos interrumpe lo que estuviera leyendo un lector de pantalla; un fallo sí
 * merece interrumpir.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  "pago-creado": { clave: "panel.presupuesto.pagos.avisoCreado", error: false },
  "pago-editado": { clave: "panel.presupuesto.pagos.avisoEditado", error: false },
  "pago-borrado": { clave: "panel.presupuesto.pagos.avisoBorrado", error: false },
  "marcado-pagado": { clave: "panel.presupuesto.pagos.avisoPagado", error: false },
  "marcado-pendiente": { clave: "panel.presupuesto.pagos.avisoPendiente", error: false },
  gasto: { clave: "panel.presupuesto.pagos.errorGasto", error: true },
  importe: { clave: "panel.presupuesto.pagos.errorImporte", error: true },
  fecha: { clave: "panel.presupuesto.pagos.errorFecha", error: true },
  pagador: { clave: "panel.presupuesto.pagos.errorPagador", error: true },
  "no-existe": { clave: "panel.presupuesto.pagos.errorNoExiste", error: true },
  "sin-permiso": { clave: "panel.presupuesto.pagos.errorSinPermiso", error: true },
  error: { clave: "panel.presupuesto.pagos.errorGuardar", error: true },
};

/**
 * EL AVISO DE «NO CABE» LLEVA LA CIFRA, y por eso no está en la tabla de
 * arriba: es el único que necesita un dato de la operación que acaba de fallar.
 *
 * Decir «no cabe» a secas obliga a ir al gasto, mirar su importe, sumar sus
 * pagos y restar. Decir «quedan 400,00 € por apuntar» resuelve el problema en la
 * misma frase que lo nombra.
 *
 * Si la cifra no llega —porque el tope lo impuso el trigger, y entonces la que
 * teníamos ya no valía— se dice sin ella en vez de inventarla.
 */
export function AvisoPagos({ estado, queda }: { estado: string; queda: string }) {
  if (estado === "no-cabe") {
    return (
      <Recuadro error>
        {queda
          ? t("panel.presupuesto.pagos.errorNoCabe", { queda })
          : t("panel.presupuesto.pagos.errorNoCabeSinCifra")}
      </Recuadro>
    );
  }

  const aviso = AVISOS[estado];
  if (!aviso) return null;

  return <Recuadro error={aviso.error}>{t(aviso.clave)}</Recuadro>;
}

function Recuadro({ error, children }: { error?: boolean; children: React.ReactNode }) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mt-elemento rounded-campo p-interno text-pequeno ${
        error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      }`}
    >
      {children}
    </p>
  );
}
