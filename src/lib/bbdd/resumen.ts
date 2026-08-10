import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * LOS NÚMEROS DE LA BODA
 *
 * Salen de dos vistas que ya existían y que nadie consultaba:
 * `v_estadisticas_invitados` y `v_menus_confirmados`. Las dos van con
 * `security_invoker = on`, así que se ejecutan con los permisos de quien
 * pregunta — un lector ve los mismos números que un propietario porque puede
 * leer las mismas filas, no porque la vista se lo regale.
 *
 * NO SE CUENTA AQUÍ NADA QUE SEPA CONTAR LA BASE. Las vistas hacen el
 * `count(*) filter (...)` en una sola pasada; traerse las filas y contarlas en
 * JavaScript sería bajarse ciento veinte confirmaciones para acabar con siete
 * números.
 */

export interface EstadisticasInvitados {
  personas: number;
  confirmados: number;
  adultosConfirmados: number;
  ninosConfirmados: number;
  rechazados: number;
  pendientes: number;
  plazasAutobus: number;
  necesitanAlojamiento: number;
}

export interface MenuConfirmado {
  tipoMenu: string;
  personas: number;
  conAlergias: number;
}

export interface ResumenBoda {
  invitados: EstadisticasInvitados;
  menus: MenuConfirmado[];
}

/** Un número que la base devuelve como cadena —los `count()` son `bigint`—. */
const cuenta = (valor: unknown): number => Number(valor ?? 0);

export async function obtenerResumen(): Promise<ResumenBoda> {
  const supabase = await clienteServidor();

  const [estadisticas, menus] = await Promise.all([
    supabase.from("v_estadisticas_invitados").select("*").maybeSingle(),
    supabase.from("v_menus_confirmados").select("*").order("personas", { ascending: false }),
  ]);

  if (estadisticas.error) {
    throw new Error(`No se pudieron leer los números: ${estadisticas.error.message}`);
  }
  if (menus.error) {
    throw new Error(`No se pudieron leer los menús: ${menus.error.message}`);
  }

  // Sin invitados la vista no devuelve fila, no devuelve ceros. Es un dato
  // —«todavía no hay nadie»— y la pantalla lo cuenta como tal.
  const fila = estadisticas.data as Record<string, unknown> | null;

  return {
    invitados: {
      personas: cuenta(fila?.personas),
      confirmados: cuenta(fila?.confirmados),
      adultosConfirmados: cuenta(fila?.adultos_confirmados),
      ninosConfirmados: cuenta(fila?.ninos_confirmados),
      rechazados: cuenta(fila?.rechazados),
      // Tentativo cuenta como pendiente: lo que importa es si ya se sabe el
      // número o todavía no.
      pendientes: cuenta(fila?.pendientes) + cuenta(fila?.tentativos),
      plazasAutobus: cuenta(fila?.plazas_autobus),
      necesitanAlojamiento: cuenta(fila?.necesitan_alojamiento),
    },
    menus: ((menus.data ?? []) as Record<string, unknown>[]).map((menu) => ({
      tipoMenu: String(menu.tipo_menu),
      personas: cuenta(menu.personas),
      conAlergias: cuenta(menu.con_alergias),
    })),
  };
}
