import { CLAVE_ALMACEN_DIA } from "@/config/constants";

/**
 * BODA-100 (#67) · LA COLA DE MARCAS QUE TODAVÍA NO HA VISTO EL SERVIDOR
 *
 * Es el almacén de lo que se marca sin cobertura. Vive fuera del componente —y
 * fuera de React— por dos razones, y las dos son de fondo:
 *
 * 1 · `localStorage` NO EXISTE EN EL SERVIDOR. El guion se pinta en el servidor
 *     para la primera carga, así que leer el almacén durante el render daría un
 *     HTML distinto al del navegador y React lo cantaría como error de
 *     hidratación. Leerlo después con un `useEffect` que llama a `setState`
 *     arregla el HTML pero encadena un render extra en cada montaje, que es
 *     justo lo que `react-hooks/set-state-in-effect` prohíbe con razón.
 *
 * 2 · `useSyncExternalStore` está hecho exactamente para esto: una fuente de
 *     verdad que no es React —aquí, el almacén del navegador— con una foto para
 *     el servidor y otra para el cliente. React acepta que las dos difieran y
 *     repinta después de hidratar, sin avisos y sin render de más.
 *
 * LA INSTANTÁNEA TIENE QUE SER ESTABLE. `useSyncExternalStore` compara con
 * `Object.is`, así que devolver un `JSON.parse` nuevo en cada llamada sería un
 * bucle infinito de renders. Por eso lo leído se guarda en `memoria` y sólo
 * cambia de identidad cuando cambia de verdad.
 */

/** Qué punto y a qué hora se marcó. `null` es «se desmarcó». */
export type ColaDeMarcas = Record<string, string | null>;

/** La misma foto siempre para el servidor: allí no hay nada marcado sin mandar. */
const VACIA: ColaDeMarcas = {};

/** `null` mientras no se haya leído el almacén ni una vez. */
let memoria: ColaDeMarcas | null = null;

const oyentes = new Set<() => void>();

function leerDelAlmacen(): ColaDeMarcas {
  try {
    const guardado = window.localStorage.getItem(CLAVE_ALMACEN_DIA);
    const leido: unknown = guardado ? JSON.parse(guardado) : null;
    return leido && typeof leido === "object" ? (leido as ColaDeMarcas) : VACIA;
  } catch {
    /*
      UN ALMACÉN ILEGIBLE NO PUEDE TUMBAR LA PANTALLA. `localStorage` lanza en
      la navegación privada de Safari, y el JSON puede estar a medias si el
      móvil se apagó escribiendo. En los dos casos se empieza de cero: es peor
      que recuperar la cola, e infinitamente mejor que un guion en blanco el día
      de la boda.
    */
    return VACIA;
  }
}

function escribirEnElAlmacen(cola: ColaDeMarcas): void {
  try {
    window.localStorage.setItem(CLAVE_ALMACEN_DIA, JSON.stringify(cola));
  } catch {
    // Si no se puede escribir, la marca vive en memoria y se manda igual. Se
    // pierde sólo si además se recarga, que ya son dos desgracias seguidas.
  }
}

export function instantanea(): ColaDeMarcas {
  memoria ??= leerDelAlmacen();
  return memoria;
}

export function instantaneaDelServidor(): ColaDeMarcas {
  return VACIA;
}

export function suscribirse(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  /*
    OTRA PESTAÑA TAMBIÉN CUENTA. `storage` salta cuando el mismo panel está
    abierto en dos sitios —el móvil de cada uno, que es el caso normal ese día—
    y así lo que marca uno aparece en la pantalla del otro sin recargar.
  */
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

function fijar(cola: ColaDeMarcas): void {
  memoria = cola;
  escribirEnElAlmacen(cola);
  for (const oyente of oyentes) oyente();
}

/** Apunta una marca como pendiente de mandar. */
export function apuntar(id: string, marca: string | null): void {
  fijar({ ...instantanea(), [id]: marca });
}

/**
 * Saca de la cola lo que ya se ha mandado (o lo que no se va a mandar nunca).
 *
 * SÓLO SI SIGUE SIENDO LO QUE SE MANDÓ. Se recibe el par `[id, marca]` y no el
 * id a secas: entre lanzar la petición y recibir la respuesta, el mismo punto
 * puede haberse vuelto a tocar —marcar por error y desmarcar en el acto pasa
 * constantemente, y en la finca las respuestas tardan segundos—. Soltar por id
 * tiraba la marca NUEVA cuando volvía la respuesta de la VIEJA: la pantalla
 * saltaba sola a «hecho», el aviso de pendientes desaparecía, y si la segunda
 * petición fallaba no quedaba nada que reintentar. Lo último que hizo quien
 * marcaba se perdía sin un solo aviso.
 */
export function soltar(mandadas: readonly (readonly [string, string | null])[]): void {
  if (mandadas.length === 0) return;

  const quedan: ColaDeMarcas = {};
  for (const [clave, marca] of Object.entries(instantanea())) {
    const mandada = mandadas.find(([id]) => id === clave);
    if (!mandada || mandada[1] !== marca) quedan[clave] = marca;
  }
  fijar(quedan);
}

/**
 * QUÉ MARCA SE PINTA, ENTRE LAS TRES QUE PUEDE HABER.
 *
 * Es una función pura y vive aquí, fuera del componente, por lo mismo que la
 * permuta de las listas de contenido: es la regla que decide lo que se ve, el
 * fallo no da error y sólo se nota mirando la pantalla en el momento justo.
 * Probarla aquí cuesta milisegundos; probarla en el navegador exige un Supabase
 * levantado y acertar con el instante.
 *
 * EL ORDEN ES EL QUE ES, y cada capa está por un motivo:
 *
 *   1 · `cola` — lo marcado y todavía SIN MANDAR. Manda sobre todo lo demás:
 *       es lo que se acaba de tocar y lo que sobrevive a recargar.
 *   2 · `confirmadas` — lo que el servidor YA ACEPTÓ en esta sesión. Sin esta
 *       capa la marca se borraba sola justo al confirmarse: salía de la cola y
 *       la pantalla caía de vuelta al valor con el que se pintó, que es de
 *       antes. Marcabas «Ceremonia» y medio segundo después se desmarcaba.
 *   3 · `delServidor` — lo que había en la base al pintar. Es a donde vuelve una
 *       marca que el servidor RECHAZÓ, que es lo correcto: a un lector no se le
 *       marcó nada y la pantalla no puede decirle que sí.
 */
export function marcaVigente(
  id: string,
  delServidor: string | null,
  cola: ColaDeMarcas,
  confirmadas: ColaDeMarcas,
): string | null {
  if (id in cola) return cola[id];
  if (id in confirmadas) return confirmadas[id];
  return delServidor;
}
