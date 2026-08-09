"use server";

import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_CONFIRMAR_ACCESO } from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * PEDIR EL ENLACE DE ACCESO
 *
 * Es una Server Action y el formulario es un `<form>` de verdad, así que
 * funciona sin JavaScript. No es purismo: si el panel falla justo el día de la
 * boda, con mala cobertura y un móvil prestado, conviene que dependa de lo
 * menos posible.
 *
 * LA RESPUESTA ES SIEMPRE LA MISMA. Da igual que el correo tenga acceso, que no
 * exista o que Supabase lo rechace por tener los registros cerrados: se
 * responde lo mismo. Distinguirlos convertiría esta página en un comprobador de
 * quién tiene acceso al panel — y esa lista son dos personas concretas.
 */

/** El destino al que vuelve el enlace del correo. */
function urlDeVuelta(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);

  if (!base) {
    throw new Error(
      "Falta NEXT_PUBLIC_SITE_URL: sin ella el enlace del correo no sabría a dónde volver.",
    );
  }

  return new URL(RUTA_CONFIRMAR_ACCESO, base).toString();
}

export async function pedirEnlace(datos: FormData) {
  const correo = String(datos.get("correo") ?? "").trim();

  if (!correo) redirect(`${RUTA_ACCESO}?estado=vacio`);

  if (!hayAutenticacion) {
    console.error("Acceso pedido sin Supabase configurado.");
    redirect(`${RUTA_ACCESO}?estado=sin-configurar`);
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.signInWithOtp({
      email: correo,
      options: {
        emailRedirectTo: urlDeVuelta(),
        // Con los registros cerrados esto ya es redundante, pero se deja
        // explícito: pedir un enlace nunca puede crear una cuenta.
        shouldCreateUser: false,
      },
    });

    // El error se registra pero NO cambia lo que se le enseña a quien lo pide:
    // «este correo no existe» es exactamente el dato que no se puede soltar.
    if (error) console.warn("Solicitud de enlace rechazada:", error.message);
  } catch (error) {
    console.error("No se pudo pedir el enlace de acceso:", error);
  }

  redirect(`${RUTA_ACCESO}?estado=enviado`);
}

/** Cierra la sesión y devuelve a la página de acceso. */
export async function cerrarSesion() {
  if (hayAutenticacion) {
    const supabase = await clienteServidor();
    await supabase.auth.signOut();
  }
  redirect(RUTA_ACCESO);
}
