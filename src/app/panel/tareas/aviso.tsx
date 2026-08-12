import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal. Un «tarea apuntada» anunciado a
 * gritos interrumpe lo que estuviera leyendo un lector de pantalla; un fallo sí
 * merece interrumpir.
 *
 * `confirmar-borrado` no es ninguna de las dos cosas —no ha fallado nada, se
 * está preguntando— pero se anuncia como aviso: quien no ve la pantalla tiene
 * que enterarse de que su borrado no ha ocurrido todavía.
 *
 * `ya-estaban` tampoco es un fallo: generar dos veces y que no salga nada nuevo
 * es exactamente lo que tiene que pasar. Va como `status`, y con su cifra
 * delante —«0 creadas»— porque un silencio se lee como que no funcionó.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  creada: { clave: "panel.tareas.avisoCreada", error: false },
  editada: { clave: "panel.tareas.avisoEditada", error: false },
  duplicada: { clave: "panel.tareas.avisoDuplicada", error: false },
  borrada: { clave: "panel.tareas.avisoBorrada", error: false },
  completada: { clave: "panel.tareas.avisoCompletada", error: false },
  "estado-cambiado": { clave: "panel.tareas.avisoEstadoCambiado", error: false },
  movida: { clave: "panel.tareas.avisoMovida", error: false },
  "ya-estaban": { clave: "panel.tareas.avisoYaEstaban", error: false },
  titulo: { clave: "panel.tareas.errorTitulo", error: true },
  fecha: { clave: "panel.tareas.errorFecha", error: true },
  prioridad: { clave: "panel.tareas.errorPrioridad", error: true },
  estado: { clave: "panel.tareas.errorEstado", error: true },
  "sin-grupos": { clave: "panel.tareas.errorSinGrupos", error: true },
  "sin-mover": { clave: "panel.tareas.errorSinMover", error: true },
  "confirmar-borrado": { clave: "panel.tareas.avisoConfirmarBorrado", error: true },
  "no-existe": { clave: "panel.tareas.errorNoExiste", error: true },
  "en-uso": { clave: "panel.tareas.errorEnUso", error: true },
  "sin-permiso": { clave: "panel.tareas.errorSinPermiso", error: true },
  error: { clave: "panel.tareas.errorGuardar", error: true },
};

/**
 * Cuántas tareas se acaban de crear desde la plantilla.
 *
 * Va aparte de la tabla porque lleva una cifra dentro, y esa cifra viaja en la
 * URL: la acción sabe cuántas creó y la pantalla es quien sabe escribirlo. El
 * singular tiene su propia frase — «1 tareas nuevas» es de robot.
 */
function textoGeneradas(creadas: string): string {
  const cuantas = Number(creadas);
  if (!Number.isFinite(cuantas) || cuantas <= 0) return t("panel.tareas.avisoYaEstaban");
  if (cuantas === 1) return t("panel.tareas.avisoGeneradaUna");
  return t("panel.tareas.avisoGeneradas", { cuantas });
}

export function AvisoTareas({ estado, creadas }: { estado: string; creadas: string }) {
  const esGeneradas = estado === "generadas";
  const aviso = AVISOS[estado];
  if (!esGeneradas && !aviso) return null;

  const error = esGeneradas ? false : aviso.error;

  return (
    <p
      role={error ? "alert" : "status"}
      className={`mt-elemento rounded-campo p-interno text-pequeno ${
        error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      }`}
    >
      {esGeneradas ? textoGeneradas(creadas) : t(aviso.clave)}
    </p>
  );
}
