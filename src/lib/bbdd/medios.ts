import "server-only";

import { SECCIONES, type Seccion } from "@/config/secciones";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-29 · LOS MEDIOS, DESDE EL PANEL
 *
 * La landing lee `medios` como anónimo y sólo ve lo publicado (ver
 * `obtenerMedios` en `landing.ts`). Esta lectura es la otra mitad: la de quien
 * organiza, que necesita ver TAMBIÉN los borradores — porque un borrador es
 * precisamente lo que está a punto de decidir.
 *
 * VA POR EL CLIENTE DE SUPABASE CON LA SESIÓN DE QUIEN MIRA, como el resto del
 * panel. `medios_colaborador_leer` exige `puede_leer()`, así que la base
 * decide: sin perfil activo esta consulta devuelve cero filas, no un error.
 *
 * SE DEVUELVE AGRUPADO POR SECCIÓN Y NO EN UNA LISTA PLANA. La pregunta que se
 * hace delante de esta pantalla nunca es «¿qué fotos hay?», es «¿qué se ve en
 * la portada?». Aplanarlo obligaría a que la pantalla reagrupara, y entonces el
 * orden de las secciones lo decidiría un `sort` de la vista en vez del
 * enumerado de la base.
 */

export interface MedioDelPanel {
  id: string;
  ruta: string;
  posterRuta: string | null;
  textoAlternativo: string;
  seccion: Seccion;
  orden: number | null;
  ancho: number | null;
  alto: number | null;
  tipo: "imagen" | "video";
  publicado: boolean;
}

/** Una sección con lo suyo dentro, en el orden en que se va a ver en la web. */
export interface SeccionConMedios {
  seccion: Seccion;
  medios: MedioDelPanel[];
}

interface FilaMedio {
  id: string;
  ruta_almacenamiento: string;
  poster_ruta: string | null;
  texto_alternativo: Record<string, string> | null;
  seccion: Seccion;
  orden: number | null;
  ancho: number | null;
  alto: number | null;
  tipo: "imagen" | "video";
  publicado: boolean;
}

/**
 * El texto alternativo es `jsonb` por idioma. La boda es sólo en castellano
 * —decisión cerrada en el plan maestro—, así que se saca `es` y se cae al
 * primer valor que haya: una alternativa en otro idioma sigue siendo mejor que
 * ninguna, y aquí además hay que poder EDITAR lo que se cargó mal.
 */
function leerAlternativo(valor: Record<string, string> | null): string {
  return valor?.es ?? Object.values(valor ?? {})[0] ?? "";
}

/**
 * Todo lo subido, agrupado por sección y en su orden.
 *
 * SE DEVUELVEN TAMBIÉN LAS SECCIONES VACÍAS. Una sección sin fotos no es un
 * hueco que haya que esconder: es el sitio donde se sube la primera. Sin ella
 * en la lista no habría dónde pulsar «subir» para la portada, que es justo la
 * que hoy está sin foto.
 */
export async function obtenerMediosDelPanel(): Promise<SeccionConMedios[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("medios")
    .select(
      "id, ruta_almacenamiento, poster_ruta, texto_alternativo, seccion, orden, ancho, alto, tipo, publicado",
    )
    .order("seccion")
    .order("orden", { nullsFirst: false })
    .order("creado_en");

  if (error) {
    console.error("No se pudieron leer los medios:", error);
    throw new Error("No se pudieron leer los medios.");
  }

  const porSeccion = new Map<Seccion, MedioDelPanel[]>(
    SECCIONES.map((seccion) => [seccion, []]),
  );

  for (const fila of (data ?? []) as FilaMedio[]) {
    porSeccion.get(fila.seccion)?.push({
      id: fila.id,
      ruta: fila.ruta_almacenamiento,
      posterRuta: fila.poster_ruta,
      textoAlternativo: leerAlternativo(fila.texto_alternativo),
      seccion: fila.seccion,
      orden: fila.orden,
      ancho: fila.ancho,
      alto: fila.alto,
      tipo: fila.tipo,
      publicado: fila.publicado,
    });
  }

  // El orden de las secciones es el del enumerado, no el alfabético de SQL.
  return SECCIONES.map((seccion) => ({ seccion, medios: porSeccion.get(seccion) ?? [] }));
}
