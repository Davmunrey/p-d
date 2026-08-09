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
 */
export default function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fallo en el panel:", error);
  }, [error]);

  return (
    <div role="alert" className="grid max-w-texto gap-pila">
      <Titulo3 como="h1">{t("panel.errorTitulo")}</Titulo3>
      <Cuerpo>{t("panel.errorTexto")}</Cuerpo>
      <div>
        <Boton type="button" jerarquia="secundario" onClick={reset}>
          {t("panel.reintentar")}
        </Boton>
      </div>
    </div>
  );
}
