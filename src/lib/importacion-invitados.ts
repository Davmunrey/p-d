import {
  LARGOS_DE_CAMPO,
  LONGITUD_MINIMA_NOMBRE,
  MAXIMO_FILAS_IMPORTACION,
} from "@/config/constants";
import { analizarCsv, celda as celdaCsv } from "@/lib/csv";
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

type Lado = "novia" | "novio" | "ambos";

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

/** Lo afirmativo que puede escribir alguien en una hoja de cálculo. */
const AFIRMATIVOS = new Set(["si", "sí", "s", "x", "true", "1", "verdadero"]);

export interface FilaImportada {
  grupo: string;
  lado: "novia" | "novio" | "ambos";
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
  errores: ErrorDeFila[];
  /** Rótulos que traía el fichero y no se entienden. Se ignoran, y se dice. */
  columnasIgnoradas: string[];
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
 * Cuándo dos nombres de invitación son la misma invitación: sin mayúsculas ni
 * acentos. Es el criterio de `importar_invitados()` en la base (con
 * `sin_acentos`), y tiene que serlo: si la vista previa y la base no coinciden,
 * la vista previa avisa de un duplicado en «Familia Perez» y la base crea
 * después otra invitación para el resto de la familia.
 */
export function claveGrupo(grupo: string): string {
  return normalizar(grupo);
}

/** Una clave única de persona, para cazar duplicados sin distinguir formas. */
export function clavePersona(grupo: string, nombre: string, apellidos: string | null): string {
  return [claveGrupo(grupo), normalizar(nombre), normalizar(apellidos ?? "")].join("|");
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

/**
 * Lee el contenido de un CSV y devuelve qué se daría de alta y qué falla.
 *
 * `yaExisten` son las claves de la gente que ya está en la base. Se pasa desde
 * fuera en lugar de consultarla aquí para que este módulo siga siendo una
 * función pura: así se prueba entero sin base de datos, que es lo que permite
 * tener test de los quince casos raros de un CSV.
 */
export function leerImportacion(
  contenido: string,
  yaExisten: Set<string> = new Set(),
): Lectura {
  const filas = analizarCsv(contenido);
  const errores: ErrorDeFila[] = [];

  if (filas.length === 0) {
    return {
      filas: [],
      errores: [{ linea: 1, motivo: t("panel.importar.errorVacio") }],
      columnasIgnoradas: [],
    };
  }

  const [cabecera, ...cuerpo] = filas;
  const { posiciones, ignoradas } = situarColumnas(cabecera);

  const faltan = OBLIGATORIAS.filter((columna) => posiciones[columna] < 0);
  if (faltan.length > 0) {
    return {
      filas: [],
      errores: [
        {
          linea: 1,
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
      ],
      columnasIgnoradas: ignoradas,
    };
  }

  if (cuerpo.length > MAXIMO_FILAS_IMPORTACION) {
    return {
      filas: [],
      errores: [
        {
          linea: 1,
          motivo: t("panel.importar.errorDemasiadas", {
            tope: MAXIMO_FILAS_IMPORTACION,
            traidas: cuerpo.length,
          }),
        },
      ],
      columnasIgnoradas: ignoradas,
    };
  }

  const celda = (fila: string[], columna: Columna): string =>
    posiciones[columna] >= 0 ? (fila[posiciones[columna]] ?? "").trim() : "";

  const listas: FilaImportada[] = [];
  // Los duplicados se miran contra lo que ya hay Y contra lo que lleva el
  // propio fichero: una hoja compartida entre dos familias trae a la misma
  // persona dos veces con muchísima naturalidad.
  const vistas = new Set(yaExisten);

  cuerpo.forEach((fila, indice) => {
    // +2: la cabecera es la línea 1 y este índice empieza en cero. Quien abra
    // el fichero para arreglarlo tiene que encontrar la fila donde se le dice.
    const linea = indice + 2;

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

    const clave = clavePersona(grupo, nombre, apellidos);
    if (vistas.has(clave)) {
      errores.push({
        linea,
        motivo: t("panel.importar.errorDuplicado", {
          persona: [nombre, apellidos].filter(Boolean).join(" "),
          grupo,
        }),
      });
      return;
    }
    vistas.add(clave);

    listas.push({
      grupo,
      lado: ladoBruto === "" ? "ambos" : LADOS[ladoBruto],
      nombre,
      apellidos,
      nino: AFIRMATIVOS.has(normalizar(celda(fila, "nino"))),
    });
  });

  return { filas: listas, errores, columnasIgnoradas: ignoradas };
}
