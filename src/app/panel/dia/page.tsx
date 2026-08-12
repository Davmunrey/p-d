import Link from "next/link";
import { redirect } from "next/navigation";

import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import {
  RUTA_ACCESO,
  RUTA_AGENDA_DIA,
  RUTA_BUSCAR_DIA,
  RUTA_EXPORTAR_DIA,
  RUTA_RECUENTO,
} from "@/config/constants";
import { obtenerGuion } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { Guion } from "./guion";

/**
 * BODA-100 (#67) · EL GUION DE LA JORNADA
 *
 * La pantalla de la boda. Es la puerta al resto del módulo —teléfonos,
 * buscador, recuento, papel— y a la vez la lista de control de la jornada,
 * porque son las dos cosas que se hacen ese día y no caben en dos sitios.
 *
 * NO SE CACHEA NADA, y aquí importa más que en ningún otro sitio: si dos
 * personas van marcando puntos, cada una tiene que ver lo que ha marcado la
 * otra al abrir. Un guion de hace cinco minutos es un autobús que sale dos
 * veces.
 */
export const dynamic = "force-dynamic";

export default async function PaginaDia() {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const guion = await obtenerGuion();

  return (
    <>
      <div className="max-w-texto">
        <Titulo2 como="h1">{t("panel.dia.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.dia.entradilla")}</Cuerpo>
      </div>

      <Atajos />

      {guion.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto text-pequeno text-tinta-suave">
          {t("panel.dia.guion.vacio")}
        </Cuerpo>
      ) : (
        <Guion puntos={guion} puedeEditar={acceso.rol !== "lector"} />
      )}
    </>
  );
}

/**
 * LOS CUATRO ATAJOS, ARRIBA Y EN CUADRÍCULA.
 *
 * No son un menú: son cuatro destinos concretos que se buscan con urgencia y
 * cada uno resuelve una pregunta distinta —a quién llamo, dónde se sienta,
 * cuántos comen, cómo me lo llevo en papel—. Van con área táctil de sobra
 * porque se pulsan andando.
 */
function Atajos() {
  const atajos = [
    { ruta: RUTA_AGENDA_DIA, clave: "panel.dia.atajos.agenda" },
    { ruta: RUTA_BUSCAR_DIA, clave: "panel.dia.atajos.buscar" },
    { ruta: RUTA_RECUENTO, clave: "panel.dia.atajos.recuento" },
    { ruta: RUTA_EXPORTAR_DIA, clave: "panel.dia.atajos.exportar" },
  ] as const;

  return (
    <nav aria-label={t("panel.dia.titulo")} className="mt-bloque">
      <ul className="grid grid-cols-2 gap-interno sm:grid-cols-4">
        {atajos.map((atajo) => (
          <li key={atajo.ruta}>
            <Link
              href={atajo.ruta}
              className="flex min-h-control items-center justify-center rounded-campo border border-borde-fuerte p-elemento text-center text-etiqueta uppercase tracking-boton text-tinta-marca transicion-color hover:border-borde-marca hover:bg-superficie-hundida"
            >
              {t(atajo.clave)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
