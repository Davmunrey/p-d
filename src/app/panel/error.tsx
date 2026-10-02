"use client";

import { useEffect } from "react";

import { Boton } from "@/components/ui/boton";
import { Cuerpo, Titulo3 } from "@/components/ui/tipografia";
import { t } from "@/lib/copy";

/**
 * ESTADO DE ERROR
 *
 * Sin este fichero, un fallo dentro del panel sube hasta la raíz y se lleva
 * por delante la navegación y la sesión: pantalla en blanco y a empezar de
 * nuevo. Aquí el fallo se queda dentro del contenido, con el marco en pie y un
 * botón para reintentar sin recargar.
 *
 * NO SE ENSEÑA `error.message`. Un error del servidor puede llevar dentro una
 * consulta, un nombre de tabla o un dato de un invitado. Va al registro, donde
 * se puede investigar, y a la pantalla va lo único que le sirve a quien está
 * mirando: que no ha ido bien y que puede volver a probar.
 *
 * «REINTENTAR» ES `retry`, NO `reset`. `reset` sólo vuelve a pintar lo que ya
 * había llegado —el mismo fallo— sin pedir nada al servidor: ante un corte de
 * unos segundos el botón no hacía nada y había que recargar a mano. `retry`
 * vuelve a pedir la pantalla, que es lo que promete el texto.
 */
export default function ErrorPanel({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Fallo en el panel:", error);
  }, [error]);

  return (
    <div role="alert" className="grid max-w-texto gap-pila">
      <Titulo3 como="h1">{t("panel.errorTitulo")}</Titulo3>
      <Cuerpo>{t("panel.errorTexto")}</Cuerpo>
      <div>
        <Boton type="button" jerarquia="secundario" onClick={() => retry()}>
          {t("panel.reintentar")}
        </Boton>
      </div>
    </div>
  );
}
