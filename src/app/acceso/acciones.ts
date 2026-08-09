"use server";

import { redirect } from "next/navigation";

import {
  LONGITUD_MINIMA_CONTRASENA,
  RUTA_ACCESO,
  RUTA_CONFIRMAR_ACCESO,
  RUTA_NUEVA_CONTRASENA,
  RUTA_PANEL,
  RUTA_RECUPERAR,
} from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * ENTRAR AL PANEL
 *
 * Correo y contraseña. Los usuarios se crean a mano —son dos— y los registros
 * están cerrados, así que aquí nadie se da de alta: solo se identifica.
 *
 * Son Server Actions y los formularios son `<form>` de verdad, así que
 * funcionan sin JavaScript. No es purismo: conviene que la puerta de entrada
 * dependa de lo menos posible.
 *
 * UN SOLO MENSAJE DE ERROR. Correo que no existe y contraseña incorrecta
 * responden lo mismo. Distinguirlos convertiría esta página en un comprobador
 * de qué correos tienen acceso al panel, que es justo la lista que no interesa
 * repartir.
 */

/** El destino al que vuelven los enlaces del correo de recuperación. */
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

export async function entrar(datos: FormData) {
  const correo = String(datos.get("correo") ?? "").trim();
  const contrasena = String(datos.get("contrasena") ?? "");

  if (!correo || !contrasena) redirect(`${RUTA_ACCESO}?estado=credenciales`);

  if (!hayAutenticacion) {
    console.error("Acceso pedido sin Supabase configurado.");
    redirect(`${RUTA_ACCESO}?estado=sin-configurar`);
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });

    if (error) {
      // Se registra el motivo real —hace falta para investigar— pero no viaja
      // a la pantalla.
      console.warn("Intento de acceso rechazado:", error.message);
      redirect(`${RUTA_ACCESO}?estado=credenciales`);
    }

    // AUTENTICADO NO ES CON ACCESO. Supabase ya ha dicho que esta persona es
    // dueña de su correo y sabe su contraseña; quién entra al panel lo decide
    // `perfiles`. Sin perfil activo se le cierra la sesión aquí mismo: si no,
    // se quedaría con una sesión que no sirve para nada y rebotando en la
    // puerta sin entender por qué.
    //
    // El mensaje es el MISMO que el de contraseña incorrecta. Uno propio
    // permitiría averiguar qué correos existen probando.
    const { data } = await supabase
      .from("perfiles")
      .select("activo")
      .eq("usuario_id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();

    if (!data?.activo) {
      await supabase.auth.signOut();
      redirect(`${RUTA_ACCESO}?estado=credenciales`);
    }
  } catch (error) {
    // `redirect` funciona lanzando: si no se deja pasar, el fallo de arriba se
    // tragaría aquí y la página se quedaría colgada sin decir nada.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error) throw error;

    console.error("No se pudo comprobar el acceso:", error);
    redirect(`${RUTA_ACCESO}?estado=error`);
  }

  redirect(RUTA_PANEL);
}

/**
 * Pide el enlace para poner una contraseña nueva.
 *
 * Sin esto, olvidar la contraseña deja a alguien fuera para siempre. Responde
 * lo mismo exista o no el correo, por la misma razón que el acceso.
 */
export async function pedirRecuperacion(datos: FormData) {
  const correo = String(datos.get("correo") ?? "").trim();

  if (!correo) redirect(`${RUTA_RECUPERAR}?estado=credenciales`);

  if (!hayAutenticacion) {
    console.error("Recuperación pedida sin Supabase configurado.");
    redirect(`${RUTA_RECUPERAR}?estado=sin-configurar`);
  }

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.resetPasswordForEmail(correo, {
      redirectTo: urlDeVuelta(),
    });
    if (error) console.warn("Recuperación rechazada:", error.message);
  } catch (error) {
    console.error("No se pudo pedir la recuperación:", error);
  }

  redirect(`${RUTA_RECUPERAR}?estado=enviado`);
}

/** Guarda la contraseña nueva. Solo funciona con la sesión del enlace abierta. */
export async function guardarContrasena(datos: FormData) {
  const contrasena = String(datos.get("contrasena") ?? "");

  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    redirect(`${RUTA_NUEVA_CONTRASENA}?estado=corta`);
  }

  if (!hayAutenticacion) redirect(`${RUTA_ACCESO}?estado=sin-configurar`);

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.updateUser({ password: contrasena });

    if (error) {
      console.warn("No se pudo cambiar la contraseña:", error.message);
      redirect(`${RUTA_NUEVA_CONTRASENA}?estado=error`);
    }
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    console.error("Fallo al cambiar la contraseña:", error);
    redirect(`${RUTA_NUEVA_CONTRASENA}?estado=error`);
  }

  redirect(RUTA_PANEL);
}

/** Cierra la sesión y devuelve a la página de acceso. */
export async function cerrarSesion() {
  if (hayAutenticacion) {
    const supabase = await clienteServidor();
    await supabase.auth.signOut();
  }
  redirect(RUTA_ACCESO);
}
