/**
 * LOS E2E SÓLO HABLAN CON UNA BASE LOCAL
 *
 * Varios specs hacen con `DATABASE_URL` cosas que en producción serían un
 * desastre: revocan permisos a `authenticated` para simular una caída, apagan
 * secciones de la landing, mueven el plazo del RSVP, borran filas por su
 * prefijo. Y `DATABASE_URL` es justo el nombre de la variable que la copia de
 * seguridad usa para la base de PRODUCCIÓN: basta con tenerla exportada en la
 * terminal para que `npx playwright test` la use.
 *
 * Así que la suite se niega a arrancar si la base no está en esta máquina. No
 * hay interruptor para saltárselo: el CI siempre levanta la suya en 127.0.0.1.
 */
const MAQUINAS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function esBaseLocal(cadena: string): boolean {
  try {
    return MAQUINAS_LOCALES.has(new URL(cadena).hostname);
  } catch {
    // Una cadena que no se entiende no se da por local.
    return false;
  }
}

/** Lanza si hay `DATABASE_URL` y no es local. Sin ella, los specs se saltan solos. */
export function exigirBaseLocal(cadena: string | undefined): void {
  if (cadena && !esBaseLocal(cadena)) {
    throw new Error(
      "DATABASE_URL apunta a una base que no está en esta máquina. Los E2E " +
        "revocan permisos y borran filas: no se ejecutan contra ella.",
    );
  }
}
