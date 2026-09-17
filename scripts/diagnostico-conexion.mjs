/**
 * QUÉ DECIRLE A QUIEN LEA EL REGISTRO CUANDO LA BASE NO CONTESTA
 *
 * El mensaje del toque daba por hecho que un fallo de conexión era el proyecto
 * pausado, y mandó a mirar al sitio equivocado durante dos semanas: el proyecto
 * estaba despierto y lo que fallaba era la RED. `DATABASE_URL` apuntaba a la
 * conexión directa de Supabase (`db.<ref>.supabase.co`), que se sirve sólo por
 * IPv6, y un runner de GitHub sólo tiene IPv4. El registro decía «lo más
 * probable es que Supabase lo haya pausado» justo encima de un
 * `ENETUNREACH 2a05:d014:…`, que es exactamente lo contrario de lo que pasaba.
 *
 * VIVE EN SU PROPIO FICHERO para poder probarlo. El guion del toque usa `await`
 * de primer nivel, así que no se puede envolver en un `if` que evite ejecutarlo
 * al importarlo; sacando la decisión aquí, el test comprueba las dos ramas sin
 * abrir una sola conexión y sin depender de si la máquina tiene IPv6.
 *
 * Es el mismo aviso que ya da `scripts/aplicar-migraciones.sh` cuando se topa
 * con esto, y por el mismo motivo: sin él, quien lo ve revisa la contraseña
 * tres veces antes de sospechar de la red.
 */

/** Los códigos con los que el sistema dice «no he llegado», no «me han dicho que no». */
const DE_RED = /ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND/;

export function diagnosticoDeConexion(error) {
  const codigo = (error && error.code) || "";
  const texto = error instanceof Error ? error.message : String(error);

  if (DE_RED.test(`${codigo} ${texto}`)) {
    return [
      "No se ha llegado a la base, y ESTO ES LA RED, no el proyecto.",
      "",
      "La conexión DIRECTA de Supabase (db.<ref>.supabase.co) se sirve sólo por",
      "IPv6, y un runner de GitHub sólo tiene IPv4. Hace falta la cadena del",
      "AGRUPADOR, que sí tiene IPv4:",
      "",
      "  Supabase → Project Settings → Database → Connection string",
      "  → pestaña «Session pooler» (no «Direct connection»)",
      "",
      "Tiene esta forma, con la región dentro del nombre:",
      "  postgresql://postgres.<ref>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres",
    ].join("\n");
  }

  return (
    "No se ha podido leer de la base. Si el proyecto es del plan gratuito, " +
    "lo más probable es que Supabase lo haya pausado y haya que reactivarlo " +
    "a mano desde su panel."
  );
}
