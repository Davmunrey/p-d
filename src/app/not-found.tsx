import type { Metadata } from "next";
import { headers } from "next/headers";

import { PantallaEstado } from "@/components/marketing/pantalla-estado";
import { BotonEnlace } from "@/components/ui/boton";
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

export default async function NoEncontrada() {
  /*
    SE LEE LA PETICIÓN A PROPÓSITO, aunque no haga falta nada de ella. Sin
    esto Next prerenderiza la 404 en el build, y una página hecha antes de
    que exista ninguna petición sale sin el nonce de la CSP: la cabecera llega
    con un nonce recién hecho, los once scripts del HTML no llevan ninguno, y
    con `'strict-dynamic'` el navegador los bloquea todos. Se vio en
    producción. Una página que lleva nonce tiene que pintarse por petición, y
    tocar las cabeceras es lo que la hace dinámica.
  */
  await headers();

  return (
    <PantallaEstado titulo={t("errores.noEncontrado")} texto={t("errores.noEncontradoTexto")}>
      <BotonEnlace href="/">{t("errores.volverAlInicio")}</BotonEnlace>
    </PantallaEstado>
  );
}
