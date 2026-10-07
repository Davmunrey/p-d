import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_MESAS_EXPORTAR } from "@/config/constants";
import {
  agruparAlergias,
  agruparPorMesa,
  obtenerAlergiasPorMesa,
  obtenerComensales,
  obtenerMesas,
} from "@/lib/bbdd/mesas";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { ANCLA_NUEVA, ANCLA_REPARTO } from "../estado";
import {
  AlergiasSinMesa,
  anclaDe,
  avisoDeLaAccion,
  BloqueMesa,
  ESTADOS_DE_SUS_DATOS,
  FormularioNuevaMesa,
  IrAUnaMesa,
  type Parametros,
} from "../piezas";

export const metadata: Metadata = { title: t("panel.mesas.repartoTitulo") };

/**
 * BODA-84 (#60) · MESA A MESA
 *
 * Cada mesa con su gente, sus alergias y sus datos, y el alta al final. Es lo
 * que se imprime y lo que se le manda a la finca: los formularios llevan
 * `print:hidden` y cada mesa se queda entera en su hoja.
 */
export const dynamic = "force-dynamic";

export default async function PaginaReparto({ searchParams }: Parametros) {
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
  const alergiasPorMesa = agruparAlergias(alergias);

  const aviso = avisoDeLaAccion(consulta, mesas, [
    // El alta sólo se pinta a quien puede crear: sin ella, el aviso va arriba.
    ...(puedeEditar ? [ANCLA_NUEVA] : []),
    ...mesas.map((mesa) => anclaDe(mesa)),
  ]);

  return (
    <>
      <header
        id={ANCLA_REPARTO}
        className="flex scroll-mt-elemento flex-wrap items-start justify-between gap-interno"
      >
        <div className="max-w-texto">
          <Titulo2 como="h1">{t("panel.mesas.repartoTitulo")}</Titulo2>
          <Cuerpo className="mt-pila">{t("panel.mesas.repartoAyuda")}</Cuerpo>
          {/* En papel esta frase sobra: quien lo tiene impreso ya lo sabe. */}
          <p className="mt-pila text-pequeno text-tinta-suave print:hidden">
            {t("panel.mesas.imprimir")}
          </p>
        </div>

        {/*
          UN `GET` A UNA RUTA Y NO UN ENLACE DEL ENRUTADOR: el resultado es un
          fichero, no una pantalla, y hace falta que el navegador lo descargue
          con sus cabeceras en vez de que el enrutador intente pintarlo.

          Lo ve también un lector: exportar es leer, y quien puede mirar el
          reparto puede llevárselo a la finca.
        */}
        <form method="get" action={RUTA_MESAS_EXPORTAR} className="print:hidden">
          <BotonEnvio jerarquia="terciario">{t("panel.mesas.exportar")}</BotonEnvio>
        </form>
      </header>

      {mesas.length > 0 ? (
        <IrAUnaMesa mesas={mesas} sentadosPorMesa={sentadosPorMesa} conAlta={puedeEditar} />
      ) : null}

      {aviso.arriba}

      {mesas.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.mesas.repartoVacio")}
        </Cuerpo>
      ) : (
        <div className="mt-bloque grid gap-bloque">
          {mesas.map((mesa) => (
            <BloqueMesa
              key={mesa.id}
              mesa={mesa}
              sentados={sentadosPorMesa.get(mesa.id) ?? []}
              alergias={alergiasPorMesa.get(mesa.id) ?? []}
              mesas={mesas}
              sentadosPorMesa={sentadosPorMesa}
              puedeEditar={puedeEditar}
              aviso={aviso.en(anclaDe(mesa))}
              confirmandoBorrado={
                aviso.estado === "confirmar-borrado" && aviso.mesa?.id === mesa.id
              }
              datosAbiertos={
                aviso.ancla === anclaDe(mesa) && ESTADOS_DE_SUS_DATOS.has(aviso.estado)
              }
            />
          ))}
        </div>
      )}

      <AlergiasSinMesa alergias={alergiasPorMesa.get(null) ?? []} />

      {puedeEditar ? <FormularioNuevaMesa aviso={aviso.en(ANCLA_NUEVA)} /> : null}
    </>
  );
}
