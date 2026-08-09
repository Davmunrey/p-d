import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton, BotonEnlace } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { PARAMETRO_VOLVER, RUTA_PANEL, RUTA_RECUPERAR } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { t } from "@/lib/copy";

import { entrar } from "./acciones";

/**
 * ENTRAR AL PANEL
 *
 * Correo y contraseña. El formulario es un `<form>` con Server Action, así que
 * funciona sin JavaScript: conviene que la puerta de entrada dependa de lo
 * menos posible.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("acceso.titulo"),
  robots: { index: false, follow: false },
};

const MENSAJES: Record<string, string> = {
  // Los tres primeros dicen lo mismo a propósito: correo que no existe,
  // contraseña incorrecta y perfil desactivado no se pueden distinguir desde
  // fuera sin convertir esta página en un comprobador de quién tiene acceso.
  credenciales: t("acceso.errorCredenciales"),
  "sin-acceso": t("acceso.errorSinAcceso"),
  error: t("acceso.errorGenerico"),
  "sin-configurar": t("acceso.sinConfigurar"),
  "enlace-invalido": t("acceso.errorEnlace"),
};

export default async function PaginaAcceso({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; [PARAMETRO_VOLVER]?: string }>;
}) {
  // Con sesión válida no hay nada que pedir: dentro.
  if (await accesoActual()) redirect(RUTA_PANEL);

  const parametros = await searchParams;
  const estado = parametros.estado;
  const mensaje = estado && estado in MENSAJES ? MENSAJES[estado] : null;

  // A dónde quería ir quien llegó aquí rebotado por el middleware. Viaja en un
  // campo oculto porque el formulario tiene que funcionar sin JavaScript: no
  // hay forma de leerlo al enviar si no va dentro del propio `<form>`. Se
  // acepta o se descarta en `entrar()`, que es quien puede: aquí solo se pasa.
  const volver = parametros[PARAMETRO_VOLVER];

  return (
    <main className="grid min-h-dvh place-items-center px-interno py-elemento">
      <div className="mx-auto w-full max-w-texto">
        <Etiqueta>{t("meta.titulo")}</Etiqueta>
        <Titulo2 como="h1" className="mt-pila">
          {t("acceso.titulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("acceso.descripcion")}</Cuerpo>

        {mensaje ? (
          <p role="alert" className="mt-elemento text-pequeno text-error-tinta">
            {mensaje}
          </p>
        ) : null}

        <form action={entrar} className="mt-elemento grid gap-elemento">
          {volver ? <input type="hidden" name={PARAMETRO_VOLVER} value={volver} /> : null}
          <CampoTexto
            name="correo"
            type="email"
            etiqueta={t("acceso.correo")}
            autoComplete="username"
            required
            // Sin autocapitalización ni autocorrección: el teclado del móvil
            // escribe «Paloma@…» y el acceso falla sin que se vea por qué.
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <CampoTexto
            name="contrasena"
            type="password"
            etiqueta={t("acceso.contrasena")}
            autoComplete="current-password"
            required
          />
          <div className="flex flex-wrap items-center gap-elemento">
            <Boton type="submit">{t("acceso.entrar")}</Boton>
            <Link
              href={RUTA_RECUPERAR}
              className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave transicion-color hover:text-tinta"
            >
              {t("acceso.olvidada")}
            </Link>
          </div>
        </form>

        <div className="mt-bloque">
          <BotonEnlace href="/" jerarquia="terciario">
            {t("acceso.volverALaWeb")}
          </BotonEnlace>
        </div>
      </div>
    </main>
  );
}
