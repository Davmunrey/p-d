import type { ClaveCopy } from "@/lib/copy";

import {
  LARGO_MAXIMO_DATO,
  LARGO_MAXIMO_LINEA,
  LARGO_MAXIMO_PARRAFO,
  RUTA_AJUSTES,
  RUTA_CONTENIDO,
  RUTA_MEDIOS,
} from "./constants";
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
  | { pantalla: "ajustes" | "medios" | "contenido"; ruta: string }
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

/** Lo que todavía no tiene pantalla. Quedan las dos listas con foto (3/3). */
const SOLO_SQL: Donde = { pantalla: "sql" };

/**
 * Una lista del propio módulo de Contenido (BODA-129).
 *
 * La ruta se compone y no se escribe: es `RUTA_CONTENIDO` más la clave, y
 * `rutaDeLista()` —definida más abajo— hace lo mismo para la pantalla. Un día
 * que cambie el prefijo, cambia en un sitio.
 */
const enContenido = (clave: string): Donde => ({
  pantalla: "contenido",
  ruta: `${RUTA_CONTENIDO}/${clave}`,
});

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
    // La misma pantalla que el programa, en su otra pestaña.
    donde: enContenido("programa"),
  },
  programa: {
    clase: "lista",
    tabla: "hitos_programa",
    filtro: { columna: "momento", valor: "boda" },
    donde: enContenido("programa"),
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
    /*
      APUNTA A AJUSTES Y NO A LA LISTA, y no es un despiste: lo que decide si
      esta sección sale son las COORDENADAS, que viven en Ajustes. Las rutas se
      escriben en Contenido, pero escribir veinte rutas sin coordenadas no hace
      aparecer nada, así que el enlace lleva a lo que de verdad falta.
    */
    donde: EN_AJUSTES,
  },

  alojamiento: { clase: "lista", tabla: "alojamientos", donde: SOLO_SQL },

  /*
    El IBAN vive en `configuracion_privada` —la tabla que `anon` no puede tocar—
    y sale a la landing por `datos_para_regalos()`, que es su única puerta.
    Desde BODA-129 se escribe en Ajustes, y sólo un propietario puede hacerlo.
  */
  regalos: {
    clase: "campo",
    tabla: "configuracion_privada",
    campo: "iban_regalos",
    donde: EN_AJUSTES,
  },

  dresscode: { clase: "lista", tabla: "consejos_vestimenta", donde: enContenido("dresscode") },

  preguntas_frecuentes: {
    clase: "lista",
    tabla: "preguntas_frecuentes",
    donde: enContenido("preguntas"),
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

/* ==========================================================================
 * BODA-129 · LAS LISTAS QUE SE EDITAN DESDE EL PANEL
 * ========================================================================== */

/**
 * LAS CUATRO SON LA MISMA PANTALLA CON DISTINTOS CAMPOS.
 *
 * Alta, edición, retirar de la web, borrar y reordenar: idéntico en las cuatro.
 * Lo único que cambia es qué campos tiene una ficha. Escribir cuatro pantallas
 * sería escribir cuatro veces la misma detección del silencio de RLS, los
 * mismos cuatro botones y el mismo formulario — y a la tercera, dos de ellas
 * discreparían en el detalle que nadie mira.
 *
 * Así que la forma vive aquí, y hay UNA pantalla y UNA acción que la consumen.
 * Añadir una quinta lista es añadir una entrada a `LISTAS_DE_CONTENIDO`.
 *
 * LO QUE NO SE PARAMETRIZA ES EL TEXTO. Cada campo trae su clave de copy, ya
 * tipada como `ClaveCopy`, así que una lista sin sus rótulos no compila. Lo que
 * el componente compartido recibe son cadenas YA resueltas con `t()`: una clave
 * construida por plantilla se saltaría el `typecheck`, que es justo lo que hace
 * útil tener los copys tipados.
 */

/** Las listas que hay. La clave es también el último trozo de su ruta. */
export const CLAVES_LISTA = ["programa", "transporte", "dresscode", "preguntas"] as const;

export type ClaveLista = (typeof CLAVES_LISTA)[number];

export function esClaveLista(valor: string): valor is ClaveLista {
  return (CLAVES_LISTA as readonly string[]).includes(valor);
}

/**
 * Un campo de una ficha.
 *
 * UNIÓN DISCRIMINADA POR `clase` y no una interfaz plana con un `tipo` dentro:
 * así cada clase lleva sólo lo que le toca. Es la diferencia entre un campo de
 * foto con `largo: 0` —un cero con significado, que es una trampa— y un campo
 * de foto que sencillamente no tiene largo. Hoy hay dos clases; la de foto
 * llega con las listas que la necesitan.
 */
export type CampoDeLista =
  /** Una línea: un `input`. Para horas, títulos, preguntas. */
  | {
      clase: "linea";
      columna: string;
      etiqueta: ClaveCopy;
      ayuda?: ClaveCopy;
      obligatorio: boolean;
      largo: number;
    }
  /** Un párrafo: un `textarea`. Para descripciones y respuestas. */
  | {
      clase: "parrafo";
      columna: string;
      etiqueta: ClaveCopy;
      ayuda?: ClaveCopy;
      obligatorio: boolean;
      largo: number;
    };

/**
 * A qué sección de la landing va lo que se escribe en la lista.
 *
 * `partida` existe por el programa: `hitos_programa` alimenta DOS secciones
 * —`programa` y `preboda`— repartiéndose por su columna `momento`. Un hito de
 * la víspera es exactamente lo mismo que uno de la boda (hora, título y
 * descripción), así que son una tabla y una pantalla, con un conmutador arriba.
 */
export type Destino =
  | { clase: "una"; seccion: Seccion }
  | {
      clase: "partida";
      columna: string;
      opciones: readonly { valor: string; seccion: Seccion; rotulo: ClaveCopy }[];
    };

export interface ListaDeContenido {
  tabla: string;
  titulo: ClaveCopy;
  descripcion: ClaveCopy;
  /** Cómo se llama una ficha suelta: «hito», «ruta», «consejo», «pregunta». */
  unaFicha: ClaveCopy;
  campos: readonly CampoDeLista[];
  destino: Destino;
  /**
   * Con qué orden las lee la web pública.
   *
   * Está escrito aquí Y en `src/lib/bbdd/landing.ts`, que es donde de verdad se
   * consulta. Dos sitios para un dato es un riesgo, y por eso
   * `tests/unidad/listas-contenido.test.ts` los compara: si alguien cambia el
   * `order by` de la landing, el panel dejaría de enseñar el mismo orden que ve
   * un invitado y nadie se enteraría hasta que una ficha «no se mueve».
   */
  ordenacion: readonly string[];
  /**
   * La columna que NOMBRA una ficha en prosa.
   *
   * No es la misma que la que la encabeza, y el programa es el porqué: su
   * primer campo es la HORA, que es por lo que se busca en una lista del día
   * —se mira «las nueve» y se lee qué hay—, así que encabeza bien. Pero
   * preguntar «¿Borramos «21:00»?» no es preguntar nada, y peor aún si hay dos
   * cosas a esa hora.
   *
   * Así que la tarjeta se encabeza con el primer campo y se NOMBRA con este.
   * En tres de las cuatro listas son el mismo, y eso está bien: la excepción
   * tiene que poder escribirse, no desaparecer.
   */
  columnaNombre: string;
}

/**
 * Las cuatro listas.
 *
 * El `Record` obliga a que estén todas: añadir una clave a `CLAVES_LISTA` sin
 * describirla aquí pone el `typecheck` en rojo. Es el mismo razonamiento —y la
 * misma forma— que `ORIGEN_DE_LA_SECCION` de arriba.
 */
export const LISTAS_DE_CONTENIDO: Record<ClaveLista, ListaDeContenido> = {
  /*
    EL PROGRAMA ES UNA SOLA PANTALLA CON DOS PESTAÑAS, y no dos hermanas. La
    tabla es la misma y la ficha es la misma —hora, qué pasa, detalle—; lo único
    que cambia es el día. Partirla en dos pantallas sería tener dos sitios donde
    arreglar el mismo formulario.
  */
  programa: {
    tabla: "hitos_programa",
    titulo: "panel.contenido.listas.programa.titulo",
    descripcion: "panel.contenido.listas.programa.descripcion",
    unaFicha: "panel.contenido.listas.programa.unaFicha",
    campos: [
      {
        clase: "linea",
        columna: "hora",
        etiqueta: "panel.contenido.listas.programa.hora",
        ayuda: "panel.contenido.listas.programa.horaAyuda",
        obligatorio: true,
        largo: LARGO_MAXIMO_DATO,
      },
      {
        clase: "linea",
        columna: "titulo",
        etiqueta: "panel.contenido.listas.programa.titulo_",
        obligatorio: true,
        largo: LARGO_MAXIMO_LINEA,
      },
      {
        clase: "parrafo",
        columna: "descripcion",
        etiqueta: "panel.contenido.listas.programa.descripcion_",
        ayuda: "panel.contenido.listas.programa.descripcionAyuda",
        obligatorio: false,
        largo: LARGO_MAXIMO_PARRAFO,
      },
    ],
    destino: {
      clase: "partida",
      columna: "momento",
      opciones: [
        {
          valor: "boda",
          seccion: "programa",
          rotulo: "panel.contenido.listas.programa.boda",
        },
        {
          valor: "preboda",
          seccion: "preboda",
          rotulo: "panel.contenido.listas.programa.preboda",
        },
      ],
    },
    ordenacion: ["orden", "hora"],
    columnaNombre: "titulo",
  },

  transporte: {
    tabla: "rutas_llegada",
    titulo: "panel.contenido.listas.transporte.titulo",
    descripcion: "panel.contenido.listas.transporte.descripcion",
    unaFicha: "panel.contenido.listas.transporte.unaFicha",
    campos: [
      {
        clase: "linea",
        columna: "modo",
        etiqueta: "panel.contenido.listas.transporte.modo",
        ayuda: "panel.contenido.listas.transporte.modoAyuda",
        obligatorio: true,
        largo: LARGO_MAXIMO_LINEA,
      },
      {
        clase: "linea",
        columna: "duracion",
        etiqueta: "panel.contenido.listas.transporte.duracion",
        ayuda: "panel.contenido.listas.transporte.duracionAyuda",
        obligatorio: false,
        largo: LARGO_MAXIMO_DATO,
      },
      {
        clase: "parrafo",
        columna: "detalle",
        etiqueta: "panel.contenido.listas.transporte.detalle",
        ayuda: "panel.contenido.listas.transporte.detalleAyuda",
        obligatorio: false,
        largo: LARGO_MAXIMO_PARRAFO,
      },
    ],
    destino: { clase: "una", seccion: "transporte" },
    ordenacion: ["orden", "modo"],
    columnaNombre: "modo",
  },

  dresscode: {
    tabla: "consejos_vestimenta",
    titulo: "panel.contenido.listas.dresscode.titulo",
    descripcion: "panel.contenido.listas.dresscode.descripcion",
    unaFicha: "panel.contenido.listas.dresscode.unaFicha",
    campos: [
      {
        clase: "linea",
        columna: "titulo",
        etiqueta: "panel.contenido.listas.dresscode.tituloConsejo",
        ayuda: "panel.contenido.listas.dresscode.tituloConsejoAyuda",
        obligatorio: true,
        largo: LARGO_MAXIMO_LINEA,
      },
      {
        clase: "parrafo",
        columna: "texto",
        etiqueta: "panel.contenido.listas.dresscode.texto",
        obligatorio: true,
        largo: LARGO_MAXIMO_PARRAFO,
      },
    ],
    destino: { clase: "una", seccion: "dresscode" },
    ordenacion: ["orden"],
    columnaNombre: "titulo",
  },

  preguntas: {
    tabla: "preguntas_frecuentes",
    titulo: "panel.contenido.listas.preguntas.titulo",
    descripcion: "panel.contenido.listas.preguntas.descripcion",
    unaFicha: "panel.contenido.listas.preguntas.unaFicha",
    campos: [
      {
        clase: "linea",
        columna: "pregunta",
        etiqueta: "panel.contenido.listas.preguntas.pregunta",
        obligatorio: true,
        largo: LARGO_MAXIMO_LINEA,
      },
      {
        clase: "parrafo",
        columna: "respuesta",
        etiqueta: "panel.contenido.listas.preguntas.respuesta",
        obligatorio: true,
        largo: LARGO_MAXIMO_PARRAFO,
      },
    ],
    destino: { clase: "una", seccion: "preguntas_frecuentes" },
    ordenacion: ["orden"],
    columnaNombre: "pregunta",
  },
};

/** La ruta de una lista. La clave es también el último trozo de la URL. */
export function rutaDeLista(clave: ClaveLista): string {
  return `${RUTA_CONTENIDO}/${clave}`;
}

/**
 * Qué sección alimenta una lista, según la variante elegida.
 *
 * Con una lista partida, la variante decide: los hitos con `momento = preboda`
 * llenan la sección `preboda`, no `programa`. Sin variante válida se devuelve la
 * primera, que es la que la pantalla enseña por defecto.
 */
export function seccionDeLista(clave: ClaveLista, variante?: string): Seccion {
  const destino = LISTAS_DE_CONTENIDO[clave].destino;
  if (destino.clase === "una") return destino.seccion;

  const elegida = destino.opciones.find((opcion) => opcion.valor === variante);
  return (elegida ?? destino.opciones[0]).seccion;
}

/** La variante por defecto de una lista partida, o `undefined` si no lo es. */
export function variantePorDefecto(clave: ClaveLista): string | undefined {
  const destino = LISTAS_DE_CONTENIDO[clave].destino;
  return destino.clase === "partida" ? destino.opciones[0].valor : undefined;
}
