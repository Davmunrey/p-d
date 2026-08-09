import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BotonEnlace } from "@/components/ui/boton";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import { obtenerConfiguracion, obtenerSecciones } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * RESERVA LA FECHA
 *
 * Lo primero que se manda a los invitados, meses antes de la invitación. Se
 * abre casi siempre desde WhatsApp, en móvil, y se mira dos segundos: tiene que
 * decir quién, cuándo y dónde sin que nadie haga scroll.
 *
 * NO SE CACHEA, y es lo contrario que la landing. Su existencia depende de una
 * fila de `secciones_landing`, así que revalidar cada hora significaría que
 * apagarla desde el panel tarda una hora en surtir efecto —o, peor, que se
 * sigue enseñando una página que ya se quiso retirar—. Es una consulta a dos
 * tablas de once y una filas: sale más barato preguntar que explicar por qué
 * el interruptor no hace nada.
 */
export const dynamic = "force-dynamic";

const formatoFechaLarga = new Intl.DateTimeFormat(IDIOMA, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

export async function generateMetadata(): Promise<Metadata> {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion) return {};

  const nombres = `${configuracion.nombreNovia} ${t("portada.conjuncion")} ${configuracion.nombreNovio}`;
  const fecha = formatoFechaLarga.format(configuracion.fechaCeremonia);
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;

  return {
    title: `${nombres} · ${t("saveTheDate.etiqueta")}`,
    description: lugar ? `${fecha} · ${lugar}` : fecha,
  };
}

export default async function PaginaReservaLaFecha() {
  const [secciones, configuracion] = await Promise.all([
    obtenerSecciones(),
    obtenerConfiguracion(),
  ]);

  // La página existe sólo si su fila está visible. Apagada, 404: mejor que una
  // página a medias, y mejor que dejarla en pie cuando ya se ha querido
  // retirar. `obtenerSecciones` sólo devuelve las visibles, porque la política
  // RLS de la tabla ya filtra por `visible`.
  if (!secciones.includes("reserva_la_fecha")) notFound();

  // Sin configuración no hay nada que reservar. Se dice, no se finge.
  if (!configuracion) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-texto place-items-center px-interno text-center">
        <div>
          <Titulo2 como="h1">{t("portada.enPreparacion")}</Titulo2>
          <Cuerpo className="mt-pila">{t("portada.enPreparacionTexto")}</Cuerpo>
        </div>
      </main>
    );
  }

  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;

  // El relleno vertical es corto a propósito: la página ya ocupa la pantalla
  // entera y centra su contenido, así que `py-seccion-compacta` solo servía
  // para empujar el bloque fuera de la ventana en pantallas bajas. El criterio
  // de este ticket es que quepa sin hacer scroll, no el ritmo de la landing.
  return (
    <main
      data-seccion="inversa"
      className="grid min-h-dvh place-items-center px-interno py-pila text-center"
    >
      <div className="mx-auto w-full max-w-estrecho">
        <Etiqueta>{t("saveTheDate.etiqueta")}</Etiqueta>

        {/* Un solo h1 con los dos nombres: es el título de la página, y para un
            lector de pantalla partirlo en dos encabezados no significa nada. */}
        <h1 className="mt-pila font-titulo text-display leading-display tracking-display">
          {configuracion.nombreNovia}
          <span className="block text-titulo-1 italic text-marca">
            {t("portada.conjuncion")}
          </span>
          {configuracion.nombreNovio}
        </h1>

        <hr className="mx-auto my-pila w-full border-t border-borde-fuerte" />

        <p className="font-titulo text-titulo-2">
          <time dateTime={configuracion.fechaCeremonia.toISOString()}>
            {formatoFechaLarga.format(configuracion.fechaCeremonia)}
          </time>
        </p>
        {lugar ? (
          <Titulo3 como="p" className="mt-linea text-tinta-suave">
            {lugar}
          </Titulo3>
        ) : null}

        <p className="mx-auto mt-pila max-w-texto text-pequeno text-tinta-suave">
          {t("saveTheDate.nota")}
        </p>

        <div className="mt-elemento">
          <BotonEnlace href="/">{t("saveTheDate.verLaWeb")}</BotonEnlace>
        </div>
      </div>
    </main>
  );
}
