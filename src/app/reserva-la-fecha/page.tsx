import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnPreparacion } from "@/components/marketing/en-preparacion";
import { BotonEnlace } from "@/components/ui/boton";
import { Etiqueta, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, RUTA_CALENDARIO, ZONA_HORARIA } from "@/config/constants";
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
  // Si la base no responde, la página ya enseñará su estado de reserva; unas
  // meta tags vacías son mejores que tumbar la petición entera por el título.
  const configuracion = await obtenerConfiguracion().catch(() => null);
  if (!configuracion) return {};

  const nombres = `${configuracion.nombreNovia} ${t("portada.conjuncion")} ${configuracion.nombreNovio}`;
  const fecha = formatoFechaLarga.format(configuracion.fechaCeremonia);
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;

  const titulo = `${nombres} · ${t("saveTheDate.etiqueta")}`;
  const descripcion = lugar ? `${fecha} · ${lugar}` : fecha;

  return {
    title: titulo,
    description: descripcion,
    // Se repiten a propósito: sin `openGraph`, WhatsApp cae al título del
    // layout y la tarjeta dice «Paloma y David» en vez de la fecha.
    openGraph: { title: titulo, description: descripcion, type: "website" },
  };
}

export default async function PaginaReservaLaFecha() {
  let secciones;
  let configuracion;
  try {
    [secciones, configuracion] = await Promise.all([
      obtenerSecciones(),
      obtenerConfiguracion(),
    ]);
  } catch {
    // La avería ya está en el log. Aquí no se puede saber si la sección estaba
    // encendida, así que se enseña el estado de reserva en vez de un 404 que
    // diría algo falso: la página existe, es la base la que no contesta.
    return <EnPreparacion />;
  }

  // La página existe sólo si su fila está visible. Apagada, 404: mejor que una
  // página a medias, y mejor que dejarla en pie cuando ya se ha querido
  // retirar. `obtenerSecciones` sólo devuelve las visibles, porque la política
  // RLS de la tabla ya filtra por `visible`.
  if (!secciones.includes("reserva_la_fecha")) notFound();

  // Sin configuración no hay nada que reservar. Se dice, no se finge.
  if (!configuracion) return <EnPreparacion />;

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
          <span className="block text-titulo-1 italic text-acento">
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

        <div className="mt-elemento flex flex-wrap justify-center gap-interno">
          {/*
            Enlace normal y no `next/link`: el destino no es una página, es un
            fichero que se descarga. Con el enrutador de Next por medio, el
            navegador intentaría navegar a él.
          */}
          <BotonEnlace href={RUTA_CALENDARIO} prefetch={false} download>
            {t("saveTheDate.anadirCalendario")}
          </BotonEnlace>
          <BotonEnlace href="/" jerarquia="secundario">
            {t("saveTheDate.verLaWeb")}
          </BotonEnlace>
        </div>
      </div>
    </main>
  );
}
