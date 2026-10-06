import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { LONGITUD_MINIMA_CONTRASENA, RUTA_ACCESO } from "@/config/constants";
import { nombresDeLaBoda } from "@/lib/bbdd/landing";
import { hayAutenticacion, clienteServidor } from "@/lib/supabase/servidor";
import { avisoDe } from "@/lib/avisos";
import { t, type ClaveCopy } from "@/lib/copy";

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

/** Los avisos que esta pantalla sabe dar. Un `?estado=` inventado no pinta nada. */
const AVISOS: Record<string, ClaveCopy> = {
  corta: "acceso.nuevaCorta",
  repetida: "acceso.nuevaRepetida",
  debil: "acceso.nuevaDebil",
  error: "acceso.nuevaError",
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
  const aviso = avisoDe(AVISOS, estado);

  const nombres = await nombresDeLaBoda();

  return (
    <main className="grid min-h-dvh place-items-center px-margen py-elemento">
      <div className="mx-auto w-full max-w-texto">
        <Etiqueta>{nombres ?? t("meta.titulo")}</Etiqueta>
        <Titulo2 como="h1" className="mt-pila">
          {t("acceso.nuevaTitulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("acceso.nuevaDescripcion")}</Cuerpo>

        {aviso ? (
          <p role="alert" className="mt-elemento text-pequeno text-error-tinta">
            {t(aviso, { minimo: LONGITUD_MINIMA_CONTRASENA })}
          </p>
        ) : null}

        <form action={guardarContrasena} className="mt-elemento grid gap-elemento">
          <CampoTexto
            name="contrasena"
            type="password"
            etiqueta={t("acceso.nuevaContrasena")}
            ayuda={t("acceso.nuevaAyuda", { minimo: LONGITUD_MINIMA_CONTRASENA })}
            autoComplete="new-password"
            minLength={LONGITUD_MINIMA_CONTRASENA}
            required
          />
          <div>
            {/* Un doble toque mandaba dos cambios, y el segundo volvía como «repetida». */}
            <BotonEnvio rotuloPendiente={t("acceso.guardando")}>
              {t("acceso.nuevaGuardar")}
            </BotonEnvio>
          </div>
        </form>
      </div>
    </main>
  );
}
