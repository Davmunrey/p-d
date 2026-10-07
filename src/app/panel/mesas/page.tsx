import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_ACCESO } from "@/config/constants";
import {
  agruparAlergias,
  agruparPorGrupo,
  agruparPorMesa,
  ESTADO_CONFIRMADO,
  ESTADO_RECHAZADO,
  obtenerAlergiasPorMesa,
  obtenerComensales,
  obtenerMesas,
} from "@/lib/bbdd/mesas";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { ANCLA_SIN_MESA, ANCLA_SIN_RESPUESTA } from "./estado";
import {
  AlergiasSinMesa,
  avisoDeLaAccion,
  SinMesasTodavia,
  SinSentar,
  type Parametros,
} from "./piezas";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.mesas.titulo") };

/**
 * BODA-84 (#60) · POR SENTAR: QUIÉN NO TIENE MESA TODAVÍA
 *
 * Es la raíz de las mesas, y no por azar: mientras quede alguien aquí, el
 * reparto no está hecho. Las otras dos vistas —el plano y cada mesa con su
 * gente— son pestañas al lado (ver `piezas.tsx`).
 *
 * Las alergias de quien todavía no está sentado van aquí, arriba: es la fila
 * de `v_alergias_por_mesa` que hay que resolver antes de mandar el reparto a la
 * cocina, y se pierde justo mientras el reparto está a medias.
 */
export const dynamic = "force-dynamic";

export default async function PaginaPorSentar({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;

  const [mesas, comensales, alergias] = await Promise.all([
    obtenerMesas(),
    obtenerComensales(),
    obtenerAlergiasPorMesa(),
  ]);

  const puedeEditar = acceso.rol !== "lector";
  const sentadosPorMesa = agruparPorMesa(comensales);

  const sinMesa = comensales.filter((persona) => !persona.mesaId);
  const confirmadosSinMesa = agruparPorGrupo(
    sinMesa.filter((persona) => persona.estado === ESTADO_CONFIRMADO),
  );
  /*
    Quien ha dicho que no viene NO sale por ninguna parte: no es que le falte
    mesa, es que no hay que ponerle ninguna. Mezclarlo con los que aún no han
    contestado inflaría la lista de pendientes con gente que ya está resuelta.
  */
  const sinRespuestaSinMesa = agruparPorGrupo(
    sinMesa.filter(
      (persona) => persona.estado !== ESTADO_CONFIRMADO && persona.estado !== ESTADO_RECHAZADO,
    ),
  );

  const aviso = avisoDeLaAccion(consulta, mesas, [ANCLA_SIN_MESA, ANCLA_SIN_RESPUESTA]);

  const contarPersonas = (grupos: { personas: unknown[] }[]) =>
    grupos.reduce((total, grupo) => total + grupo.personas.length, 0);
  const conCuenta = (titulo: string, cuantas: number) =>
    cuantas > 0 ? t("panel.mesas.indiceConCuenta", { titulo, cuantas }) : titulo;
  const indice = [
    {
      ancla: ANCLA_SIN_MESA,
      rotulo: conCuenta(t("panel.mesas.sinMesaTitulo"), contarPersonas(confirmadosSinMesa)),
    },
    {
      ancla: ANCLA_SIN_RESPUESTA,
      rotulo: conCuenta(
        t("panel.mesas.sinRespuestaTitulo"),
        contarPersonas(sinRespuestaSinMesa),
      ),
    },
  ];

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.mesas.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.mesas.descripcion")}</Cuerpo>
      </header>

      {puedeEditar && mesas.length === 0 ? <SinMesasTodavia /> : null}

      {/*
        LAS DOS BOLSAS, DE UN TOQUE. Con noventa invitados sin contestar, la
        primera mide miles de píxeles en un móvil y la segunda quedaba debajo
        sin que nada dijera que existía, ni cuánta gente tenía.
      */}
      <nav aria-label={t("panel.mesas.indice")} className="mt-elemento print:hidden">
        <ul className="flex flex-wrap gap-x-interno gap-y-linea text-pequeno">
          {indice.map((entrada) => (
            <li key={entrada.ancla}>
              <a
                href={`#${entrada.ancla}`}
                className="inline-flex min-h-control-compacto items-center underline decoration-borde-fuerte underline-offset-4"
              >
                {entrada.rotulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {aviso.arriba}

      <AlergiasSinMesa alergias={agruparAlergias(alergias).get(null) ?? []} />

      <SinSentar
        id={ANCLA_SIN_MESA}
        aviso={aviso.en(ANCLA_SIN_MESA)}
        todos={comensales}
        titulo={t("panel.mesas.sinMesaTitulo")}
        ayuda={t("panel.mesas.sinMesaAyuda")}
        vacio={t("panel.mesas.sinMesaVacio")}
        grupos={confirmadosSinMesa}
        mesas={mesas}
        sentadosPorMesa={sentadosPorMesa}
        puedeEditar={puedeEditar}
      />

      {/*
        Este bloque también se pinta vacío, con su frase. Un bloque que
        desaparece no se distingue de uno que no ha cargado, y aquí eso se lee
        como «no queda nadie sin contestar» — que es justo lo contrario de lo
        que significaría un fallo de lectura.
      */}
      <SinSentar
        id={ANCLA_SIN_RESPUESTA}
        aviso={aviso.en(ANCLA_SIN_RESPUESTA)}
        todos={comensales}
        titulo={t("panel.mesas.sinRespuestaTitulo")}
        ayuda={t("panel.mesas.sinRespuestaAyuda")}
        vacio={t("panel.mesas.sinRespuestaVacio")}
        grupos={sinRespuestaSinMesa}
        mesas={mesas}
        sentadosPorMesa={sentadosPorMesa}
        puedeEditar={puedeEditar}
      />
    </>
  );
}
