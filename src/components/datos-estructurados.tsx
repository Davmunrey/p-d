import { IDIOMA } from "@/config/constants";
import type { ConfiguracionBoda } from "@/lib/bbdd/landing";

/**
 * BODA-92 · LOS DATOS DEL EVENTO, EN LENGUAJE DE MÁQUINA
 *
 * El mismo dato que ya está en la página, dicho otra vez en un formato que
 * entienden los buscadores y los asistentes de voz. Sirve para que «¿cuándo es
 * la boda de Paloma y David?» tenga respuesta sin que nadie abra la web.
 *
 * SALE DE `configuracion_boda`, COMO TODO LO DEMÁS. Si la fecha cambia, esto
 * cambia con ella; no hay una segunda copia que se pueda quedar vieja — que es
 * exactamente lo que pasa cuando los datos estructurados se escriben a mano.
 *
 * `eventAttendanceMode` es presencial y `eventStatus` programado: son los
 * valores que evitan que un buscador la presente como un evento en línea o
 * cancelado, que es lo que hacen por defecto con la información incompleta.
 *
 * NO SE PUBLICA NADA QUE NO ESTÉ YA A LA VISTA. Ni el enlace del RSVP, ni el
 * correo de contacto, ni la cuenta: aquí sólo va lo que cualquiera lee al
 * entrar. Un dato estructurado es más fácil de recolectar, no menos.
 *
 * Y «a la vista» lo decide la página, no este componente. La dirección y el
 * punto del mapa salían siempre, aunque los novios hubieran apagado «Cómo
 * llegar» para no anunciar todavía dónde es: la página ya no los enseñaba y los
 * buscadores los seguían indexando. Quien pinta la página dice qué se ve.
 */
export function DatosEstructurados({
  configuracion,
  nombres,
  aLaVista,
}: {
  configuracion: ConfiguracionBoda;
  nombres: string;
  /** Lo que la página enseña de verdad: la dirección escrita y el mapa. */
  aLaVista: { direccion: boolean; mapa: boolean };
}) {
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;

  const datos = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: nombres,
    startDate: configuracion.fechaCeremonia.toISOString(),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    inLanguage: IDIOMA,
    ...(lugar
      ? {
          location: {
            "@type": "Place",
            name: lugar,
            ...(aLaVista.direccion && configuracion.direccionCeremonia
              ? {
                  address: {
                    "@type": "PostalAddress",
                    streetAddress: configuracion.direccionCeremonia,
                  },
                }
              : {}),
            ...(aLaVista.mapa &&
            configuracion.latitud !== null &&
            configuracion.longitud !== null
              ? {
                  geo: {
                    "@type": "GeoCoordinates",
                    latitude: configuracion.latitud,
                    longitude: configuracion.longitud,
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  /*
    `JSON.stringify` y no una plantilla de texto: los nombres y el lugar los
    escribe quien organiza desde el panel, y una comilla suelta en «Finca "El
    Robledal"» rompería el bloque entero. Al serializar, se escapa solo.

    El `</` se parte además a mano: un `</script>` dentro de una cadena cierra
    la etiqueta antes de tiempo y lo que venga detrás se ejecuta. Es el único
    sitio de la web donde eso puede pasar.
  */
  const serializado = JSON.stringify(datos).replaceAll("</", "<\\/");

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializado }} />
  );
}
