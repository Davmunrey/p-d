import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { RUTA_ACCESO, RUTA_NUEVA_CONTRASENA, RUTA_PANEL } from "@/config/constants";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

/**
 * LA VUELTA DEL ENLACE DE RECUPERACIÓN
 *
 * Aquí se canjea el enlace del correo por una sesión, que se deja en cookies
 * `httpOnly`: el secreto del enlace nunca llega a JavaScript de cliente.
 *
 * EL ENLACE LLEGA DE DOS MANERAS, Y LA BUENA ERA LA QUE NO SE LEÍA.
 *
 *   · Con `?code=…` —y `sb_flow_id`—, que es lo que manda la plantilla de serie
 *     de Supabase. `@supabase/ssr` fuerza el flujo PKCE: al pedir la
 *     recuperación, `resetPasswordForEmail` deja en una cookie de ESTE
 *     navegador un verificador, y el correo vuelve con un código que sólo vale
 *     junto a él. Esta ruta sólo leía `token_hash`, así que con la plantilla de
 *     serie todo enlace acababa en «ese enlace ya no vale»: recuperar la
 *     contraseña no funcionaba nunca. Es también lo que promete el aviso de
 *     «abridlo desde este mismo dispositivo».
 *   · Con `?token_hash=…&type=…`, si alguien cambia la plantilla del correo en
 *     el panel de Supabase para mandar el hash directamente.
 *
 * Se redirige siempre, salga bien o mal: así la URL con el secreto desaparece
 * de la barra de direcciones en cuanto se usa.
 */
export const dynamic = "force-dynamic";

/** El parámetro con el que auth-js marca de qué flujo PKCE es el código. */
const PARAMETRO_FLUJO = "sb_flow_id";

export async function GET(peticion: Request) {
  const url = new URL(peticion.url);
  const codigo = url.searchParams.get("code");
  const flujo = url.searchParams.get(PARAMETRO_FLUJO);
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;

  const aAcceso = (motivo: string) =>
    NextResponse.redirect(new URL(`${RUTA_ACCESO}?estado=${motivo}`, url.origin));

  if (!hayAutenticacion) return aAcceso("sin-configurar");
  if (!codigo && (!tokenHash || !tipo)) return aAcceso("enlace-invalido");

  /*
    UN CÓDIGO SIEMPRE ES UNA RECUPERACIÓN. Esta ruta es la vuelta del único
    correo que la web pide —`pedirRecuperacion`, en acceso/acciones.ts— y es el
    único flujo PKCE que empieza aquí. Si un día se manda otro (una invitación
    por correo), también acaba en elegir contraseña, que es lo que necesita
    quien entra por primera vez.
  */
  const esRecuperacion = Boolean(codigo) || tipo === "recovery";

  try {
    const supabase = await clienteServidor();

    if (codigo) {
      const { error } = await supabase.auth.exchangeCodeForSession(
        codigo,
        flujo ? { flowId: flujo } : undefined,
      );
      if (error) {
        // Caducado, ya usado, manipulado o abierto en otro navegador —sin el
        // verificador no hay canje—. Todos acaban igual y con el mismo
        // mensaje: distinguirlos no ayuda a quien entra y sí a quien prueba.
        console.warn("Enlace de acceso rechazado:", error.message);
        return aAcceso("enlace-invalido");
      }
    } else {
      const { error } = await supabase.auth.verifyOtp({ type: tipo!, token_hash: tokenHash! });
      if (error) {
        console.warn("Enlace de acceso rechazado:", error.message);
        return aAcceso("enlace-invalido");
      }
    }
  } catch (error) {
    console.error("Fallo al canjear el enlace de acceso:", error);
    return aAcceso("enlace-invalido");
  }

  // Una recuperación no lleva al panel: lleva a elegir contraseña nueva. Si
  // llevara dentro, el enlace del correo sería una puerta trasera permanente
  // que se salta la contraseña.
  const destino = esRecuperacion ? RUTA_NUEVA_CONTRASENA : RUTA_PANEL;
  return NextResponse.redirect(new URL(destino, url.origin));
}
