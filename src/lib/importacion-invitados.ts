import { LONGITUD_MINIMA_NOMBRE, MAXIMO_FILAS_IMPORTACION } from "@/config/constants";
import { analizarCsv } from "@/lib/csv";
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

const LADOS: Record<string, "novia" | "novio" | "ambos"> = {
  novia: "novia",
  novio: "novio",
  ambos: "ambos",
  "los dos": "ambos",
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

/** Una clave única de persona, para cazar duplicados sin distinguir formas. */
export function clavePersona(grupo: string, nombre: string, apellidos: string | null): string {
  return [normalizar(grupo), normalizar(nombre), normalizar(apellidos ?? "")].join("|");
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
          motivo: t("panel.importar.errorFaltaColumna", {
            columnas: faltan
              .map((columna) => t(`panel.importar.columna.${columna}` as ClaveCopy))
              .join(", "),
          }),
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

    const ladoBruto = normalizar(celda(fila, "lado"));
    if (ladoBruto !== "" && !(ladoBruto in LADOS)) {
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
