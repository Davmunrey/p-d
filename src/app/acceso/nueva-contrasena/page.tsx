import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { LONGITUD_MINIMA_CONTRASENA, RUTA_ACCESO } from "@/config/constants";
import { hayAutenticacion, clienteServidor } from "@/lib/supabase/servidor";
import { t } from "@/lib/copy";

import { guardarContrasena } from "../acciones";

/**
 * PONER UNA CONTRASEÑA NUEVA
 *
 * Solo se llega aquí con la sesión que abre el enlace de recuperación. Sin
 * ella no hay nada que cambiar, así que se devuelve a la puerta: si no, esta
 * página sería una forma de cambiarle la contraseña a cualquiera.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("acceso.nuevaTitulo"),
  robots: { index: false, follow: false },
};

export default async function PaginaNuevaContrasena({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  // Aquí basta con estar autenticado: es el propio usuario cambiando su
  // contraseña, y todavía puede no tener perfil activo.
  if (!hayAutenticacion) redirect(`${RUTA_ACCESO}?estado=sin-configurar`);

  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`${RUTA_ACCESO}?estado=enlace-invalido`);

  const { estado } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-interno py-elemento">
      <div className="mx-auto w-full max-w-texto">
        <Etiqueta>{t("meta.titulo")}</Etiqueta>
        <Titulo2 como="h1" className="mt-pila">
          {t("acceso.nuevaTitulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("acceso.nuevaDescripcion")}</Cuerpo>

        {estado ? (
          <p role="alert" className="mt-elemento text-pequeno text-error-tinta">
            {estado === "corta" ? t("acceso.nuevaCorta") : t("acceso.errorGenerico")}
          </p>
        ) : null}

        <form action={guardarContrasena} className="mt-elemento grid gap-elemento">
          <CampoTexto
            name="contrasena"
            type="password"
            etiqueta={t("acceso.nuevaContrasena")}
            ayuda={t("acceso.nuevaAyuda")}
            autoComplete="new-password"
            minLength={LONGITUD_MINIMA_CONTRASENA}
            required
          />
          <div>
            <Boton type="submit">{t("acceso.nuevaGuardar")}</Boton>
          </div>
        </form>
      </div>
    </main>
  );
}
