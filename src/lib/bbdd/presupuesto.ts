import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-60 · EL PRESUPUESTO, DESDE EL PANEL
 *
 * El armazón: categorías con lo que se piensa gastar en cada una, y enfrente lo
 * que se lleva gastado de verdad. Sin categorías, los gastos de una boda son
 * una lista plana de cuarenta líneas en la que no se ve nada — y lo que hay que
 * ver es en qué se está yendo el dinero, no cuántas líneas hay.
 *
 * LOS TOTALES LOS SUMA LA BASE, no el navegador, y no es una preferencia: los
 * importes son `numeric`, que en PostgreSQL es exacto, y en JavaScript se
 * convierten en coma flotante. Sumar cuarenta partidas aquí acaba enseñando
 * «21.399,999999999996 €» en la pantalla que decide si esta boda cabe en el
 * presupuesto. `v_resumen_presupuesto` ya hace ese trabajo.
 *
 * VA POR EL CLIENTE DE SUPABASE CON LA SESIÓN DE QUIEN MIRA, como el resto del
 * panel: aquí RLS tiene que ver quién pregunta.
 */

export interface CategoriaPresupuesto {
  id: string;
  nombre: string;
  descripcion: string | null;
  importePrevisto: number;
  orden: number;
}

/**
 * Una fila del resumen: lo previsto enfrente de lo que va costando.
 *
 * `desviacion` la calcula la vista usando el importe real cuando existe y el
 * estimado mientras no. Es la cifra que de verdad interesa —«¿me estoy
 * pasando?»— y no la suma de lo ya pagado, que la semana antes de la boda es
 * siempre tranquilizadora y siempre falsa.
 */
export interface ResumenCategoria {
  categoriaId: string;
  categoria: string;
  orden: number;
  importePrevisto: number;
  estimado: number;
  real: number;
  pagado: number;
  pendiente: number;
  desviacion: number;
}

/**
 * `numeric` llega como CADENA desde PostgREST, a propósito: serializarlo a
 * número perdería precisión antes de que nadie lo mire. Se convierte en el
 * borde y una sola vez.
 */
function aImporte(valor: string | number | null): number {
  if (valor === null) return 0;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

export async function obtenerCategoriasPresupuesto(): Promise<CategoriaPresupuesto[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("categorias_presupuesto")
    .select("id, nombre, descripcion, importe_previsto, orden")
    .order("orden")
    .order("nombre");

  if (error) {
    console.error("No se pudieron leer las categorías de presupuesto:", error);
    return [];
  }

  return (
    (data as
      | {
          id: string;
          nombre: string;
          descripcion: string | null;
          importe_previsto: string | number;
          orden: number;
        }[]
      | null) ?? []
  ).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    importePrevisto: aImporte(fila.importe_previsto),
    orden: fila.orden,
  }));
}

/**
 * El resumen por categoría, tal y como lo calcula la base.
 *
 * SE ORDENA AQUÍ Y NO EN LA VISTA. `v_resumen_presupuesto` lleva un `group by`
 * y PostgreSQL no promete ningún orden después de agrupar: sin este `order`,
 * la tabla del presupuesto se baraja sola entre recargas. Una pantalla de
 * dinero que cambia de orden al recargar parece rota aunque las cifras sean
 * correctas.
 */
export async function obtenerResumenPresupuesto(): Promise<ResumenCategoria[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_resumen_presupuesto")
    .select(
      "categoria_id, categoria, orden, importe_previsto, estimado, real, pagado, pendiente, desviacion",
    )
    .order("orden")
    .order("categoria");

  if (error) {
    console.error("No se pudo leer el resumen del presupuesto:", error);
    return [];
  }

  return (
    (data as
      | {
          categoria_id: string;
          categoria: string;
          orden: number;
          importe_previsto: string | number;
          estimado: string | number;
          real: string | number;
          pagado: string | number;
          pendiente: string | number;
          desviacion: string | number;
        }[]
      | null) ?? []
  ).map((fila) => ({
    categoriaId: fila.categoria_id,
    categoria: fila.categoria,
    orden: fila.orden,
    importePrevisto: aImporte(fila.importe_previsto),
    estimado: aImporte(fila.estimado),
    real: aImporte(fila.real),
    pagado: aImporte(fila.pagado),
    pendiente: aImporte(fila.pendiente),
    desviacion: aImporte(fila.desviacion),
  }));
}

/**
 * Cuántos gastos cuelgan de una categoría.
 *
 * Es lo que hace falta antes de borrarla: `partidas_presupuesto.categoria_id`
 * es `on delete restrict`, así que la base se niega — pero decirle a alguien
 * «no se puede» sin decirle cuántos gastos hay ni ofrecerle a dónde moverlos es
 * dejarle con el problema entero.
 */
export async function contarGastosDeCategoria(categoriaId: string): Promise<number> {
  const supabase = await clienteServidor();

  const { count, error } = await supabase
    .from("partidas_presupuesto")
    .select("id", { count: "exact", head: true })
    .eq("categoria_id", categoriaId);

  if (error) {
    console.error("No se pudieron contar los gastos de la categoría:", error);
    // Devolver cero aquí sería peor que fallar: la pantalla ofrecería un
    // borrado directo sobre una categoría que quizá tiene cuarenta gastos.
    return -1;
  }

  return count ?? 0;
}

/**
 * LO QUE VA COSTANDO UNA CATEGORÍA.
 *
 * No es `real`, y confundirlos esconde dinero. `real` sólo suma las partidas
 * ya cerradas: una categoría con el catering firmado en 8.600 € y las flores
 * todavía estimadas en 500 € enseñaría 8.600 y las flores desaparecerían de la
 * cuenta.
 *
 * Lo que hay que enseñar es «real donde lo haya, estimado donde no», partida a
 * partida — y eso ya lo calcula la vista para su `desviacion`. En vez de
 * repetir la suma aquí con otro criterio (que es exactamente cómo dos cifras de
 * la misma pantalla acaban sin cuadrar), se despeja de ella:
 *
 *     desviacion = previsto − loQueVaCostando
 *     loQueVaCostando = previsto − desviacion
 *
 * Una sola definición, la de la base, y la pantalla no puede discrepar.
 */
export function loQueVaCostando(fila: ResumenCategoria): number {
  return fila.importePrevisto - fila.desviacion;
}

/**
 * BODA-61 · UN GASTO CONCRETO
 *
 * La unidad de la que están hechas las categorías: «el catering», «el ramo»,
 * «las alianzas». Lleva dos importes y no uno porque son dos cosas distintas:
 * `estimado` es lo que se calcula que costará y `real` lo que se acabó
 * acordando. Mientras no hay acuerdo, `real` es `null` — que no es cero.
 */
export interface Gasto {
  id: string;
  categoriaId: string;
  categoria: string;
  proveedorId: string | null;
  proveedor: string | null;
  concepto: string;
  descripcion: string | null;
  importeEstimado: number;
  /** `null` mientras no se ha cerrado. Distinto de un acuerdo por cero euros. */
  importeReal: number | null;
  pagada: boolean;
}

/**
 * `numeric` nulo tiene que seguir siendo nulo.
 *
 * `aImporte` convierte `null` en `0` porque en las sumas eso es lo correcto —
 * una categoría sin gastos ha costado cero—. Aquí no: un gasto sin importe real
 * todavía no se ha cerrado, y enseñar «0,00 €» en esa columna diría que el
 * proveedor sale gratis.
 */
function aImporteOpcional(valor: string | number | null): number | null {
  if (valor === null) return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

interface FilaGasto {
  id: string;
  categoria_id: string;
  proveedor_id: string | null;
  concepto: string;
  descripcion: string | null;
  importe_estimado: string | number;
  importe_real: string | number | null;
  pagada: boolean;
  categorias_presupuesto: { nombre: string } | null;
  proveedores: { nombre: string } | null;
}

/**
 * Los gastos con su categoría y su proveedor ya resueltos.
 *
 * SE PIDEN EN UNA SOLA CONSULTA, con los `embed` de PostgREST. Leer los gastos
 * y luego el nombre de cada proveedor uno a uno son cuarenta viajes a la base
 * para pintar una lista — y la lista se abre cada vez que se apunta un gasto.
 *
 * EL ORDEN LO MARCA LA CATEGORÍA, como en el resumen: los gastos se miran por
 * bloques («¿en qué se me está yendo el catering?»), no como una lista plana
 * ordenada por fecha de alta.
 */
export async function obtenerGastos(): Promise<Gasto[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("partidas_presupuesto")
    .select(
      "id, categoria_id, proveedor_id, concepto, descripcion, importe_estimado, importe_real, pagada, categorias_presupuesto(nombre), proveedores(nombre)",
    )
    .order("concepto");

  if (error) {
    console.error("No se pudieron leer los gastos:", error);
    return [];
  }

  return ((data as unknown as FilaGasto[] | null) ?? []).map((fila) => ({
    id: fila.id,
    categoriaId: fila.categoria_id,
    categoria: fila.categorias_presupuesto?.nombre ?? "",
    proveedorId: fila.proveedor_id,
    proveedor: fila.proveedores?.nombre ?? null,
    concepto: fila.concepto,
    descripcion: fila.descripcion,
    importeEstimado: aImporte(fila.importe_estimado),
    importeReal: aImporteOpcional(fila.importe_real),
    pagada: fila.pagada,
  }));
}

/**
 * Los gastos repartidos por categoría, en el orden en que se enseñan las
 * categorías.
 *
 * Agrupar aquí y no en la pantalla: es la misma lista que necesitan el listado
 * y los subtotales, y hacerlo dos veces es cómo dos partes de la misma pantalla
 * acaban discrepando en cuántos gastos hay.
 */
export function porCategoria(gastos: Gasto[]): Map<string, Gasto[]> {
  const grupos = new Map<string, Gasto[]>();
  for (const gasto of gastos) {
    const suyos = grupos.get(gasto.categoriaId);
    if (suyos) suyos.push(gasto);
    else grupos.set(gasto.categoriaId, [gasto]);
  }
  return grupos;
}
