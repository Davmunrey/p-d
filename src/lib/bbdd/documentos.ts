import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-105 · LOS PAPELES DE LA BODA CIVIL
 *
 * El expediente matrimonial es una lista de certificados que caducan. El de
 * empadronamiento vale tres meses, el literal de nacimiento seis, y el que se
 * pide en enero para una boda de septiembre **no sirve el día de la boda**. Eso
 * no se olvida por descuido: se olvida porque «conseguido» parece el final del
 * camino, y lo parece justo hasta el día en que el juzgado dice que no.
 *
 * DE AHÍ QUE ESTO NO SEA UNA LISTA DE TAREAS. Una casilla de hecho/sin hacer no
 * puede contestar la única pregunta que importa —«¿sigue valiendo el día de la
 * boda?»— porque la respuesta cambia sola con el calendario, sin que nadie
 * toque nada.
 *
 * LA CUENTA LA HACE LA BASE, en `v_documentos_boda`. Comparar aquí la caducidad
 * con la fecha de la boda sería comparar contra el reloj del proceso —UTC en
 * Vercel— y contra una fecha de ceremonia que hay que llevar antes a su zona
 * horaria. Dos oportunidades de equivocarse en un día, en el aviso que
 * justifica el módulo entero.
 *
 * VA POR EL CLIENTE DE SUPABASE CON LA SESIÓN DE QUIEN MIRA, como el resto del
 * panel: RLS tiene que ver *quién* pregunta, y estos papeles son lo más privado
 * que hay en la base — llevan nombres, fechas de nacimiento y de dónde es cada
 * uno.
 */

/**
 * De quién es cada papel, en el orden del enumerado de la base.
 *
 * El orden manda porque `titular_documento` se ordena por el orden en que se
 * declararon sus valores: así un `order by de_quien` en SQL y este desplegable
 * dicen lo mismo. Añadir un titular es una migración, no una línea aquí.
 */
export const TITULARES_DOCUMENTO = ["novia", "novio", "ambos"] as const;

export type TitularDocumento = (typeof TITULARES_DOCUMENTO)[number];

export function esTitularDocumento(valor: string): valor is TitularDocumento {
  return (TITULARES_DOCUMENTO as readonly string[]).includes(valor);
}

/** Las tres fases de un papel, de lo que falta a lo que está. */
export const ESTADOS_DOCUMENTO = ["pendiente", "solicitado", "conseguido"] as const;

export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];

export function esEstadoDocumento(valor: string): valor is EstadoDocumento {
  return (ESTADOS_DOCUMENTO as readonly string[]).includes(valor);
}

/** El estado en el que nace un documento, igual que el `default` de la tabla. */
export const ESTADO_INICIAL_DOCUMENTO: EstadoDocumento = "pendiente";

export interface DocumentoBoda {
  id: string;
  titulo: string;
  deQuien: TitularDocumento;
  dondeSePide: string | null;
  notas: string | null;
  estado: EstadoDocumento;
  /** `2027-03-04` o `null`. Existe si —y sólo si— el estado es `conseguido`. */
  obtenidoEn: string | null;
  /** `null` es «no caduca», que es un caso real: el libro de familia no caduca. */
  caducaEn: string | null;
  /** El día de la ceremonia, leído en su zona. `null` si no hay configuración. */
  fechaBoda: string | null;
  /**
   * LO QUE JUSTIFICA EL MÓDULO: este papel deja de valer antes de la boda.
   *
   * Vale igual estando conseguido — de hecho ahí es cuando de verdad avisa, que
   * es el caso en el que nadie vuelve a mirarlo.
   */
  caducaAntesDeLaBoda: boolean;
}

/** La fila como llega de PostgREST: `snake_case` y sin traducir. */
interface FilaDocumento {
  id: string;
  titulo: string;
  de_quien: string;
  donde_se_pide: string | null;
  notas: string | null;
  estado: string;
  obtenido_en: string | null;
  caduca_en: string | null;
  fecha_boda: string | null;
  caduca_antes_de_la_boda: boolean;
}

function aDocumento(fila: FilaDocumento): DocumentoBoda {
  return {
    id: fila.id,
    titulo: fila.titulo,
    deQuien: fila.de_quien as TitularDocumento,
    dondeSePide: fila.donde_se_pide,
    notas: fila.notas,
    estado: fila.estado as EstadoDocumento,
    obtenidoEn: fila.obtenido_en,
    caducaEn: fila.caduca_en,
    fechaBoda: fila.fecha_boda,
    // La base la devuelve como booleano de verdad. El `Boolean` es por si la
    // vista llegara con `null` desde una configuración a medio poner.
    caducaAntesDeLaBoda: Boolean(fila.caduca_antes_de_la_boda),
  };
}

/**
 * Todos los documentos, con la caducidad ya comparada contra la boda.
 *
 * SE LEE DE LA VISTA Y NO DE LA TABLA. `v_documentos_boda` es donde vive la
 * comparación; pedir la tabla y rehacerla aquí sería un segundo criterio sobre
 * lo mismo, y dos criterios acaban dando dos respuestas distintas el día que
 * alguien mueva la fecha de la boda media hora.
 *
 * Son unos pocos papeles, no miles: se piden de una vez y el orden lo pone la
 * vista —lo que falta primero, y dentro de cada grupo lo que antes deja de
 * valer—.
 */
export async function obtenerDocumentos(): Promise<DocumentoBoda[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase.from("v_documentos_boda").select(
    `id, titulo, de_quien, donde_se_pide, notas, estado, obtenido_en, caduca_en,
       fecha_boda, caduca_antes_de_la_boda`,
  );

  if (error) {
    console.error("No se pudieron leer los documentos de la boda:", error);
    return [];
  }

  return ((data as FilaDocumento[] | null) ?? []).map(aDocumento);
}

/**
 * Los documentos repartidos por estado, en el orden en que se leen.
 *
 * SE AGRUPA AQUÍ Y NO EN LA PANTALLA para que el orden de los grupos salga del
 * enumerado —lo que falta primero— y no de tres filtros escritos a mano en el
 * JSX, que es como un día se cuela «conseguido» arriba del todo y la pantalla
 * deja de contestar «¿qué me queda?».
 */
export function porEstado(
  documentos: DocumentoBoda[],
): { estado: EstadoDocumento; documentos: DocumentoBoda[] }[] {
  return ESTADOS_DOCUMENTO.map((estado) => ({
    estado,
    documentos: documentos.filter((documento) => documento.estado === estado),
  }));
}

/**
 * Los que dejan de valer antes de la boda, estén como estén.
 *
 * Es la lista del aviso de arriba. Se saca de los mismos datos que la lista de
 * abajo —no de una segunda consulta— para que las dos no puedan discrepar.
 */
export function caducanAntesDeLaBoda(documentos: DocumentoBoda[]): DocumentoBoda[] {
  return documentos.filter((documento) => documento.caducaAntesDeLaBoda);
}
