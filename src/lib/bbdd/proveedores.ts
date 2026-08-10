import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-70 · LOS PROVEEDORES, DESDE EL PANEL
 *
 * La agenda de la boda. Hoy vive repartida entre notas del móvil, correos y
 * capturas de Instagram, y el precio de eso se paga tarde: en septiembre nadie
 * se acuerda de qué le dijo el fotógrafo en marzo ni de por qué se descartó al
 * otro.
 *
 * VA POR EL CLIENTE DE SUPABASE CON LA SESIÓN DE QUIEN MIRA, como el resto del
 * panel y al revés que la landing. Aquí RLS tiene que ver *quién* pregunta: un
 * lector lee y un editor escribe, y eso lo decide la base. Con SQL directo
 * habría que suplantar el rol a mano y las políticas dejarían de proteger nada.
 *
 * LO QUE CUELGA DE UN PROVEEDOR SE CUENTA AQUÍ Y NO EN LA PANTALLA. Antes de
 * borrar a nadie hay que saber qué se lleva por delante, y esa pregunta —
 * ¿cuántos gastos, cuántos servicios, cuántos documentos?— es de la base.
 */

/**
 * Las cinco fases que tiene hoy el enumerado de la base, en su orden de avance.
 *
 * Se derivan de él y no al revés: añadir «presupuesto pedido» y «visitado» —que
 * pide BODA-71— es una migración que toca el enumerado, y esta lista se
 * actualiza detrás. Inventarse aquí un valor que la base no conoce sería un
 * desplegable que falla al guardar.
 */
export const ESTADOS_PROVEEDOR = [
  "investigando",
  "contactado",
  "presupuesto_recibido",
  "contratado",
  "descartado",
] as const;

export type EstadoProveedor = (typeof ESTADOS_PROVEEDOR)[number];

export function esEstadoProveedor(valor: string): valor is EstadoProveedor {
  return (ESTADOS_PROVEEDOR as readonly string[]).includes(valor);
}

export interface CategoriaProveedor {
  id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

export interface Proveedor {
  id: string;
  categoriaId: string;
  nombre: string;
  personaContacto: string | null;
  correoElectronico: string | null;
  telefono: string | null;
  sitioWeb: string | null;
  estado: EstadoProveedor;
  valoracion: number | null;
  importePresupuestado: number | null;
  importeAcordado: number | null;
  notas: string | null;
}

export interface ContactoProveedor {
  id: string;
  nombre: string;
  papel: string | null;
  correoElectronico: string | null;
  telefono: string | null;
  esDelDia: boolean;
  notas: string | null;
}

/** Un gasto de los que cuelgan del proveedor, para poder avisar antes de borrar. */
export interface GastoDelProveedor {
  id: string;
  concepto: string;
  importeEstimado: number;
  importeReal: number | null;
}

export interface FichaProveedor extends Proveedor {
  categoriaNombre: string;
  contactos: ContactoProveedor[];
  gastos: GastoDelProveedor[];
  /** Cuentan para el aviso de borrado: la base los tiene con `on delete restrict`. */
  servicios: number;
  documentos: number;
}

/**
 * Las filas como llegan de PostgREST: `snake_case` y relaciones anidadas. Se
 * escriben a mano porque sin los tipos generados el cliente devuelve `any`, y
 * un `any` aquí sería quedarse sin tipos justo donde hay dinero de por medio.
 */
interface FilaCategoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

interface FilaProveedor {
  id: string;
  categoria_id: string;
  nombre: string;
  persona_contacto: string | null;
  correo_electronico: string | null;
  telefono: string | null;
  sitio_web: string | null;
  estado: string;
  valoracion: number | null;
  importe_presupuestado: string | number | null;
  importe_acordado: string | number | null;
  notas: string | null;
}

/**
 * `numeric` llega como CADENA, no como número.
 *
 * PostgREST serializa `numeric(12,2)` a texto a propósito: en JavaScript,
 * `0.1 + 0.2` no es `0.3`, y un importe de boda pasado por coma flotante acaba
 * enseñando «8.599,999999999999 €». Se convierte en el borde, una sola vez, y
 * lo que circula por dentro ya es número — pero los totales los suma la base,
 * que es donde `numeric` sigue siendo exacto.
 */
function aImporte(valor: string | number | null): number | null {
  if (valor === null) return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function aProveedor(fila: FilaProveedor): Proveedor {
  return {
    id: fila.id,
    categoriaId: fila.categoria_id,
    nombre: fila.nombre,
    personaContacto: fila.persona_contacto,
    correoElectronico: fila.correo_electronico,
    telefono: fila.telefono,
    sitioWeb: fila.sitio_web,
    estado: fila.estado as EstadoProveedor,
    valoracion: fila.valoracion,
    importePresupuestado: aImporte(fila.importe_presupuestado),
    importeAcordado: aImporte(fila.importe_acordado),
    notas: fila.notas,
  };
}

/**
 * Las categorías, en el orden que decidió quien organiza.
 *
 * `orden` primero y `nombre` de desempate: sin el segundo criterio, dos
 * categorías con el mismo `orden` salen en un orden que decide PostgreSQL y
 * que cambia entre recargas. Una lista que se baraja sola parece rota.
 */
export async function obtenerCategoriasProveedor(): Promise<CategoriaProveedor[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("categorias_proveedor")
    .select("id, nombre, descripcion, orden")
    .order("orden")
    .order("nombre");

  if (error) {
    console.error("No se pudieron leer las categorías de proveedor:", error);
    return [];
  }

  return (data as FilaCategoria[] | null) ?? [];
}

/** Todos los proveedores. Son decenas, no miles: se piden de una vez. */
export async function obtenerProveedores(): Promise<Proveedor[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("proveedores")
    .select(
      `id, categoria_id, nombre, persona_contacto, correo_electronico, telefono,
       sitio_web, estado, valoracion, importe_presupuestado, importe_acordado, notas`,
    )
    .order("nombre");

  if (error) {
    console.error("No se pudieron leer los proveedores:", error);
    return [];
  }

  return ((data as FilaProveedor[] | null) ?? []).map(aProveedor);
}

/**
 * La ficha completa, con lo que cuelga de ella.
 *
 * Devuelve `null` cuando no existe **o cuando quien mira no puede verlo**: RLS
 * no distingue esos dos casos y esta capa tampoco debe inventárselo. La
 * pantalla dice «no existe» en los dos, que es lo correcto — decir «existe pero
 * no puedes» ya es contar algo.
 */
export async function obtenerFichaProveedor(id: string): Promise<FichaProveedor | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("proveedores")
    .select(
      `id, categoria_id, nombre, persona_contacto, correo_electronico, telefono,
       sitio_web, estado, valoracion, importe_presupuestado, importe_acordado, notas,
       categorias_proveedor ( nombre ),
       contactos_proveedor ( id, nombre, papel, correo_electronico, telefono, es_del_dia, notas ),
       partidas_presupuesto ( id, concepto, importe_estimado, importe_real ),
       servicios ( id ),
       documentos_proveedor ( id )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer el proveedor:", error);
    return null;
  }
  if (!data) return null;

  const fila = data as FilaProveedor & {
    categorias_proveedor: { nombre: string } | { nombre: string }[] | null;
    contactos_proveedor: {
      id: string;
      nombre: string;
      papel: string | null;
      correo_electronico: string | null;
      telefono: string | null;
      es_del_dia: boolean;
      notas: string | null;
    }[];
    partidas_presupuesto: {
      id: string;
      concepto: string;
      importe_estimado: string | number;
      importe_real: string | number | null;
    }[];
    servicios: { id: string }[];
    documentos_proveedor: { id: string }[];
  };

  // PostgREST devuelve la relación como objeto o como lista de uno según cómo
  // deduzca la cardinalidad. Se acepta cualquiera de las dos formas: fiarse de
  // una sola es un `undefined` en pantalla el día que cambie el esquema.
  const categoria = Array.isArray(fila.categorias_proveedor)
    ? fila.categorias_proveedor[0]
    : fila.categorias_proveedor;

  return {
    ...aProveedor(fila),
    categoriaNombre: categoria?.nombre ?? "",
    contactos: (fila.contactos_proveedor ?? [])
      .map((contacto) => ({
        id: contacto.id,
        nombre: contacto.nombre,
        papel: contacto.papel,
        correoElectronico: contacto.correo_electronico,
        telefono: contacto.telefono,
        esDelDia: contacto.es_del_dia,
        notas: contacto.notas,
      }))
      // Los del día de la boda primero: es la pregunta urgente, y la única que
      // se hace de pie y con prisa.
      .sort((a, b) =>
        a.esDelDia === b.esDelDia
          ? a.nombre.localeCompare(b.nombre)
          : Number(b.esDelDia) - Number(a.esDelDia),
      ),
    gastos: (fila.partidas_presupuesto ?? []).map((gasto) => ({
      id: gasto.id,
      concepto: gasto.concepto,
      importeEstimado: aImporte(gasto.importe_estimado) ?? 0,
      importeReal: aImporte(gasto.importe_real),
    })),
    servicios: (fila.servicios ?? []).length,
    documentos: (fila.documentos_proveedor ?? []).length,
  };
}

/**
 * Cuántos proveedores cuelgan de cada categoría.
 *
 * Se calcula sobre la lista que ya se ha traído en lugar de pedir un `count`
 * por categoría: son diez categorías y una consulta por cada una serían diez
 * idas y vueltas para contar lo que ya está en memoria.
 */
export function contarPorCategoria(proveedores: Proveedor[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const proveedor of proveedores) {
    cuenta.set(proveedor.categoriaId, (cuenta.get(proveedor.categoriaId) ?? 0) + 1);
  }
  return cuenta;
}

/**
 * La moneda de la boda, para escribir los importes.
 *
 * Vive en `configuracion_boda` y no en una constante: la regla 1 del proyecto
 * es que un valor que puede cambiar sin que cambie la lógica es configuración.
 * Si la lectura falla se devuelve `null` y quien llama decide — pero nadie
 * inventa un «EUR» de respaldo, que sería enseñar importes en una moneda que
 * no es la de la boda y hacerlo además en silencio.
 */
export async function obtenerMonedaBoda(): Promise<string | null> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("configuracion_boda")
    .select("moneda")
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer la moneda de la boda:", error);
    return null;
  }

  return (data as { moneda: string } | null)?.moneda ?? null;
}
