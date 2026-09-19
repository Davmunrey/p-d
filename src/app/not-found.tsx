import type { Metadata } from "next";

import { BotonEnlace } from "@/components/ui/boton";
import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { t } from "@/lib/copy";

/**
 * LA PÁGINA QUE NO EXISTE
 *
 * No la había, y eso significaba que un invitado que teclease mal el enlace
 * —o que abriera uno viejo de WhatsApp— recibía la 404 de serie de Next: fondo
 * blanco, tipografía del sistema y «This page could not be found». En inglés,
 * en una web que es toda en castellano, y en la única pantalla donde alguien ya
 * está desconcertado.
 *
 * El copy llevaba escrito desde el principio en `errores.noEncontrado`. Lo que
 * faltaba era el fichero que lo pintara.
 *
 * DICE QUÉ HACER, no sólo qué ha pasado. Quien llega aquí venía a ver la boda,
 * así que lo útil es la puerta de vuelta, no una disculpa. Y no se enseña
 * ningún dato de la boda: esta página la ve cualquiera, incluido un rastreador,
 * y una 404 no es sitio para nombres ni fechas.
 */
export const metadata: Metadata = {
  title: t("errores.noEncontrado"),
  // Una 404 no se indexa. Sale por defecto, y decirlo aquí lo deja escrito.
  robots: { index: false, follow: false },
};

export default function NoEncontrada() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-texto place-items-center px-interno text-center">
      <div>
        <Titulo2 como="h1">{t("errores.noEncontrado")}</Titulo2>
        <Cuerpo className="mt-pila">{t("errores.noEncontradoTexto")}</Cuerpo>

        <BotonEnlace href="/" className="mt-bloque">
          {t("errores.volverAlInicio")}
        </BotonEnlace>
      </div>
    </main>
  );
}
