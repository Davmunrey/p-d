import {
  LARGOS_DE_CAMPO,
  LONGITUD_MINIMA_NOMBRE,
  MAXIMO_FILAS_IMPORTACION,
} from "@/config/constants";
import { analizarCsvConLineas, celda as celdaCsv } from "@/lib/csv";
import { t, type ClaveCopy } from "@/lib/copy";

/**
 * BODA-53 · DE UN CSV A UNA LISTA DE INVITADOS
 *
 * Lo que hace este módulo es decidir, fila a fila, si algo se puede dar de alta
 * y por qué no. NO escribe en la base: se ejecuta igual para pintar la vista
 * previa que para preparar el envío, y por eso la vista previa enseña
 * exactamente lo que va a pasar en lugar de una aproximación.
 *
 * EL ERROR ES POR FILA Y BLOQUEA LA IMPORTACIÓN ENTERA. Es el criterio del
 * ticket, y no es cautela de más: una importación a medias deja la lista con
 * gente dentro y gente fuera, sin ninguna marca que distinga a quién faltó — y
 * la única salida es repasar doscientos nombres a mano contra la hoja original.
 * Todo o nada es más fácil de explicar y más fácil de arreglar.
 */

/** Las columnas que se entienden, con los nombres que puede traer cada una. */
const COLUMNAS = {
  grupo: ["grupo", "invitacion", "invitación", "familia"],
  lado: ["lado", "parte"],
  nombre: ["nombre"],
  apellidos: ["apellidos", "apellido"],
  nino: ["nino", "niño", "es nino", "es niño", "menor"],
} as const;

type Columna = keyof typeof COLUMNAS;

const OBLIGATORIAS: Columna[] = ["grupo", "nombre"];

export type Lado = "novia" | "novio" | "ambos";

const LADOS: Record<string, Lado> = {
  novia: "novia",
  novio: "novio",
  ambos: "ambos",
  "los dos": "ambos",
  /*
    Y LOS RÓTULOS CON QUE LOS ESCRIBE LA PROPIA WEB. La plantilla de muestra y
    la vista previa dicen «La novia», y quien rellena la hoja copia lo que ve:
    el importador rechazaba la fila de su propia plantilla.
  */
  ...Object.fromEntries(
    (["novia", "novio", "ambos"] as const).map((lado) => [
      normalizar(t(`panel.invitados.lados.${lado}`)),
      lado,
    ]),
  ),
};

/**
 * Lo afirmativo y lo negativo que puede escribir alguien en una hoja de
 * cálculo, ya sin tildes ni mayúsculas.
 *
 * LO DEMÁS ES UN ERROR, como en el lado. Antes cualquier cosa que no fuera un
 * «sí» contaba como adulto: «Niña», «7» o «sí (6 años)» entraban sin aviso con
 * `es_nino = false`, y ese niño ni podía llevar el menú infantil ni salía en
 * el recuento del catering.
 */
const AFIRMATIVOS = new Set(["si", "s", "x", "true", "1", "verdadero"]);
const NEGATIVOS = new Set(["", "no", "n", "0", "false", "falso"]);

export interface FilaImportada {
  grupo: string;
  /**
   * El lado de SU INVITACIÓN, no el que escribió la fila: en la base el lado
   * es del grupo. Es el de la invitación si ya existe y, si es nueva, el
   * primero que traiga el fichero para ella.
   */
  lado: Lado;
  nombre: string;
  apellidos: string | null;
  nino: boolean;
}

export interface ErrorDeFila {
  /** Número de fila tal y como lo ve quien abre el fichero: la 1 es la cabecera. */
  linea: number;
  motivo: string;
}

export interface Lectura {
  filas: FilaImportada[];
  /** Por cada fila de `filas`, si va a una invitación que crea esta importación. */
  nuevas: boolean[];
  /** Cuántas invitaciones distintas tocan las filas, nuevas o no. */
  invitaciones: number;
  errores: ErrorDeFila[];
  /** Rótulos que traía el fichero y no se entienden. Se ignoran, y se dice. */
  columnasIgnoradas: string[];
}

/** Lo que hay que saber de la base para leer un fichero. */
export interface Contexto {
  /** Las claves de persona (`clavePersona`) de quien ya está dado de alta. */
  yaExisten?: Set<string>;
  /** El lado de cada invitación que ya existe, por la clave de su nombre. */
  ladosExistentes?: Map<string, Lado>;
  /**
   * Cuándo dos nombres son el mismo. En el servidor es la de la base
   * (`clave_de_importacion()`); sin ella, la aproximación de `claveAproximada`.
   */
  clave?: (texto: string) => string;
}

/**
 * Compara rótulos sin que un acento o una mayúscula rompan la importación.
 * «Niño», «nino» y «NIÑO» son la misma columna, y quien rellena la hoja no
 * tiene por qué saberlo.
 */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** En qué posición viene cada columna, o `-1` si no viene. */
function situarColumnas(cabecera: string[]): {
  posiciones: Record<Columna, number>;
  ignoradas: string[];
} {
  const posiciones = {} as Record<Columna, number>;
  const usadas = new Set<number>();

  for (const columna of Object.keys(COLUMNAS) as Columna[]) {
    const alias = COLUMNAS[columna].map(normalizar);
    posiciones[columna] = cabecera.findIndex((rotulo) => alias.includes(normalizar(rotulo)));
    if (posiciones[columna] >= 0) usadas.add(posiciones[columna]);
  }

  const ignoradas = cabecera.filter(
    (rotulo, indice) => !usadas.has(indice) && rotulo.trim() !== "",
  );

  return { posiciones, ignoradas };
}

/**
 * CUÁNDO DOS NOMBRES SON EL MISMO, A OJO.
 *
 * El criterio de verdad es el de la base, `clave_de_importacion()`, y la
 * vista previa le pregunta a ella (ver `importar/acciones.ts`): si la pantalla
 * y la base no coinciden, la pantalla da a Marta por la «Familia Perez» que ya
 * existe y la base le crea otra invitación con su propio enlace. Esta versión
 * se le parece —sin tildes, sin mayúsculas, sin espacios en los bordes— pero
 * no traduce los doscientos signos de `unaccent` (ß, ø, ’, l·l…), así que sólo
 * vale para lo que no toca la base: los tests de este módulo.
 */
export function claveAproximada(texto: string): string {
  return normalizar(texto);
}

/** Todos los textos que `leerImportacion` va a necesitar en forma de clave. */
export function textosDelFichero(contenido: string): string[] {
  const textos = new Set([""]);
  for (const fila of analizarCsvConLineas(contenido)) {
    for (const celda of fila.celdas) textos.add(celda.trim());
  }
  return [...textos];
}

/** La clave de una persona: su invitación, su nombre y sus apellidos. */
export function clavePersona(
  grupo: string,
  nombre: string,
  apellidos: string | null,
  clave: (texto: string) => string = claveAproximada,
): string {
  return [clave(grupo.trim()), clave(nombre.trim()), clave((apellidos ?? "").trim())].join("|");
}

/**
 * La plantilla de ejemplo: las columnas y una fila de muestra.
 *
 * Vive aquí, junto a quien la lee, y no en la ruta que la sirve: así el test
 * puede pasarla por `leerImportacion` y comprobar que la plantilla que se
 * ofrece se importa sin un solo error. Sin el BOM, que lo pone la ruta.
 *
 * La fila de muestra lleva acento y ñ a propósito: es la comprobación de que
 * la codificación sobrevive al viaje de ida y vuelta por Excel. Si alguien
 * abre la plantilla y ve «ZubeldÃ­a», el problema está en su Excel y no en su
 * lista, y es mucho mejor descubrirlo aquí que con doscientos apellidos rotos.
 */
export function plantillaDeImportacion(): string {
  const columnas = [
    t("panel.importar.columna.grupo"),
    t("panel.importar.columna.nombre"),
    t("panel.importar.columna.apellidos"),
    t("panel.importar.columna.lado"),
    t("panel.importar.columna.nino"),
  ];

  const muestra = [
    t("panel.importar.muestraGrupo"),
    t("panel.importar.muestraNombre"),
    t("panel.importar.muestraApellidos"),
    t("panel.invitados.lados.novia"),
    t("panel.invitados.no"),
  ];

  return [columnas, muestra].map((fila) => fila.map(celdaCsv).join(";")).join("\r\n");
}

/** Lo que devuelve una lectura que se para antes de llegar a las filas. */
function sinFilas(error: ErrorDeFila, columnasIgnoradas: string[] = []): Lectura {
  return { filas: [], nuevas: [], invitaciones: 0, errores: [error], columnasIgnoradas };
}

/**
 * Lee el contenido de un CSV y devuelve qué se daría de alta y qué falla.
 *
 * Lo que hace falta de la base —quién está ya, de qué lado es cada invitación
 * y cómo compara nombres— se pasa desde fuera en lugar de consultarlo aquí,
 * para que este módulo siga siendo una función pura: así se prueba entero sin
 * base de datos, que es lo que permite tener test de los quince casos raros de
 * un CSV.
 */
export function leerImportacion(contenido: string, contexto: Contexto = {}): Lectura {
  const {
    yaExisten = new Set<string>(),
    ladosExistentes = new Map<string, Lado>(),
    clave = claveAproximada,
  } = contexto;
  const filas = analizarCsvConLineas(contenido);
  const errores: ErrorDeFila[] = [];

  if (filas.length === 0) {
    return sinFilas({ linea: 1, motivo: t("panel.importar.errorVacio") });
  }

  const [{ celdas: cabecera, linea: lineaCabecera }, ...cuerpo] = filas;
  const { posiciones, ignoradas } = situarColumnas(cabecera);

  const faltan = OBLIGATORIAS.filter((columna) => posiciones[columna] < 0);
  if (faltan.length > 0) {
    return sinFilas(
      {
        linea: lineaCabecera,
        motivo: t(
          faltan.length === 1
            ? "panel.importar.errorFaltaColumna"
            : "panel.importar.errorFaltanColumnas",
          {
            columnas: faltan
              .map((columna) => t(`panel.importar.columna.${columna}` as ClaveCopy))
              .join(", "),
          },
        ),
      },
      ignoradas,
    );
  }

  if (cuerpo.length > MAXIMO_FILAS_IMPORTACION) {
    return sinFilas(
      {
        linea: lineaCabecera,
        motivo: t("panel.importar.errorDemasiadas", {
          tope: MAXIMO_FILAS_IMPORTACION,
          traidas: cuerpo.length,
        }),
      },
      ignoradas,
    );
  }

  const celda = (fila: string[], columna: Columna): string =>
    posiciones[columna] >= 0 ? (fila[posiciones[columna]] ?? "").trim() : "";

  const listas: { fila: FilaImportada; invitacion: string }[] = [];
  // Los duplicados se miran contra lo que ya hay Y contra lo que lleva el
  // propio fichero: una hoja compartida entre dos familias trae a la misma
  // persona dos veces con muchísima naturalidad.
  const vistas = new Set(yaExisten);
  // El lado de cada invitación nueva: el de la primera fila que lo diga.
  const ladosDelFichero = new Map<string, Lado>();

  // `linea` es el número de la fila en la hoja, contando las vacías: quien
  // abra el fichero para arreglarlo tiene que encontrarla donde se le dice.
  cuerpo.forEach(({ celdas: fila, linea }) => {
    const grupo = celda(fila, "grupo");
    const nombre = celda(fila, "nombre");
    const apellidos = celda(fila, "apellidos") || null;

    if (grupo === "") {
      errores.push({ linea, motivo: t("panel.importar.errorSinGrupo") });
      return;
    }
    if (nombre.length < LONGITUD_MINIMA_NOMBRE) {
      errores.push({ linea, motivo: t("panel.importar.errorSinNombre") });
      return;
    }

    /*
      LOS TRES LARGOS QUE LA BASE EXIGE, COMPROBADOS FILA A FILA. Sin esto una
      celda de 90 caracteres en «nombre» pasaba la vista previa entera y hacía
      saltar el CHECK al confirmar: 150 filas rechazadas de golpe con «no se ha
      podido importar», sin línea ni motivo, y a quien importa le tocaba
      adivinar cuál de las 150 era. Los topes citan su columna y
      `largos-de-campo.test.ts` los contrasta contra las migraciones.
    */
    const largos: [string, string | null, number][] = [
      [t("panel.importar.columna.grupo"), grupo, LARGOS_DE_CAMPO["grupos_invitacion.nombre"]],
      [t("panel.importar.columna.nombre"), nombre, LARGOS_DE_CAMPO["invitados.nombre"]],
      [
        t("panel.importar.columna.apellidos"),
        apellidos,
        LARGOS_DE_CAMPO["invitados.apellidos"],
      ],
    ];
    const pasado = largos.find(([, valor, tope]) => (valor?.length ?? 0) > tope);
    if (pasado) {
      errores.push({
        linea,
        motivo: t("panel.importar.errorLargo", { campo: pasado[0], tope: pasado[2] }),
      });
      return;
    }

    /*
      `Object.hasOwn` Y NO `in`: `in` recorre la cadena de prototipos, así que
      «constructor», «toString» o «__proto__» escritos en la columna «lado» daban
      por válido el valor y guardaban una FUNCIÓN como lado. La vista previa
      intentaba pintar `t("panel.invitados.lados.function Object() …")`, `t()`
      lanza cuando no encuentra la clave, y la pantalla de importación se caía
      entera en vez de decir «eso no es un lado».
    */
    const ladoBruto = normalizar(celda(fila, "lado"));
    if (ladoBruto !== "" && !Object.hasOwn(LADOS, ladoBruto)) {
      errores.push({
        linea,
        motivo: t("panel.importar.errorLado", { valor: celda(fila, "lado") }),
      });
      return;
    }

    const nino = normalizar(celda(fila, "nino"));
    if (!AFIRMATIVOS.has(nino) && !NEGATIVOS.has(nino)) {
      errores.push({
        linea,
        motivo: t("panel.importar.errorNino", {
          valor: celda(fila, "nino"),
          columna: t("panel.importar.columna.nino"),
        }),
      });
      return;
    }

    /*
      UNA INVITACIÓN TIENE UN SOLO LADO. En la base el lado es del grupo, no de
      cada persona: la vista previa enseñaba «El novio» en una fila y la base
      la metía, sin avisar, en una invitación de la novia. Si la fila dice un
      lado distinto del de su invitación —la que ya existe o la que abrió otra
      fila del fichero—, es un error; si no dice ninguno, hereda el suyo.
    */
    const invitacion = clave(grupo);
    const ladoEscrito = ladoBruto === "" ? null : LADOS[ladoBruto];
    const ladoDeLaInvitacion =
      ladosExistentes.get(invitacion) ?? ladosDelFichero.get(invitacion);
    if (ladoEscrito && ladoDeLaInvitacion && ladoEscrito !== ladoDeLaInvitacion) {
      errores.push({
        linea,
        motivo: t("panel.importar.errorLadoDistinto", {
          grupo,
          lado: t(`panel.invitados.lados.${ladoDeLaInvitacion}`),
          valor: celda(fila, "lado"),
        }),
      });
      return;
    }

    const persona = clavePersona(grupo, nombre, apellidos, clave);
    if (vistas.has(persona)) {
      errores.push({
        linea,
        motivo: t("panel.importar.errorDuplicado", {
          persona: [nombre, apellidos].filter(Boolean).join(" "),
          grupo,
        }),
      });
      return;
    }
    vistas.add(persona);
    if (ladoEscrito && !ladoDeLaInvitacion) ladosDelFichero.set(invitacion, ladoEscrito);

    listas.push({
      fila: { grupo, lado: "ambos", nombre, apellidos, nino: AFIRMATIVOS.has(nino) },
      invitacion,
    });
  });

  // El lado se pone al final: una fila sin lado puede ir antes que la que se
  // lo da a su invitación nueva. Sin ninguno, «ambos», que es el de la base.
  const ladoDe = (invitacion: string): Lado =>
    ladosExistentes.get(invitacion) ?? ladosDelFichero.get(invitacion) ?? "ambos";

  return {
    filas: listas.map(({ fila, invitacion }) => ({ ...fila, lado: ladoDe(invitacion) })),
    nuevas: listas.map(({ invitacion }) => !ladosExistentes.has(invitacion)),
    invitaciones: new Set(listas.map(({ invitacion }) => invitacion)).size,
    errores,
    columnasIgnoradas: ignoradas,
  };
}
