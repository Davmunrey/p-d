import { HORAS_DURACION_EVENTO, NOMBRE_FICHERO_CALENDARIO } from "@/config/constants";
import { construirIcs } from "@/lib/calendario";
import { obtenerConfiguracion, obtenerSecciones } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * DESCARGA DEL EVENTO PARA EL CALENDARIO
 *
 * Que el invitado se lo apunte en el momento es la mitad del trabajo de una
 * reserva de fecha: dentro de ocho meses nadie se acuerda de buscar el enlace.
 *
 * La ruta termina en `.ics` porque hay clientes de correo y navegadores que
 * miran la extensión antes que la cabecera para decidir si abren el fichero
 * con el calendario.
 *
 * Se genera al vuelo desde la base de datos, nunca es un fichero estático:
 * mover la hora de la ceremonia tiene que cambiar lo que se descarga.
 */
export const dynamic = "force-dynamic";

export async function GET(peticion: Request) {
  const [secciones, configuracion] = await Promise.all([
    obtenerSecciones(),
    obtenerConfiguracion(),
  ]);

  // Mismo criterio que la página: si la sección está apagada, esto tampoco
  // existe. Si no, quedaría una puerta trasera para sacar la fecha de una
  // página que se ha querido retirar.
  if (!secciones.includes("reserva_la_fecha") || !configuracion) {
    return new Response(null, { status: 404 });
  }

  const origen = new URL(peticion.url).origin;
  const nombres = `${configuracion.nombreNovia} ${t("portada.conjuncion")} ${configuracion.nombreNovio}`;
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;
  const direccion = configuracion.direccionCeremonia;
  const ultimoHito = configuracion.fechaBanquete ?? configuracion.fechaCeremonia;

  const ics = construirIcs({
    // Estable mientras no cambie la fecha: volver a descargarlo actualiza el
    // evento en vez de duplicarlo.
    identificador: `boda-${configuracion.fechaCeremonia.toISOString().slice(0, 10)}@${new URL(origen).hostname}`,
    titulo: nombres,
    descripcion: t("meta.descripcion"),
    lugar: [lugar, direccion].filter(Boolean).join(", ") || null,
    latitud: configuracion.latitud,
    longitud: configuracion.longitud,
    url: origen,
    inicio: configuracion.fechaCeremonia,
    // El fin se cuenta desde el último hito con hora conocida. Ojo: el
    // banquete es cuándo EMPIEZA el banquete, no cuándo acaba la boda; usarlo
    // como final dejaría un evento que termina justo cuando empieza lo bueno.
    fin: new Date(ultimoHito.getTime() + HORAS_DURACION_EVENTO * 60 * 60 * 1000),
    generadoEn: new Date(),
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${NOMBRE_FICHERO_CALENDARIO}"`,
      // No se cachea por lo mismo que la página: la fecha puede cambiar y un
      // calendario con la hora vieja es peor que no tener nada.
      "Cache-Control": "no-store",
    },
  });
}
