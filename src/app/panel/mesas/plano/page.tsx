import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RUTA_ACCESO } from "@/config/constants";
import { agruparPorMesa, obtenerComensales, obtenerMesas } from "@/lib/bbdd/mesas";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { ANCLA_PLANO } from "../estado";
import { avisoDeLaAccion, Plano, SinMesasTodavia, type Parametros } from "../piezas";

export const metadata: Metadata = { title: t("panel.mesas.planoTitulo") };

/**
 * BODA-83 (#59) · EL PLANO DE LA SALA
 *
 * Una mesa se elige tocándola —`?mesa=`—, y entonces sus flechas y su gente
 * salen debajo del lienzo. Colocar y empujar vuelven aquí con la misma mesa
 * elegida, así que se empuja diez veces sin moverse de sitio.
 *
 * EL PLANO SE COLOCA SIN RATÓN Y SIN JAVASCRIPT: las flechas son formularios y
 * las coordenadas se escriben en los datos de cada mesa (ver `piezas.tsx`).
 */
export const dynamic = "force-dynamic";

export default async function PaginaPlano({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const [mesas, comensales] = await Promise.all([obtenerMesas(), obtenerComensales()]);

  const puedeEditar = acceso.rol !== "lector";
  const aviso = avisoDeLaAccion(consulta, mesas, [ANCLA_PLANO]);

  const colocadas = mesas.filter((mesa) => mesa.posicionX !== null && mesa.posicionY !== null);
  const sinColocar = mesas.filter((mesa) => mesa.posicionX === null);

  // Sólo se elige una mesa que está en el plano: las demás no tienen flechas.
  const elegida = colocadas.find((mesa) => mesa.id === aviso.mesa?.id);

  return (
    <>
      <Plano
        mesas={colocadas}
        sinColocar={sinColocar}
        sentadosPorMesa={agruparPorMesa(comensales)}
        aviso={aviso.arriba ?? aviso.en(ANCLA_PLANO)}
        elegida={elegida}
        recienMovida={aviso.estado === "colocada" || aviso.estado === "movida"}
        puedeEditar={puedeEditar}
      />
      {puedeEditar && mesas.length === 0 ? <SinMesasTodavia /> : null}
    </>
  );
}
