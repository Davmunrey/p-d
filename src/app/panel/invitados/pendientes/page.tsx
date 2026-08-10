import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, RUTA_ACCESO, RUTA_INVITADOS, ZONA_HORARIA } from "@/config/constants";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import { obtenerPendientes } from "@/lib/bbdd/invitados";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { recordarPorWhatsApp } from "../acciones";

/**
 * BODA-111 · QUIÉN NO HA CONTESTADO
 *
 * Siempre hay un tercio que no contesta hasta que se le pregunta, y
 * perseguirlos a mano es lo que más tiempo se lleva de toda la organización.
 *
 * ESTA PANTALLA NO AUTORIZA NADA. Filtra para no ofrecer lo que va a fallar,
 * pero quien decide si un recordatorio sale es `marcar_recordatorio()`, que
 * mira el estado en el instante de escribir. Entre pintar esta lista y pulsar
 * un botón pasan minutos, y en esos minutos alguien contesta desde su móvil:
 * una lista de hace un rato no puede garantizar el «nunca alcanza a quien ya ha
 * respondido» que pide el ticket.
 *
 * EL RECORDATORIO NO LLEVA ENLACE. La base guarda la huella del token y no el
 * token, así que meterlo obligaría a emitir uno nuevo — y eso invalidaría el
 * que la familia ya tiene en su WhatsApp. Recordar no puede romper lo que se
 * mandó. Quien de verdad lo haya perdido, pide uno nuevo y se emite desde su
 * ficha, que es un acto distinto y consciente.
 */
export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  timeZone: ZONA_HORARIA,
});

const AVISOS: Record<string, { clave: Parameters<typeof t>[0]; error: boolean }> = {
  recordado: { clave: "panel.pendientes.avisoRecordado", error: false },
  "ya-contesto": { clave: "panel.pendientes.errorYaContesto", error: true },
  plazo: { clave: "panel.pendientes.errorPlazo", error: true },
  "sin-permiso": { clave: "panel.invitados.errorSinPermiso", error: true },
  error: { clave: "panel.invitados.errorGuardar", error: true },
};

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaPendientes({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const estado = typeof consulta.estado === "string" ? consulta.estado : "";
  const aviso = AVISOS[estado];

  const [pendientes, configuracion] = await Promise.all([
    obtenerPendientes(),
    obtenerConfiguracion(),
  ]);

  const puedeEditar = acceso.rol !== "lector";
  const plazoCerrado = Boolean(
    configuracion?.fechaLimiteRsvp && configuracion.fechaLimiteRsvp < new Date(),
  );

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.pendientes.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.pendientes.descripcion")}</Cuerpo>
      </header>

      {aviso ? (
        <p
          role={aviso.error ? "alert" : "status"}
          className={`mt-elemento rounded-campo p-interno text-pequeno ${
            aviso.error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
          }`}
        >
          {t(aviso.clave)}
        </p>
      ) : null}

      {/*
        Pasado el plazo no se recuerda, se llama. Se dice arriba y se quitan
        todos los botones: un recordatorio a destiempo hace pensar a quien lo
        recibe que todavía llega, y para entonces el número ya está dado.
      */}
      {plazoCerrado ? (
        <section className="mt-bloque max-w-texto rounded-tarjeta border border-borde bg-superficie-tenue p-interno">
          <Titulo3 como="h2">{t("panel.pendientes.plazoCerradoTitulo")}</Titulo3>
          <Cuerpo className="mt-pila text-pequeno">
            {t("panel.pendientes.plazoCerradoAviso")}
          </Cuerpo>
        </section>
      ) : null}

      {pendientes.length === 0 ? (
        <Cuerpo className="mt-bloque">{t("panel.pendientes.vacio")}</Cuerpo>
      ) : (
        <ul className="mt-bloque grid gap-interno">
          {pendientes.map((grupo) => (
            <li
              key={grupo.id}
              className="grid gap-interno rounded-tarjeta border border-borde p-interno"
            >
              <div>
                <Link
                  href={`${RUTA_INVITADOS}/${grupo.id}`}
                  className="font-titulo text-titulo-3 text-tinta transicion-color hover:text-tinta-marca"
                >
                  {grupo.nombre}
                </Link>
                <span className="mt-linea block text-pequeno text-tinta-tenue">
                  {grupo.personas === 1
                    ? t("panel.pendientes.personasUna")
                    : t("panel.pendientes.personasCuenta", { personas: grupo.personas })}
                  {" · "}
                  {grupo.ultimoContacto
                    ? grupo.recordatorioEnviadoEn
                      ? t("panel.pendientes.recordadoEn", {
                          fecha: formatoFecha.format(grupo.recordatorioEnviadoEn),
                        })
                      : t("panel.pendientes.contactadoEn", {
                          fecha: formatoFecha.format(grupo.ultimoContacto),
                        })
                    : t("panel.pendientes.sinContacto")}
                </span>
              </div>

              {/*
                A quien no se le ha mandado nada todavía no se le recuerda: no
                tiene enlace que mirar. Se le manda la invitación desde su
                ficha, que es donde vive el enlace en claro.
              */}
              {!grupo.invitacionEnviadaEn ? (
                <div>
                  <Cuerpo className="max-w-texto text-pequeno text-tinta-suave">
                    {t("panel.pendientes.sinEnlaceAviso")}
                  </Cuerpo>
                  <Link
                    href={`${RUTA_INVITADOS}/${grupo.id}`}
                    className="mt-pila inline-block text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
                  >
                    {t("panel.pendientes.verFicha")}
                  </Link>
                </div>
              ) : puedeEditar && !plazoCerrado ? (
                <form action={recordarPorWhatsApp} className="grid gap-interno-compacto">
                  <input type="hidden" name="grupo_id" value={grupo.id} />
                  <label htmlFor={`mensaje-${grupo.id}`} className="sr-only">
                    {t("panel.pendientes.mensaje")}
                  </label>
                  <textarea
                    id={`mensaje-${grupo.id}`}
                    name="mensaje"
                    rows={2}
                    required
                    defaultValue={t("panel.pendientes.plantillaRecordatorio")}
                    className="w-full rounded-campo border border-borde bg-superficie p-interno text-pequeno text-tinta"
                  />
                  <div>
                    <Boton type="submit" jerarquia="secundario">
                      {t("panel.pendientes.recordarBoton")}
                    </Boton>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!puedeEditar ? (
        <Etiqueta className="mt-bloque block">{t("panel.invitados.errorSinPermiso")}</Etiqueta>
      ) : null}

      <p className="mt-bloque">
        <Link
          href={RUTA_INVITADOS}
          className="text-pequeno text-tinta-suave underline decoration-borde underline-offset-4 transicion-color hover:text-tinta"
        >
          {t("panel.pendientes.volver")}
        </Link>
      </p>
    </>
  );
}
