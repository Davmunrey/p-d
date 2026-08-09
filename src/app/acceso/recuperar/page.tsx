import type { Metadata } from "next";

import { Boton, BotonEnlace } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_ACCESO } from "@/config/constants";
import { t } from "@/lib/copy";

import { pedirRecuperacion } from "../acciones";

/**
 * RECUPERAR LA CONTRASEÑA
 *
 * Sin esto, un olvido deja a alguien fuera para siempre y solo se arregla
 * entrando al panel de Supabase. Es la mitad que hace que una contraseña sea
 * una opción razonable y no una trampa.
 *
 * La respuesta es la misma exista o no el correo, por lo mismo que en el
 * acceso: no puede convertirse en un comprobador de quién tiene panel.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("acceso.recuperarTitulo"),
  robots: { index: false, follow: false },
};

export default async function PaginaRecuperar({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const enviado = estado === "enviado";

  return (
    <main className="grid min-h-dvh place-items-center px-interno py-elemento">
      <div className="mx-auto w-full max-w-texto">
        <Etiqueta>{t("meta.titulo")}</Etiqueta>
        <Titulo2 como="h1" className="mt-pila">
          {t("acceso.recuperarTitulo")}
        </Titulo2>

        {enviado ? (
          <div className="mt-elemento rounded-tarjeta border border-borde bg-superficie-hundida p-elemento">
            <p role="status" className="font-titulo text-titulo-3">
              {t("acceso.recuperarEnviado")}
            </p>
            <Cuerpo className="mt-linea">{t("acceso.recuperarEnviadoTexto")}</Cuerpo>
          </div>
        ) : (
          <>
            <Cuerpo className="mt-pila">{t("acceso.recuperarDescripcion")}</Cuerpo>

            {estado === "sin-configurar" ? (
              <p role="alert" className="mt-elemento text-pequeno text-error-tinta">
                {t("acceso.sinConfigurar")}
              </p>
            ) : null}

            <form action={pedirRecuperacion} className="mt-elemento grid gap-elemento">
              <CampoTexto
                name="correo"
                type="email"
                etiqueta={t("acceso.correo")}
                autoComplete="username"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div>
                <Boton type="submit">{t("acceso.recuperarEnviar")}</Boton>
              </div>
            </form>
          </>
        )}

        <div className="mt-bloque">
          <BotonEnlace href={RUTA_ACCESO} jerarquia="terciario">
            {t("acceso.titulo")}
          </BotonEnlace>
        </div>
      </div>
    </main>
  );
}
