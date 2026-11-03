import type { ReactNode } from "react";

import { EstrellasDelRetrato } from "@/components/marketing/estrellas-del-retrato";
import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { RETRATO_EN_LA_TARJETA } from "@/config/cielo";
import type { Retrato } from "@/lib/bbdd/landing";

/**
 * LAS PANTALLAS DE «AQUÍ NO HAY NADA QUE ENSEÑAR»: la 404, el error y la web
 * sin datos.
 *
 * Eran la plantilla de siempre —titular, frase y botón en el centro exacto de
 * la pantalla— sin nada de la boda, y es justo donde el invitado ya está
 * desconcertado. Llevan encima del titular EL RETRATO DE ESTRELLAS de Paloma,
 * Hati y David —donde antes iba la Lira, que los novios quitaron de toda la
 * web—, impreso como en la tarjeta del Save the Date y dibujándose una vez al
 * llegar. Sin retrato publicado, o con la base caída, no hay dibujo: el
 * titular sube y ya está.
 *
 * Es ADORNO y no se anuncia: el texto alternativo de la foto nombra a quien
 * sale en ella, y estas páginas las ve cualquiera, también un rastreador. Por
 * eso tampoco llevan ningún otro dato de la boda.
 *
 * Sólo para componentes de servidor y de cliente corrientes: la pantalla de
 * error GLOBAL no la usa a propósito, porque si lo que falla es la interfaz
 * esta pantalla caería con ella.
 */
export function PantallaEstado({
  titulo,
  texto,
  alerta = false,
  retrato = null,
  children,
}: {
  titulo: string;
  texto: string;
  /** `role="alert"` para lo que ha ido mal; lo demás es información. */
  alerta?: boolean;
  /** El retrato de estrellas, o `null` si no hay o no se ha podido leer. */
  retrato?: Pick<Retrato, "proporcion" | "estrellas"> | null;
  /** Las salidas: botones o enlaces. */
  children?: ReactNode;
}) {
  return (
    <main
      role={alerta ? "alert" : undefined}
      className="grid min-h-dvh content-start justify-items-center px-margen pt-seccion-fluida pb-bloque text-center"
    >
      <div className="max-w-texto">
        {retrato ? (
          <div
            aria-hidden="true"
            data-retrato-estado=""
            data-seccion="papel"
            className="trazado-al-llegar mx-auto mb-elemento flex h-retrato-estado justify-center"
          >
            <EstrellasDelRetrato
              retrato={retrato}
              medidas={RETRATO_EN_LA_TARJETA}
              idHalo="halo-retrato-estado"
              encuadre="xMidYMid meet"
              className="block h-full w-auto overflow-visible"
            />
          </div>
        ) : null}
        <Titulo2 como="h1">{titulo}</Titulo2>
        <Cuerpo className="mt-pila">{texto}</Cuerpo>
        {children ? (
          <div className="mt-bloque flex flex-wrap justify-center gap-interno">{children}</div>
        ) : null}
      </div>
    </main>
  );
}
