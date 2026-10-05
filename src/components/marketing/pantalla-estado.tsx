import type { ReactNode } from "react";

import { Constelacion } from "@/components/ui/constelacion";
import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { CONSTELACION_NOVIOS } from "@/config/constelaciones";

/**
 * LAS PANTALLAS DE «AQUÍ NO HAY NADA QUE ENSEÑAR»: la 404, el error y la web
 * sin datos.
 *
 * Eran la plantilla de siempre —titular, frase y botón en el centro exacto de
 * la pantalla— sin nada de la boda, y es justo donde el invitado ya está
 * desconcertado. Llevan ahora la Lira encima del titular, como las pantallas de
 * estado del RSVP, y el bloque en el tercio de arriba en vez de flotando en
 * medio. Sin datos de la boda: estas páginas las ve cualquiera.
 *
 * Sólo para componentes de servidor y de cliente corrientes: la pantalla de
 * error GLOBAL no la usa a propósito, porque si lo que falla es la interfaz
 * esta pantalla caería con ella.
 */
export function PantallaEstado({
  titulo,
  texto,
  alerta = false,
  children,
}: {
  titulo: string;
  texto: string;
  /** `role="alert"` para lo que ha ido mal; lo demás es información. */
  alerta?: boolean;
  /** Las salidas: botones o enlaces. */
  children?: ReactNode;
}) {
  return (
    <main
      role={alerta ? "alert" : undefined}
      className="grid min-h-dvh content-start justify-items-center px-margen pt-seccion-fluida pb-bloque text-center"
    >
      <div className="max-w-texto">
        <div className="mx-auto mb-elemento size-constelacion">
          <Constelacion clave={CONSTELACION_NOVIOS} />
        </div>
        <Titulo2 como="h1">{titulo}</Titulo2>
        <Cuerpo className="mt-pila">{texto}</Cuerpo>
        {children ? (
          <div className="mt-bloque flex flex-wrap justify-center gap-interno">{children}</div>
        ) : null}
      </div>
    </main>
  );
}
