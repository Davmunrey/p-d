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

/** Saca de la cola lo que ya se ha mandado (o lo que no se va a mandar nunca). */
export function soltar(ids: string[]): void {
  if (ids.length === 0) return;

  const quedan: ColaDeMarcas = {};
  for (const [clave, marca] of Object.entries(instantanea())) {
    if (!ids.includes(clave)) quedan[clave] = marca;
  }
  fijar(quedan);
}
