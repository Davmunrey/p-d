import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Boton, BotonEnlace } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { RUTA_PANEL } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { t } from "@/lib/copy";

import { pedirEnlace } from "./acciones";

/**
 * ENTRAR AL PANEL
 *
 * Sin contraseñas: son dos personas, y una contraseña más es una contraseña más
 * que se acaba reutilizando. Se pide el correo, llega un enlace, se entra.
 *
 * El formulario es un `<form>` con Server Action, así que funciona sin
 * JavaScript. No es purismo: conviene que la puerta de entrada dependa de lo
 * menos posible.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("acceso.titulo"),
  // Esta página no tiene nada que hacer en un buscador.
  robots: { index: false, follow: false },
};

type Estado = "enviado" | "enlace-invalido" | "sin-configurar" | "vacio";

const MENSAJES: Record<Estado, string> = {
  enviado: t("acceso.comprobadCorreo"),
  "enlace-invalido": t("acceso.errorEnlace"),
  "sin-configurar": t("acceso.sinConfigurar"),
  vacio: t("errores.campoObligatorio"),
};

export default async function PaginaAcceso({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  // Con sesión válida no hay nada que pedir: dentro.
  if (await accesoActual()) redirect(RUTA_PANEL);

  const { estado } = await searchParams;
  const clave = (estado ?? "") as Estado;
  const mensaje = clave in MENSAJES ? MENSAJES[clave] : null;
  const enviado = clave === "enviado";

  return (
    <main className="grid min-h-dvh place-items-center px-interno py-elemento">
      <div className="mx-auto w-full max-w-texto">
        <Etiqueta>{t("meta.titulo")}</Etiqueta>
        <Titulo2 como="h1" className="mt-pila">
          {t("acceso.titulo")}
        </Titulo2>

        {enviado ? (
          <div className="mt-elemento rounded-tarjeta border border-borde bg-superficie-hundida p-elemento">
            {/*
              `role="status"` para que un lector de pantalla anuncie el cambio:
              sin él, quien no ve la pantalla envía el formulario y no se entera
              de que ha pasado algo.
            */}
            <p role="status" className="font-titulo text-titulo-3">
              {mensaje}
            </p>
            <Cuerpo className="mt-linea">{t("acceso.comprobadCorreoTexto")}</Cuerpo>
          </div>
        ) : (
          <>
            <Cuerpo className="mt-pila">{t("acceso.descripcion")}</Cuerpo>

            {mensaje ? (
              <p role="alert" className="mt-elemento text-pequeno text-error-tinta">
                {mensaje}
              </p>
            ) : null}

            <form action={pedirEnlace} className="mt-elemento grid gap-elemento">
              <CampoTexto
                name="correo"
                type="email"
                etiqueta={t("acceso.correo")}
                autoComplete="email"
                required
                // El teclado del móvil sin mayúsculas ni autocorrección: un
                // correo corregido a mano es un correo que no llega.
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <div>
                <Boton type="submit">{t("acceso.enviar")}</Boton>
              </div>
            </form>
          </>
        )}

        <div className="mt-bloque">
          <BotonEnlace href="/" jerarquia="terciario">
            {t("acceso.volverALaWeb")}
          </BotonEnlace>
        </div>
      </div>
    </main>
  );
}
