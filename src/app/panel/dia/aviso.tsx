import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal, como en el resto del panel: una
 * corrección guardada anunciada a gritos interrumpe lo que estuviera leyendo un
 * lector de pantalla, y un fallo sí merece interrumpir.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  corregido: { clave: "panel.dia.avisos.corregido", error: false },
  "sin-permiso": { clave: "panel.dia.avisos.sinPermiso", error: true },
  "menu-invalido": { clave: "panel.dia.avisos.menuInvalido", error: true },
  "ajuste-invalido": { clave: "panel.dia.avisos.ajusteInvalido", error: true },
  error: { clave: "panel.dia.avisos.error", error: true },
};

export function AvisoDia({ estado }: { estado: string }) {
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
