import "server-only";

import { ORIGEN_DE_LA_SECCION } from "@/config/contenido-landing";
import { SECCIONES, esSeccionConocida, type Seccion } from "@/config/secciones";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-128 · EL ESTADO DE LAS SECCIONES DE LA LANDING, PARA EL PANEL
 *
 * Dos preguntas por sección, y las dos hacen falta: **¿está encendida?** y
 * **¿tiene algo que enseñar?**. Con la primera sola, el interruptor miente —la
 * landing oculta lo vacío, así que encender una sección sin contenido no
 * cambia nada y nadie entiende por qué—.
 *
 * VA POR EL CLIENTE DE SUPABASE CON LA SESIÓN DE QUIEN MIRA, como el resto del
 * panel, y no por SQL directo como la landing. La diferencia importa: las
 * lecturas públicas corren con `set local role anon`, y `anon` sólo ve las
 * secciones VISIBLES (`secciones_landing_publica_leer` es `using (visible)`).
 * Preguntándole a él, una sección apagada no existiría — que es justo la que
 * hay que poder encender.
 *
 * SE CUENTA LO PUBLICADO, no todo lo que hay. El número que interesa en esta
 * pantalla no es «cuántas filas tiene la tabla» sino «aparecerá la sección»,
 * y para eso lo que manda es lo publicado, que es lo único que llega a la web.
 *
 * NO LANZA. Un recuento que no se pudo hacer vale `null` y la pantalla lo dice
 * —«no se puede saber»— en lugar de inventarse un cero, que se leería como
 * «está vacía» y mandaría a escribir algo que ya estaba escrito.
 */

export interface EstadoDeSeccion {
  seccion: Seccion;
  visible: boolean;
  orden: number;
  /** Elementos publicados. `null` cuando la sección no se cuenta por elementos. */
  elementos: number | null;
  /**
   * ¿Hay con qué pintarla hoy? `null` cuando no se ha podido averiguar: pasa
   * con `regalos`, cuyo IBAN vive en `configuracion_privada` y sólo lo lee un
   * editor.
   */
  llena: boolean | null;
}

/** La fila cruda de `secciones_landing`. */
interface FilaSeccion {
  seccion: string;
  visible: boolean;
  orden: number;
}

export async function obtenerEstadoDeLasSecciones(): Promise<EstadoDeSeccion[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("secciones_landing")
    .select("seccion, visible, orden")
    .order("orden");

  if (error) {
    console.error("No se pudieron leer las secciones de la landing:", error.message);
    return [];
  }

  const filas = (data ?? []) as FilaSeccion[];

  /*
    UNA SECCIÓN QUE EL FRONTEND NO CONOCE SE DESCARTA CON UN AVISO, igual que
    hace `obtenerSecciones()` para la web pública: la base de datos puede ir por
    delante de un despliegue, y eso no puede tumbar el panel.
  */
  const conocidas = filas.filter((fila) => {
    if (esSeccionConocida(fila.seccion)) return true;
    console.warn(
      `Sección desconocida en secciones_landing: "${fila.seccion}". Se omite; ` +
        "probablemente la base de datos va por delante del despliegue.",
    );
    return false;
  });

  /*
    Y AL REVÉS: si a la base le falta una fila que el enumerado sí tiene, la
    pantalla la enseña igualmente, apagada y al final. Callársela dejaría una
    sección invisible para siempre y sin forma de encenderla, que es el fallo
    que este módulo viene a arreglar.
  */
  const presentes = new Set(conocidas.map((fila) => fila.seccion));
  const ausentes: FilaSeccion[] = SECCIONES.filter((seccion) => !presentes.has(seccion)).map(
    (seccion) => ({ seccion, visible: false, orden: Number.MAX_SAFE_INTEGER }),
  );

  const todas = [...conocidas, ...ausentes] as {
    seccion: Seccion;
    visible: boolean;
    orden: number;
  }[];

  // Las consultas de recuento van todas a la vez: son una por sección y sobre
  // tablas de pocas filas, pero encadenadas serían dieciséis saltos de red.
  return Promise.all(
    todas.map(async (fila) => {
      const { elementos, llena } = await medirLaSeccion(supabase, fila.seccion);
      return {
        seccion: fila.seccion,
        visible: fila.visible,
        orden: fila.orden,
        elementos,
        llena,
      };
    }),
  );
}

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/** Cuánto contenido tiene una sección, según lo que la llena. */
async function medirLaSeccion(
  supabase: Cliente,
  seccion: Seccion,
): Promise<{ elementos: number | null; llena: boolean | null }> {
  const origen = ORIGEN_DE_LA_SECCION[seccion];

  if (origen.clase === "sola") return { elementos: null, llena: true };
  if (origen.clase === "sin-hacer") return { elementos: null, llena: false };

  if (origen.clase === "lista") {
    let consulta = supabase
      .from(origen.tabla)
      .select("*", { count: "exact", head: true })
      .eq("publicado", true);

    if (origen.filtro) consulta = consulta.eq(origen.filtro.columna, origen.filtro.valor);

    const { count, error } = await consulta;

    if (error) {
      console.error(`No se pudo contar ${origen.tabla} para «${seccion}»:`, error.message);
      return { elementos: null, llena: null };
    }

    return { elementos: count ?? 0, llena: (count ?? 0) > 0 };
  }

  /*
    Clase «campo»: la sección se pinta si ese dato está escrito. `maybeSingle`
    y no `single` porque la fila puede no existir todavía —una instalación
    recién hecha—, y eso no es un error: es que no hay nada escrito.
  */
  const { data, error } = await supabase
    .from(origen.tabla)
    .select(origen.campo)
    .limit(1)
    .maybeSingle();

  if (error) {
    /*
      Cero filas por RLS llega aquí como dato vacío, no como error; un error de
      verdad sí se registra. En los dos casos se devuelve `null`, que la
      pantalla traduce a «no se puede saber» en vez de a «está vacía».
    */
    console.error(`No se pudo leer ${origen.tabla}.${origen.campo}:`, error.message);
    return { elementos: null, llena: null };
  }

  if (!data) return { elementos: null, llena: null };

  /*
    El `select` lleva un nombre de columna calculado, así que supabase-js no
    puede inferir la forma de la fila y la tipa como su error genérico. Se pasa
    por `unknown` a propósito, que es lo que pide TypeScript para reconocer que
    aquí sabemos algo que él no.
  */
  const fila = data as unknown as Record<string, unknown>;
  const valor = fila[origen.campo];
  return { elementos: null, llena: valor !== null && valor !== undefined && valor !== "" };
}
