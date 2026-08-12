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
 * Las fases del embudo, en su orden de avance.
 *
 * EL ORDEN ES EL DEL ENUMERADO DE LA BASE, no una decisión de esta lista.
 * `estado_proveedor` se ordena por el orden en que se declararon sus valores,
 * así que un `order by estado` en SQL y este desplegable dicen lo mismo. Si
 * algún día divergen, el que manda es el de la base — y añadir una fase es una
 * migración, no una línea aquí: inventarse un valor que la base no conoce es
 * un desplegable que falla al guardar.
 */
export const ESTADOS_PROVEEDOR = [
  "investigando",
  "contactado",
  "presupuesto_pedido",
  "presupuesto_recibido",
  "visitado",
  "contratado",
  "descartado",
] as const;

/** El estado en el que nace un proveedor, igual que el `default` de la tabla. */
export const ESTADO_INICIAL_PROVEEDOR: EstadoProveedor = "investigando";

export type EstadoProveedor = (typeof ESTADOS_PROVEEDOR)[number];

export function esEstadoProveedor(valor: string): valor is EstadoProveedor {
  return (ESTADOS_PROVEEDOR as readonly string[]).includes(valor);
}

/**
 * BODA-72 · Qué clase de papel es cada adjunto.
 *
 * El orden es el del enumerado `tipo_documento_proveedor` y también el del
 * ciclo real de una contratación: se pide presupuesto, se firma contrato, llega
 * la factura. Lo demás es «otro», que es el `default` de la columna.
 */
export const TIPOS_DOCUMENTO = ["presupuesto", "contrato", "factura", "otro"] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export function esTipoDocumento(valor: string): valor is TipoDocumento {
  return (TIPOS_DOCUMENTO as readonly string[]).includes(valor);
}

/**
 * BODA-74 · A quién multiplica un servicio por invitado.
 *
 * El orden es el del enumerado `base_servicio`. `todos` es el valor neutro y
 * el `default`: `servicios_base_solo_por_invitado` obliga a que un servicio de
 * precio cerrado lo lleve, porque en él la base no significa nada.
 */
export const BASES_SERVICIO = ["todos", "adultos", "ninos"] as const;

export type BaseServicio = (typeof BASES_SERVICIO)[number];

/** El valor neutro, igual que el `default` de la columna. */
export const BASE_SERVICIO_NEUTRA: BaseServicio = "todos";

export function esBaseServicio(valor: string): valor is BaseServicio {
  return (BASES_SERVICIO as readonly string[]).includes(valor);
}

/**
 * Un identificador de la base, antes de mandárselo a PostgREST.
 *
 * `?categoria=inexistente` es una URL que alguien va a escribir —o que va a
 * quedar en un marcador cuando se borre una categoría—, y comparar eso con una
 * columna `uuid` no devuelve «no hay nada»: devuelve un `22P02` de PostgreSQL.
 * Un error de sintaxis de SQL no es lo que hay que enseñarle a nadie, así que
 * lo que no tiene forma de identificador ni llega a salir de aquí.
 */
const ES_IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdentificador(valor: string): boolean {
  return ES_IDENTIFICADOR.test(valor);
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
  /** Por qué se descartó. La base exige que exista si —y sólo si— está descartado. */
  motivoDescarte: string | null;
  /**
   * BODA-73 · Si `importePresupuestado` lleva el IVA dentro.
   *
   * `null` NO ES «no lo sabemos todavía por vaguería»: es «el presupuesto no lo
   * dice», que es un estado real y frecuentísimo, y la comparativa lo enseña
   * como aviso en lugar de inventarse la otra cifra.
   */
  ivaIncluido: boolean | null;
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
  motivo_descarte: string | null;
  iva_incluido: boolean | null;
}

/** Las columnas del proveedor que se piden siempre. Una lista, no tres copias. */
const COLUMNAS_PROVEEDOR = `id, categoria_id, nombre, persona_contacto, correo_electronico,
   telefono, sitio_web, estado, valoracion, importe_presupuestado, importe_acordado, notas,
   motivo_descarte, iva_incluido`;

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
    motivoDescarte: fila.motivo_descarte,
    ivaIncluido: fila.iva_incluido,
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
    .select(COLUMNAS_PROVEEDOR)
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
  // Un `/panel/proveedores/loquesea` es «no existe», no un error de sintaxis de
  // PostgreSQL. Ver `esIdentificador`.
  if (!esIdentificador(id)) return null;

  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("proveedores")
    .select(
      `${COLUMNAS_PROVEEDOR},
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

/** Una categoría en la que todavía no hay nadie contratado. */
export interface CategoriaSinCerrar {
  id: string;
  nombre: string;
  /** Cuántos candidatos vivos tiene: cero es «sin empezar», tres es «hay que decidir». */
  candidatos: number;
}

/**
 * BODA-71 · QUÉ FALTA POR CERRAR
 *
 * La pregunta de verdad no es «¿cuántos proveedores tengo?», es «¿qué me falta
 * por cerrar?», y una lista de proveedores no la contesta: hay que recorrerla
 * entera comprobando categoría por categoría, buscando precisamente lo que no
 * está.
 *
 * LO CALCULA LA VISTA, no esta función. `v_categorias_sin_contratar` sabe qué
 * cuenta como cerrado, y el resumen del panel va a querer el mismo dato: dos
 * sitios contándolo por su cuenta acaban diciendo cifras distintas la semana
 * que alguien cambie el criterio.
 */
export async function obtenerCategoriasSinCerrar(): Promise<CategoriaSinCerrar[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_categorias_sin_contratar")
    .select("id, nombre, candidatos");

  if (error) {
    console.error("No se pudieron leer las categorías sin cerrar:", error);
    return [];
  }

  return (data as CategoriaSinCerrar[] | null) ?? [];
}

/**
 * Quién está ya contratado en una categoría, sin contar a uno.
 *
 * Es lo que hace falta para avisar antes de contratar a un segundo fotógrafo:
 * el aviso tiene que **decir a quién**, porque «ya hay uno contratado» sin
 * nombre obliga a ir a buscarlo para saber si es un error o es a propósito.
 */
export async function obtenerContratadosDeCategoria(
  categoriaId: string,
  exceptoId: string,
): Promise<{ id: string; nombre: string }[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre")
    .eq("categoria_id", categoriaId)
    .eq("estado", "contratado")
    .neq("id", exceptoId);

  if (error) {
    console.error("No se pudieron leer los contratados de la categoría:", error);
    return [];
  }

  return (data as { id: string; nombre: string }[] | null) ?? [];
}

/* -------------------------------------------------------------------------- */
/*  BODA-72 · Documentos del proveedor                                        */
/* -------------------------------------------------------------------------- */

export interface DocumentoProveedor {
  id: string;
  tipo: TipoDocumento;
  nombre: string;
  tipoMime: string | null;
  tamanoBytes: number | null;
  creadoEn: string;
  /** Quién lo subió. `null` si esa persona ya no está: el papel sigue valiendo. */
  subidoPor: string | null;
}

interface FilaDocumento {
  id: string;
  tipo: string;
  nombre: string;
  tipo_mime: string | null;
  tamano_bytes: string | number | null;
  creado_en: string;
  perfiles: { nombre_completo: string | null } | { nombre_completo: string | null }[] | null;
}

/**
 * Los papeles de un proveedor, del más reciente al más antiguo.
 *
 * NO SE DEVUELVE LA RUTA DE STORAGE, y no es un olvido. La pantalla no la
 * necesita —la descarga va por identificador y quien firma la URL es el
 * servidor— así que sacarla hasta el HTML sólo serviría para publicar dónde
 * vive cada contrato dentro del bucket. Lo que no se pinta no se filtra.
 *
 * EL ORDEN ES POR FECHA Y NO POR TIPO. La pregunta que trae aquí a alguien es
 * «¿está ya el contrato firmado?», y lo último subido es lo último que pasó.
 */
export async function obtenerDocumentosProveedor(
  proveedorId: string,
): Promise<DocumentoProveedor[]> {
  if (!esIdentificador(proveedorId)) return [];

  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("documentos_proveedor")
    .select(
      "id, tipo, nombre, tipo_mime, tamano_bytes, creado_en, perfiles ( nombre_completo )",
    )
    .eq("proveedor_id", proveedorId)
    .order("creado_en", { ascending: false });

  if (error) {
    console.error("No se pudieron leer los documentos del proveedor:", error);
    return [];
  }

  return ((data as unknown as FilaDocumento[] | null) ?? []).map((fila) => {
    // PostgREST devuelve la relación como objeto o como lista de uno según cómo
    // deduzca la cardinalidad. Se acepta cualquiera de las dos formas.
    const perfil = Array.isArray(fila.perfiles) ? fila.perfiles[0] : fila.perfiles;

    return {
      id: fila.id,
      tipo: fila.tipo as TipoDocumento,
      nombre: fila.nombre,
      tipoMime: fila.tipo_mime,
      /*
        `bigint` llega como CADENA por el mismo motivo que `numeric`: en
        JavaScript no cabe entero cualquier valor de 64 bits. Un adjunto de
        veinte megas cabría de sobra, pero la conversión se hace en el borde y
        no se supone en cada sitio que lo use.
      */
      tamanoBytes: aImporte(fila.tamano_bytes),
      creadoEn: fila.creado_en,
      subidoPor: perfil?.nombre_completo ?? null,
    };
  });
}

/**
 * La ruta dentro del bucket de UN documento, para firmarla o para borrarla.
 *
 * Va aparte de la lista a propósito: es el único dato que la pantalla no
 * necesita y las dos acciones sí. Se pide por identificador con el cliente de
 * SESIÓN —o sea, con RLS delante—, así que quien no puede ver el documento no
 * lo descarga ni acertando el identificador.
 */
export async function obtenerRutaDocumento(
  documentoId: string,
  proveedorId: string,
): Promise<string | null> {
  if (!esIdentificador(documentoId) || !esIdentificador(proveedorId)) return null;

  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("documentos_proveedor")
    .select("ruta_almacenamiento")
    .eq("id", documentoId)
    // Y DEL PROVEEDOR QUE DICE LA URL: sin esto, el identificador de un
    // documento valdría desde la ficha de cualquier otro.
    .eq("proveedor_id", proveedorId)
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer la ruta del documento:", error);
    return null;
  }

  return (data as { ruta_almacenamiento: string } | null)?.ruta_almacenamiento ?? null;
}

/* -------------------------------------------------------------------------- */
/*  BODA-74 · Servicios, con la cuenta hecha por la base                      */
/* -------------------------------------------------------------------------- */

export interface ServicioProveedor {
  id: string;
  nombre: string;
  descripcion: string | null;
  precioUnitario: number;
  cantidad: number;
  porInvitado: boolean;
  baseCalculo: BaseServicio;
  minimoGarantizado: number | null;
  /** Lo que saldría hoy contando confirmados, sin el mínimo del contrato. */
  importeCalculado: number | null;
  /** Lo que se va a pagar: lo anterior, pero nunca por debajo del mínimo. */
  importeTotal: number | null;
}

interface FilaServicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_unitario: string | number;
  cantidad: number;
  por_invitado: boolean;
  base_calculo: string;
  minimo_garantizado: string | number | null;
  importe_calculado: string | number | null;
  importe_total: string | number | null;
}

/**
 * Lo contratado a un proveedor, con su importe ya resuelto.
 *
 * SE LEE DE `v_servicios_importe` Y NO DE `servicios`, y ahí está la mitad del
 * ticket. La cuenta de un servicio por invitado —a cuántos multiplica según
 * `base_calculo`, y que nunca baje del mínimo garantizado— vive en la vista.
 * Replicarla en TypeScript sería tener dos fórmulas que empiezan iguales y
 * dejan de coincidir en silencio la semana que alguien cambie una.
 *
 * Por eso confirmar un invitado más no dispara ningún recálculo: no hay nada
 * que recalcular, es una vista.
 */
export async function obtenerServiciosProveedor(
  proveedorId: string,
): Promise<ServicioProveedor[]> {
  if (!esIdentificador(proveedorId)) return [];

  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_servicios_importe")
    .select(
      `id, nombre, descripcion, precio_unitario, cantidad, por_invitado,
       base_calculo, minimo_garantizado, importe_calculado, importe_total`,
    )
    .eq("proveedor_id", proveedorId)
    .order("nombre");

  if (error) {
    console.error("No se pudieron leer los servicios del proveedor:", error);
    return [];
  }

  return ((data as FilaServicio[] | null) ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    precioUnitario: aImporte(fila.precio_unitario) ?? 0,
    cantidad: fila.cantidad,
    porInvitado: fila.por_invitado,
    baseCalculo: fila.base_calculo as BaseServicio,
    minimoGarantizado: aImporte(fila.minimo_garantizado),
    importeCalculado: aImporte(fila.importe_calculado),
    importeTotal: aImporte(fila.importe_total),
  }));
}

/* -------------------------------------------------------------------------- */
/*  BODA-73 · La comparativa de una categoría                                 */
/* -------------------------------------------------------------------------- */

export interface ProveedorComparado extends Proveedor {
  /** Qué incluye, por nombre. Suele ser la columna que decide de verdad. */
  servicios: string[];
}

/** Una categoría por identificador, o `null` si no la hay —o no se puede ver—. */
export async function obtenerCategoria(id: string): Promise<CategoriaProveedor | null> {
  if (!esIdentificador(id)) return null;

  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("categorias_proveedor")
    .select("id, nombre, descripcion, orden")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("No se pudo leer la categoría:", error);
    return null;
  }

  return (data as FilaCategoria | null) ?? null;
}

/**
 * Los candidatos de UNA categoría, con lo que incluye cada uno.
 *
 * COMPARAR CATEGORÍAS DISTINTAS ES IMPOSIBLE POR CONSTRUCCIÓN: entra un
 * identificador y sale su lista. No existe una firma que admita dos, así que no
 * hay pantalla que pueda mezclarlas — y poner el precio de un fotógrafo al lado
 * del de un catering no es una comparación, es una suma disfrazada.
 *
 * EL ORDEN LO PONE EL DINERO, no el alfabeto: se compara para elegir, y lo
 * primero que se mira es cuánto pide cada uno. Quien todavía no ha dado precio
 * va al final, que es donde está en la decisión.
 */
export async function obtenerComparativa(categoriaId: string): Promise<ProveedorComparado[]> {
  if (!esIdentificador(categoriaId)) return [];

  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("proveedores")
    .select(`${COLUMNAS_PROVEEDOR}, servicios ( nombre )`)
    .eq("categoria_id", categoriaId)
    .order("nombre");

  if (error) {
    console.error("No se pudo leer la comparativa de la categoría:", error);
    return [];
  }

  const filas =
    (data as unknown as (FilaProveedor & { servicios: { nombre: string }[] })[] | null) ?? [];

  return filas
    .map((fila) => ({
      ...aProveedor(fila),
      servicios: (fila.servicios ?? []).map((servicio) => servicio.nombre).sort(),
    }))
    .sort((uno, otro) => {
      if (uno.importePresupuestado === null) return otro.importePresupuestado === null ? 0 : 1;
      if (otro.importePresupuestado === null) return -1;
      return uno.importePresupuestado - otro.importePresupuestado;
    });
}
