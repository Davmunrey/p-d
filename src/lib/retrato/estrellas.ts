import { RETRATO_DE_ESTRELLAS } from "@/config/constants";

/**
 * DE UNA SILUETA A SU CONTORNO HECHO ESTRELLAS
 *
 * Recibe el canal alfa de una foto recortada —lo opaco es la figura, lo
 * transparente el fondo— y devuelve estrellas repartidas a lo largo del borde
 * de la figura, en el orden en que se recorre: así, al encenderlas una tras
 * otra, el retrato se dibuja como si alguien lo trazara.
 *
 * Es aritmética y nada más, sin ficheros ni red: la usa el panel al subir la
 * foto y la prueban los unitarios con siluetas fabricadas.
 *
 * LOS PASOS:
 *
 *  1. Lo que pasa del umbral de opacidad es figura. Si apenas hay
 *     transparencia, la foto no está recortada y no hay nada que trazar.
 *  2. La figura se parte en trozos conexos; los que son migas frente al mayor
 *     —un copo que se coló en el recorte— se descartan.
 *  3. De cada trozo se recorre el borde exterior (vecindad de Moore, con el
 *     criterio de parada de Jacob), empezando por su punto más alto.
 *  4. El borde se suaviza —un recorte a píxel tiene dientes de sierra— y se
 *     reparte en estrellas a distancias iguales.
 *  5. Las estrellas principales son los vértices de la línea quebrada que
 *     resume el contorno (Ramer–Douglas–Peucker): la cabeza, los hombros, las
 *     manos, los pies, la punta del rabo. Brillan del todo; las demás, menos y
 *     cada una un poco distinta. Se probó a dar brillo según lo que gira el
 *     contorno en cada punto, y lo que se encendía eran los dientes del
 *     recorte, no la figura.
 *  6. Todo se lleva a 0..1 dentro de la caja de la figura, con su proporción.
 */

export type EstrellaDelRetrato = [x: number, y: number, brillo: number];

export interface RetratoDeEstrellas {
  /** Ancho entre alto de la figura. */
  proporcion: number;
  /** En el orden en que se trazan; x, y y brillo, entre 0 y 1. */
  estrellas: EstrellaDelRetrato[];
}

/** Una foto reducida a su canal alfa: un byte por píxel, por filas. */
export interface Silueta {
  ancho: number;
  alto: number;
  alfa: Uint8Array;
}

/** Los de `RETRATO_DE_ESTRELLAS`; los tests pasan otros para probar los topes. */
type Ajustes = { readonly [clave in keyof typeof RETRATO_DE_ESTRELLAS]: number };
interface Punto {
  x: number;
  y: number;
}

/**
 * Las ocho vecinas, en el sentido de las agujas del reloj en pantalla (la y
 * crece hacia abajo), empezando por el oeste.
 */
const VECINAS = [
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
] as const;

/** El índice de la vecina que está en (dx, dy). */
function direccionHacia(dx: number, dy: number): number {
  return VECINAS.findIndex(([x, y]) => x === dx && y === dy);
}

export function estrellasDeLaSilueta(
  silueta: Silueta,
  ajustes: Ajustes = RETRATO_DE_ESTRELLAS,
): RetratoDeEstrellas | null {
  const { ancho, alto, alfa } = silueta;
  const total = ancho * alto;
  if (ancho < 3 || alto < 3 || alfa.length !== total) return null;

  // 1. Figura y fondo.
  const figura = new Uint8Array(total);
  let opacos = 0;
  for (let i = 0; i < total; i += 1) {
    if (alfa[i]! >= ajustes.umbralAlfa) {
      figura[i] = 1;
      opacos += 1;
    }
  }
  if (opacos === 0 || (total - opacos) / total < ajustes.transparenteMinimo) return null;

  // 2. Trozos conexos (ocho vecinas). El primer píxel que se encuentra de cada
  // trozo, recorriendo por filas, es el más alto y, a igualdad, el de más a la
  // izquierda: por ahí empieza su borde.
  const etiqueta = new Int32Array(total);
  const pila = new Int32Array(total);
  const trozos: { id: number; area: number; inicio: number }[] = [];
  for (let i = 0; i < total; i += 1) {
    if (!figura[i] || etiqueta[i]) continue;
    const id = trozos.length + 1;
    let area = 0;
    let cima = 0;
    pila[cima++] = i;
    etiqueta[i] = id;
    while (cima > 0) {
      const actual = pila[--cima]!;
      area += 1;
      const x = actual % ancho;
      const y = (actual - x) / ancho;
      for (const [dx, dy] of VECINAS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const vecina = ny * ancho + nx;
        if (figura[vecina] && !etiqueta[vecina]) {
          etiqueta[vecina] = id;
          pila[cima++] = vecina;
        }
      }
    }
    trozos.push({ id, area, inicio: i });
  }

  const mayor = Math.max(...trozos.map((trozo) => trozo.area));
  const quedan = trozos
    .filter((trozo) => trozo.area >= mayor * ajustes.migaja)
    .sort((a, b) => b.area - a.area);

  // 3 y 4. El borde de cada trozo, suavizado.
  const bordes = quedan
    .map((trozo) => suavizar(borde(trozo, etiqueta, ancho, alto), ajustes.suavizado))
    .filter((puntos) => puntos.length >= 3);
  if (bordes.length === 0) return null;

  let minY = Infinity;
  let maxY = -Infinity;
  for (const puntos of bordes) {
    for (const { y } of puntos) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const altoFigura = maxY - minY;
  if (altoFigura <= 0) return null;

  // Se reparte a la distancia pedida y, si salen demasiadas, más separadas.
  const perimetros = bordes.map(perimetro);
  const largoTotal = perimetros.reduce((suma, largo) => suma + largo, 0);
  const paso = Math.max(ajustes.paso * altoFigura, largoTotal / ajustes.maximoEstrellas);

  const repartidos = bordes.map((puntos, i) =>
    repartir(puntos, Math.max(3, Math.round(perimetros[i]! / paso))),
  );

  // 5 y 6. Brillo por giro, y todo a la caja de la figura.
  let minX = Infinity;
  let maxX = -Infinity;
  minY = Infinity;
  maxY = -Infinity;
  for (const puntos of repartidos) {
    for (const { x, y } of puntos) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const anchoCaja = maxX - minX;
  const altoCaja = maxY - minY;
  if (anchoCaja <= 0 || altoCaja <= 0) return null;

  const redondear = (valor: number) => {
    const factor = 10 ** ajustes.decimales;
    return Math.round(valor * factor) / factor;
  };

  let indice = 0;
  const estrellas: EstrellaDelRetrato[] = repartidos.flatMap((puntos) => {
    const principales = vertices(puntos, ajustes.vertice * altoFigura);
    return puntos.map((punto, i): EstrellaDelRetrato => {
      indice += 1;
      const brillo = principales.has(i)
        ? 1
        : ajustes.brilloBase + ajustes.variacion * azar(indice);
      return [
        redondear((punto.x - minX) / anchoCaja),
        redondear((punto.y - minY) / altoCaja),
        redondear(brillo),
      ];
    });
  });

  return { proporcion: redondear(anchoCaja / altoCaja), estrellas };
}

/**
 * El borde exterior de un trozo, en orden, recorriendo sus vecinas en el
 * sentido de las agujas del reloj. Se para al volver al primer píxel entrando
 * igual que la primera vez (criterio de Jacob): con sólo «volver al primero»,
 * una figura con un cuello de un píxel se cortaba a medias.
 */
function borde(
  trozo: { id: number; area: number; inicio: number },
  etiqueta: Int32Array,
  ancho: number,
  alto: number,
): Punto[] {
  const esDelTrozo = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < ancho && y < alto && etiqueta[y * ancho + x] === trozo.id;

  const x0 = trozo.inicio % ancho;
  const y0 = (trozo.inicio - x0) / ancho;
  const puntos: Punto[] = [{ x: x0, y: y0 }];

  let x = x0;
  let y = y0;
  // Se llega «desde el oeste»: a la izquierda del primero no hay figura.
  let atras = 0;
  let primerPaso = -1;
  const tope = 4 * trozo.area + 8;

  for (let pasos = 0; pasos < tope; pasos += 1) {
    let siguiente = -1;
    for (let giro = 1; giro <= VECINAS.length; giro += 1) {
      const d = (atras + giro) % VECINAS.length;
      if (esDelTrozo(x + VECINAS[d]![0], y + VECINAS[d]![1])) {
        siguiente = d;
        break;
      }
    }
    // Un píxel suelto no tiene borde que recorrer.
    if (siguiente < 0) break;

    if (x === x0 && y === y0) {
      if (primerPaso < 0) primerPaso = siguiente;
      else if (siguiente === primerPaso) break;
    }

    // La vecina mirada justo antes es fondo: desde ahí se sigue buscando.
    const anterior = VECINAS[(siguiente + VECINAS.length - 1) % VECINAS.length]!;
    const fondoX = x + anterior[0];
    const fondoY = y + anterior[1];
    x += VECINAS[siguiente]![0];
    y += VECINAS[siguiente]![1];
    atras = direccionHacia(fondoX - x, fondoY - y);

    if (x === x0 && y === y0) continue;
    puntos.push({ x, y });
  }
  return puntos;
}

/** Media móvil circular: quita los escalones del píxel sin mover la forma. */
function suavizar(puntos: Punto[], radio: number): Punto[] {
  const n = puntos.length;
  if (radio <= 0 || n < 2 * radio + 1) return puntos;
  return puntos.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -radio; k <= radio; k += 1) {
      const vecino = puntos[(i + k + n) % n]!;
      x += vecino.x;
      y += vecino.y;
    }
    const cuantos = 2 * radio + 1;
    return { x: x / cuantos, y: y / cuantos };
  });
}

function perimetro(puntos: Punto[]): number {
  let largo = 0;
  for (let i = 0; i < puntos.length; i += 1) {
    const a = puntos[i]!;
    const b = puntos[(i + 1) % puntos.length]!;
    largo += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return largo;
}

/** `cuantos` puntos a la misma distancia a lo largo de un contorno cerrado. */
function repartir(puntos: Punto[], cuantos: number): Punto[] {
  const largo = perimetro(puntos);
  const tramo = largo / cuantos;
  const resultado: Punto[] = [];
  let recorrido = 0;
  let objetivo = 0;
  for (let i = 0; i < puntos.length && resultado.length < cuantos; i += 1) {
    const a = puntos[i]!;
    const b = puntos[(i + 1) % puntos.length]!;
    const segmento = Math.hypot(b.x - a.x, b.y - a.y);
    while (segmento > 0 && objetivo <= recorrido + segmento && resultado.length < cuantos) {
      const t = (objetivo - recorrido) / segmento;
      resultado.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      objetivo += tramo;
    }
    recorrido += segmento;
  }
  return resultado;
}

/**
 * Los vértices de la línea quebrada que resume un contorno cerrado, con
 * Ramer–Douglas–Peucker: se parte por los dos puntos más alejados entre sí y
 * cada tramo se divide por el punto que más se aleja de su cuerda, mientras se
 * aleje más de `tolerancia`.
 */
function vertices(puntos: Punto[], tolerancia: number): Set<number> {
  const n = puntos.length;
  const elegidos = new Set<number>([0]);
  if (n < 3) return elegidos;

  let lejano = 0;
  let distancia = -1;
  for (let i = 1; i < n; i += 1) {
    const d = Math.hypot(puntos[i]!.x - puntos[0]!.x, puntos[i]!.y - puntos[0]!.y);
    if (d > distancia) {
      distancia = d;
      lejano = i;
    }
  }
  elegidos.add(lejano);

  const pendientes: [number, number][] = [
    [0, lejano],
    [lejano, n],
  ];
  while (pendientes.length > 0) {
    const [desde, hasta] = pendientes.pop()!;
    const a = puntos[desde]!;
    const b = puntos[hasta % n]!;
    let mayor = -1;
    let donde = -1;
    for (let i = desde + 1; i < hasta; i += 1) {
      const d = distanciaALaCuerda(puntos[i]!, a, b);
      if (d > mayor) {
        mayor = d;
        donde = i;
      }
    }
    if (donde >= 0 && mayor > tolerancia) {
      elegidos.add(donde);
      pendientes.push([desde, donde], [donde, hasta]);
    }
  }
  return elegidos;
}

function distanciaALaCuerda(p: Punto, a: Punto, b: Punto): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const largo = Math.hypot(dx, dy);
  if (largo === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / largo;
}

/** Un número entre 0 y 1 que depende sólo de `n`: el mismo retrato, siempre igual. */
function azar(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * LO QUE VIENE DE LA BASE, COMPROBADO. La columna tiene su `check`, pero la
 * landing no pinta lo que no entiende: un valor con otra forma —una migración
 * a medias, una fila escrita a mano— se queda en `null` y el cielo sigue sin
 * retrato, en vez de romper la página.
 */
export function comoRetrato(valor: unknown): RetratoDeEstrellas | null {
  if (!valor || typeof valor !== "object") return null;
  const { proporcion, estrellas } = valor as { proporcion?: unknown; estrellas?: unknown };
  if (typeof proporcion !== "number" || !(proporcion > 0) || !Array.isArray(estrellas)) {
    return null;
  }
  const enRango = (n: unknown): n is number => typeof n === "number" && n >= 0 && n <= 1;
  const validas = estrellas.filter(
    (estrella): estrella is EstrellaDelRetrato =>
      Array.isArray(estrella) && estrella.length === 3 && estrella.every(enRango),
  );
  return validas.length >= 3 ? { proporcion, estrellas: validas } : null;
}
