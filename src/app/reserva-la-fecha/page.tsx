import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CieloEstrellado } from "@/components/marketing/cielo-estrellado";
import { EnPreparacion } from "@/components/marketing/en-preparacion";
import { SobreReserva } from "@/components/marketing/sobre-reserva";
import { GIRO_DEL_SOBRE } from "@/config/cielo";
import { IDIOMA, IDIOMA_OG, PARAMETRO_SOBRE_ABIERTO, ZONA_HORARIA } from "@/config/constants";
import {
  obtenerConfiguracion,
  obtenerMedios,
  obtenerRetrato,
  obtenerSecciones,
} from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";
import { anio, fechaConDia } from "@/lib/fechas";

/**
 * RESERVA LA FECHA
 *
 * Lo primero que se manda a quien aún no tiene invitación. Se abre casi
 * siempre desde WhatsApp, en móvil: un sobre de noche, bajo el mismo cielo que
 * la landing —la Vía Láctea, las fugaces, girando despacio—, con el retrato de
 * estrellas de Paloma, Hati y David en la solapa. Al tocar el lacre sale la
 * tarjeta con quién, cuándo y dónde. El sobre vive en `SobreReserva`; aquí se
 * leen los datos y se componen los textos.
 *
 * NO SE CACHEA, y es lo contrario que la landing. Su existencia depende de una
 * fila de `secciones_landing`, así que revalidar cada hora significaría que
 * apagarla desde el panel tarda una hora en surtir efecto —o, peor, que se
 * sigue enseñando una página que ya se quiso retirar—. Es una consulta a tres
 * tablas cortas: sale más barato preguntar que explicar por qué el
 * interruptor no hace nada.
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
  const [secciones, configuracion] = await Promise.all([
    obtenerSecciones().catch(() => null),
    obtenerConfiguracion().catch(() => null),
  ]);
  if (!configuracion) return {};

  /*
    CON LA SECCIÓN APAGADA NO HAY METADATOS DE LA PÁGINA. La página contesta
    404, pero los metadatos se calculan aparte, y seguían viajando en esa misma
    respuesta: título, fecha, lugar y la imagen de una página que se quiso
    retirar. Es la misma puerta trasera que ya se cerró en su imagen OG y en el
    `.ics`.
  */
  if (!secciones?.includes("reserva_la_fecha")) return {};

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
    // Y con el idioma y el nombre del sitio: el `openGraph` de una página
    // SUSTITUYE al del layout, no se suma, y sin estos dos la pieza que más se
    // comparte por mensajería salía como inglesa y sin nombre.
    openGraph: {
      title: titulo,
      description: descripcion,
      type: "website",
      locale: IDIOMA_OG,
      siteName: nombres,
    },
  };
}

export default async function PaginaReservaLaFecha({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let secciones;
  let configuracion;
  let fotos;
  let retrato;
  try {
    [secciones, configuracion, fotos, retrato] = await Promise.all([
      obtenerSecciones(),
      obtenerConfiguracion(),
      obtenerMedios("reserva_la_fecha"),
      obtenerRetrato(),
    ]);
  } catch {
    // La avería ya está en el log. Aquí no se puede saber si la sección estaba
    // encendida, así que se enseña el estado de reserva en vez de un 404 que
    // diría algo falso: la página existe, es la base la que no contesta.
    return <EnPreparacion motivo="averia" />;
  }

  // La página existe sólo si su fila está visible. Apagada, 404: mejor que una
  // página a medias, y mejor que dejarla en pie cuando ya se ha querido
  // retirar. `obtenerSecciones` sólo devuelve las visibles, porque la política
  // RLS de la tabla ya filtra por `visible`.
  if (!secciones.includes("reserva_la_fecha")) notFound();

  // Sin configuración no hay nada que reservar. Se dice, no se finge.
  if (!configuracion) return <EnPreparacion />;

  const consulta = await searchParams;
  const { nombreNovia, nombreNovio, fechaCeremonia, ciudadCeremonia } = configuracion;
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;

  // «Paloma & David · León» en el dorso del sobre; «Finca La Sierra · León» en
  // la tarjeta. Sin ciudad, lo que haya: nunca un «· null».
  const nombresConAmpersand = `${nombreNovia} ${t("navegacion.monogramaConector")} ${nombreNovio}`;
  const remite = ciudadCeremonia
    ? t("saveTheDate.remite", { nombres: nombresConAmpersand, ciudad: ciudadCeremonia })
    : nombresConAmpersand;
  const lugarConCiudad =
    lugar && ciudadCeremonia
      ? t("saveTheDate.lugarYCiudad", { lugar, ciudad: ciudadCeremonia })
      : (lugar ?? ciudadCeremonia);

  /*
    LA PÁGINA ES DE NOCHE, ENTERA. El bloque inverso de la marca —los mismos
    semánticos reasignados— y el cielo de la landing detrás, en su lienzo:
    como aquí no se baja, gira solo, y cruza una fugaz cuando sale la tarjeta.
    Todo cuelga de la columna central y se centra en el alto que sobre.
  */
  return (
    <main
      data-seccion="inversa"
      className="cielo-del-sobre relative isolate flex min-h-dvh flex-col items-center overflow-clip px-pila pt-sobre-arriba pb-sobre-abajo"
    >
      <CieloEstrellado
        viaLactea
        fugaces
        giroPorSegundo={GIRO_DEL_SOBRE}
        fugazAlAviso
        className="capa-cielo absolute inset-0 size-full"
      />

      <SobreReserva
        nombreNovia={nombreNovia}
        nombreNovio={nombreNovio}
        fechaIso={fechaCeremonia.toISOString()}
        ahoraIso={new Date().toISOString()}
        fechaTexto={fechaConDia(fechaCeremonia)}
        anio={anio(fechaCeremonia)}
        lugar={lugarConCiudad}
        remite={remite}
        foto={fotos.find((medio) => medio.tipo === "imagen") ?? null}
        retrato={retrato}
        urlBase={process.env.NEXT_PUBLIC_SUPABASE_URL}
        abiertoAlLlegar={consulta[PARAMETRO_SOBRE_ABIERTO] !== undefined}
      />
    </main>
  );
}
