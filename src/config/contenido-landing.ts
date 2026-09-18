import { RUTA_AJUSTES, RUTA_MEDIOS } from "./constants";
import type { Seccion } from "./secciones";

/**
 * BODA-128 · QUÉ LLENA CADA SECCIÓN DE LA LANDING, Y DÓNDE SE ESCRIBE
 *
 * `secciones_landing` dice cuáles se enseñan y en qué orden. Lo que no dice
 * —porque no puede— es qué hace falta para que una sección encendida aparezca
 * de verdad. Y eso importa más que el interruptor: la landing **oculta lo que
 * está vacío** (regla 3, antes ocultar que dejar un hueco), así que una sección
 * encendida y sin contenido se comporta igual que una apagada.
 *
 * Es exactamente lo que pasó en producción: secciones encendidas que no salían,
 * y la sensación de que faltaba web cuando lo que faltaba era por dónde
 * llenarla. Un interruptor sin este mapa al lado vuelve a mentir igual.
 *
 * ESTO ES UN ESPEJO DE `src/app/page.tsx`, y no hay forma de que sea otra cosa:
 * la condición de pintado vive allí, dentro del objeto `contenido`, mezclada
 * con el JSX de cada sección. Sacarla de ahí sería reescribir la landing
 * entera para que este panel quede bonito, que es el precio equivocado.
 *
 * Lo que sí se puede hacer —y se hace— es que el espejo no se despegue solo:
 * `tests/unidad/contenido-landing.test.ts` comprueba contra el fichero real de
 * la landing que toda sección con pantalla está en su mapa y que
 * `ubicaciones`, que aún no existe, sigue sin estarlo.
 */

/** Dónde se escribe hoy el contenido de una sección. */
export type Donde =
  /** Una pantalla del panel, con su ruta. */
  | { pantalla: "ajustes" | "medios"; ruta: string }
  /** Todavía sólo por SQL. Es la deuda que este módulo viene a saldar. */
  | { pantalla: "sql" }
  /** No la escribimos nosotros: la escriben los invitados. */
  | { pantalla: "invitados" }
  /** No hay nada que escribir: la sección se pinta sola con lo que ya hay. */
  | { pantalla: "nada" };

/**
 * Qué condición cumple una sección para pintarse.
 *
 * `lista`  — hay al menos un elemento publicado en su tabla.
 * `campo`  — hay un dato escrito en la configuración de la boda.
 * `sola`   — se pinta siempre que esté encendida.
 * `sin-hacer` — todavía no existe el componente: encenderla no hace nada.
 */
export type Origen =
  | { clase: "lista"; tabla: string; filtro?: { columna: string; valor: string }; donde: Donde }
  | { clase: "campo"; tabla: string; campo: string; donde: Donde }
  | { clase: "sola"; donde: Donde }
  | { clase: "sin-hacer" };

const EN_AJUSTES: Donde = { pantalla: "ajustes", ruta: RUTA_AJUSTES };
const EN_MEDIOS: Donde = { pantalla: "medios", ruta: RUTA_MEDIOS };
const SOLO_SQL: Donde = { pantalla: "sql" };

/**
 * El mapa, sección a sección.
 *
 * Se anota como `Record<Seccion, Origen>` y no con `as const satisfies`, y la
 * diferencia no es de estilo: el `Record` obliga igual a que estén las
 * dieciséis —falta una y el `typecheck` se pone rojo, que es cuando conviene
 * enterarse— pero además deja el tipo como la unión discriminada que es, con su
 * `filtro` opcional. Con `as const` cada entrada conserva su forma literal
 * exacta, así que `origen.filtro` no compila para las que no lo llevan.
 */
export const ORIGEN_DE_LA_SECCION: Record<Seccion, Origen> = {
  /* Nombres, fecha y foto de portada: la configuración basta para pintarla. */
  portada: { clase: "sola", donde: EN_AJUSTES },

  /* Manda la frase, no la foto: sin `paisaje_titulo` no hay sección. */
  paisaje: {
    clase: "campo",
    tabla: "configuracion_boda",
    campo: "paisaje_titulo",
    donde: EN_AJUSTES,
  },

  /* Es una página aparte, no un trozo de la landing. */
  reserva_la_fecha: { clase: "sola", donde: EN_AJUSTES },

  cuenta_atras: { clase: "sola", donde: EN_AJUSTES },

  historia: { clase: "lista", tabla: "hitos_historia", donde: SOLO_SQL },

  galeria: {
    clase: "lista",
    tabla: "medios",
    filtro: { columna: "seccion", valor: "galeria" },
    donde: EN_MEDIOS,
  },

  /*
    LA PREBODA Y EL PROGRAMA SON LA MISMA TABLA, partida por `momento`. Un hito
    de la víspera es exactamente lo mismo —hora, título y descripción— y lo
    único que cambia es el día.
  */
  preboda: {
    clase: "lista",
    tabla: "hitos_programa",
    filtro: { columna: "momento", valor: "preboda" },
    donde: SOLO_SQL,
  },
  programa: {
    clase: "lista",
    tabla: "hitos_programa",
    filtro: { columna: "momento", valor: "boda" },
    donde: SOLO_SQL,
  },

  /* BODA-26: encendida desde el primer día y sin componente que la pinte. */
  ubicaciones: { clase: "sin-hacer" },

  /*
    SIN COORDENADAS NO HAY SECCIÓN, aunque haya rutas escritas: el mapa es su
    columna vertebral y «treinta minutos en autobús» sin decir hasta dónde no
    informa de nada. Las rutas se escriben aparte, y por eso esta fila apunta a
    Ajustes y no a la lista.
  */
  transporte: {
    clase: "campo",
    tabla: "configuracion_boda",
    campo: "latitud_ceremonia",
    donde: EN_AJUSTES,
  },

  alojamiento: { clase: "lista", tabla: "alojamientos", donde: SOLO_SQL },

  /*
    El IBAN vive en `configuracion_privada` —la tabla que `anon` no puede tocar—
    y tampoco tiene pantalla todavía. Sale a la landing por
    `datos_para_regalos()`, que es su única puerta.
  */
  regalos: {
    clase: "campo",
    tabla: "configuracion_privada",
    campo: "iban_regalos",
    donde: SOLO_SQL,
  },

  dresscode: { clase: "lista", tabla: "consejos_vestimenta", donde: SOLO_SQL },

  preguntas_frecuentes: {
    clase: "lista",
    tabla: "preguntas_frecuentes",
    donde: SOLO_SQL,
  },

  /* La escriben los invitados desde la propia web, con su enlace. */
  playlist: { clase: "sola", donde: { pantalla: "invitados" } },

  /* El botón de confirmar. No hay contenido que escribir. */
  rsvp: { clase: "sola", donde: { pantalla: "nada" } },
};

/** Las secciones que se cuentan por elementos, que son las que pueden quedarse vacías. */
export function esLista(seccion: Seccion): boolean {
  return ORIGEN_DE_LA_SECCION[seccion].clase === "lista";
}
