import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { RUTA_ACCESO, RUTA_PANEL } from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * LA VUELTA DEL ENLACE DEL CORREO
 *
 * El enlace trae un `token_hash` de un solo uso. Aquí se canjea por una sesión
 * y se deja en cookies `httpOnly`, de modo que el token nunca llega a
 * JavaScript de cliente.
 *
 * Se redirige siempre, salga bien o mal: así la URL con el token desaparece de
 * la barra de direcciones en cuanto se usa.
 */
export const dynamic = "force-dynamic";

export async function GET(peticion: Request) {
  const url = new URL(peticion.url);
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;

  const aAcceso = (motivo: string) =>
    NextResponse.redirect(new URL(`${RUTA_ACCESO}?estado=${motivo}`, url.origin));

  if (!hayAutenticacion) return aAcceso("sin-configurar");
  if (!tokenHash || !tipo) return aAcceso("enlace-invalido");

  try {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });

    if (error) {
      // Caducado, ya usado o manipulado. Los tres acaban igual y con el mismo
      // mensaje: distinguirlos no ayuda a quien entra y sí a quien prueba.
      console.warn("Enlace de acceso rechazado:", error.message);
      return aAcceso("enlace-invalido");
    }
  } catch (error) {
    console.error("Fallo al canjear el enlace de acceso:", error);
    return aAcceso("enlace-invalido");
  }

  // Quien no tenga perfil activo no llegará a ver nada: el panel lo comprueba
  // y RLS lo respalda. Aquí no se decide, solo se entrega la sesión.
  return NextResponse.redirect(new URL(RUTA_PANEL, url.origin));
}
