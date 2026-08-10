import Link from "next/link";
import { redirect } from "next/navigation";

import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_INVITADOS } from "@/config/constants";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { FormularioImportacion } from "./formulario";

/**
 * BODA-53 · IMPORTAR INVITADOS DESDE CSV
 *
 * La lista nace siempre en una hoja de cálculo que se pasan las dos familias.
 * Teclear doscientos nombres en el formulario de uno en uno no es una opción, y
 * el resultado de intentarlo es que falte gente.
 *
 * UN LECTOR NO IMPORTA. La protección de verdad es `puede_editar()` dentro de
 * la función de la base; esto es no enseñar una pantalla que va a fallar.
 */
export const dynamic = "force-dynamic";

export default async function PaginaImportar() {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  if (acceso.rol === "lector") {
    return (
      <>
        <Titulo2 como="h1">{t("panel.importar.titulo")}</Titulo2>
        <Etiqueta className="mt-bloque block">{t("panel.invitados.errorSinPermiso")}</Etiqueta>
      </>
    );
  }

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.importar.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.importar.descripcion")}</Cuerpo>
      </header>

      <section className="mt-bloque max-w-texto rounded-tarjeta border border-borde p-interno">
        <Titulo3 como="h2">{t("panel.importar.columnasEsperadas")}</Titulo3>
        <Cuerpo className="mt-pila text-pequeno">{t("panel.importar.columnasAyuda")}</Cuerpo>
        <Cuerpo className="mt-pila text-pequeno text-tinta-tenue">
          {t("panel.importar.plantillaAyuda")}
        </Cuerpo>
        <p className="mt-elemento">
          <a
            href={`${RUTA_INVITADOS}/importar/plantilla`}
            className="text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
          >
            {t("panel.importar.plantilla")}
          </a>
        </p>
      </section>

      <FormularioImportacion />

      <p className="mt-bloque">
        <Link
          href={RUTA_INVITADOS}
          className="text-pequeno text-tinta-suave underline decoration-borde underline-offset-4 transicion-color hover:text-tinta"
        >
          {t("panel.importar.volver")}
        </Link>
      </p>
    </>
  );
}
