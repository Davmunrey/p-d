import "server-only";

import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * BODA-100 a BODA-104 (#67 #68 #69 #70 #71) · EL DÍA DE LA BODA
 *
 * Todo lo que se mira el mismo día sale de aquí. Es el único módulo del panel
 * que no se usa sentado: se usa de pie, con una mano, con sol de frente y con
 * la cobertura de una finca en mitad del campo.
 *
 * ESO CAMBIA CÓMO SE LEE LA BASE, y por eso este fichero existe en vez de
 * repartir las consultas por las pantallas.
 *
 * TODO DE UNA VEZ Y NADA AL TECLEAR. El buscador de invitados (#69) no consulta
 * por cada letra: la pantalla se trae la lista entera una vez y filtra en el
 * navegador. Con doscientos invitados eso son unos kilobytes, y a cambio buscar
 * sigue funcionando cuando el móvil se queda sin datos —que es exactamente
 * cuando alguien pregunta en qué mesa está—. Una consulta por pulsación sería
 * más elegante y estaría muerta justo el día que hace falta.
 *
 * LOS TOTALES LOS SIGUE SUMANDO LA BASE. `v_recuento_catering` es la única
 * definición de la cifra que se le canta al catering por teléfono; aquí se lee,
 * no se recalcula. Lo único que se hace en TypeScript es repartir en grupos lo
 * que la base ya ha contado.
 */

/* ------------------------------------------------------------------------ */
/* El guion de la jornada (#67)                                              */
/* ------------------------------------------------------------------------ */

export interface PuntoDelGuion {
  id: string;
  /** Texto libre: «13:15», pero también «al acabar el cóctel». */
  hora: string;
  titulo: string;
  /** Quién responde. Casi nunca es alguien con cuenta en el panel. */
  responsable: string | null;
  notas: string | null;
  orden: number;
  /**
   * Cuándo se marcó, no si se marcó. `null` es pendiente.
   *
   * Es una hora y no un booleano porque reconstruye la jornada: «el autobús
   * salió a las 13:22» contesta preguntas que «hecho» no contesta.
   */
  hechoEn: string | null;
}

interface FilaGuion {
  id: string;
  hora: string;
  titulo: string;
  responsable: string | null;
  notas: string | null;
  orden: number;
  hecho_en: string | null;
}

/**
 * El guion entero, en el orden en que pasa.
 *
 * ORDENA `orden` Y NO `hora`, y es deliberado: la hora es texto libre, así que
 * ordenar por ella pondría «al acabar el cóctel» entre las nueve y las diez —o
 * donde cayera alfabéticamente—. Quien escribe el guion decide la secuencia; la
 * hora está para leerla, no para clasificar.
 */
export async function obtenerGuion(): Promise<PuntoDelGuion[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("guion_dia")
    .select("id, hora, titulo, responsable, notas, orden, hecho_en")
    .order("orden", { ascending: true })
    .order("hora", { ascending: true });

  if (error) {
    console.error("No se pudo leer el guion del día:", error);
    return [];
  }

  return ((data as FilaGuion[] | null) ?? []).map((fila) => ({
    id: fila.id,
    hora: fila.hora,
    titulo: fila.titulo,
    responsable: fila.responsable,
    notas: fila.notas,
    orden: fila.orden,
    hechoEn: fila.hecho_en,
  }));
}

/*
  QUÉ TOCA AHORA NO SE CALCULA AQUÍ, y merece decirse porque el sitio obvio
  sería éste. Se calcula en la pantalla, sobre el guion de la base MÁS lo que
  todavía no ha salido del móvil: sin eso, marcar sin cobertura dejaría el
  cartel de arriba señalando un punto que quien lo marcó ya ha dado por hecho.

  Y no se mira el reloj. La hora es texto libre —«al acabar el cóctel» no se
  compara con nada—, así que lo que toca es el primero sin marcar. Resulta ser
  más fiable que el reloj, porque una boda nunca va a su hora.
*/

/* ------------------------------------------------------------------------ */
/* La agenda de contactos (#68)                                              */
/* ------------------------------------------------------------------------ */

export interface ContactoDelDia {
  id: string;
  nombre: string;
  /** «jefe de sala», «el que monta el sonido». */
  papel: string | null;
  telefono: string | null;
  correo: string | null;
  /** A quién llamar el día de la boda, que casi nunca es el comercial. */
  esDelDia: boolean;
}

export interface ProveedorEnLaAgenda {
  id: string;
  nombre: string;
  categoria: string;
  personaContacto: string | null;
  telefono: string | null;
  contactos: ContactoDelDia[];
}

interface FilaAgenda {
  id: string;
  nombre: string;
  persona_contacto: string | null;
  telefono: string | null;
  categorias_proveedor: { nombre: string; orden: number } | null;
  contactos_proveedor:
    | {
        id: string;
        nombre: string;
        papel: string | null;
        telefono: string | null;
        correo_electronico: string | null;
        es_del_dia: boolean;
      }[]
    | null;
}

/**
 * Los proveedores contratados, con todos sus teléfonos.
 *
 * SÓLO LOS CONTRATADOS, y eso es media funcionalidad del ticket: la lista de
 * proveedores tiene dentro a los tres fotógrafos que se descartaron y al
 * catering que dio un presupuesto y no se volvió a saber. Llamar por error al
 * descartado el día de la boda es una conversación que nadie quiere tener.
 *
 * EL ORDEN ES EL DE LAS CATEGORÍAS, que es lo más parecido a «cuándo
 * intervienen» que hay en la base sin inventarse un campo: `categorias_
 * proveedor.orden` ya está puesto en el orden en que se organiza una boda. La
 * floristería monta antes que el DJ, y así sale.
 */
export async function obtenerAgendaDelDia(): Promise<ProveedorEnLaAgenda[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("proveedores")
    .select(
      `id, nombre, persona_contacto, telefono,
       categorias_proveedor ( nombre, orden ),
       contactos_proveedor ( id, nombre, papel, telefono, correo_electronico, es_del_dia )`,
    )
    .eq("estado", "contratado")
    .order("nombre", { ascending: true });

  if (error) {
    console.error("No se pudo leer la agenda del día:", error);
    return [];
  }

  const proveedores = ((data as unknown as FilaAgenda[] | null) ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    categoria: fila.categorias_proveedor?.nombre ?? "",
    orden: fila.categorias_proveedor?.orden ?? 0,
    personaContacto: fila.persona_contacto,
    telefono: fila.telefono,
    contactos: (fila.contactos_proveedor ?? [])
      .map((contacto) => ({
        id: contacto.id,
        nombre: contacto.nombre,
        papel: contacto.papel,
        telefono: contacto.telefono,
        correo: contacto.correo_electronico,
        esDelDia: contacto.es_del_dia,
      }))
      /*
        EL CONTACTO DEL DÍA VA PRIMERO dentro de cada proveedor. Es el que se
        marca precisamente para no tener que buscarlo, así que enterrarlo entre
        los comerciales anularía el motivo por el que existe la casilla.
      */
      .sort((a, b) => Number(b.esDelDia) - Number(a.esDelDia)),
  }));

  /*
    SE ORDENA AQUÍ Y NO EN SQL porque el criterio vive en la tabla de al lado:
    PostgREST no ordena por una columna de una relación anidada. Son unas
    decenas de filas ya en memoria, así que ordenarlas cuesta nada; hacerlo con
    una vista nueva sería una migración para reordenar una lista.
  */
  return proveedores
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((proveedor) => ({
      id: proveedor.id,
      nombre: proveedor.nombre,
      categoria: proveedor.categoria,
      personaContacto: proveedor.personaContacto,
      telefono: proveedor.telefono,
      contactos: proveedor.contactos,
    }));
}

/*
  CÓMO SE ESCRIBE UN `tel:` NO ESTÁ AQUÍ: está en `lib/telefono.ts`. Nació en
  este fichero, que es donde parecía que iba, y tiró el `build` abajo — la
  agenda es un componente de cliente, y traerse de aquí una función de dos
  líneas le arrastra al navegador el cliente de Supabase entero. Con los tipos
  no pasa (`import type` desaparece al compilar); con una función, sí.
*/

/* ------------------------------------------------------------------------ */
/* El buscador de invitados (#69)                                            */
/* ------------------------------------------------------------------------ */

export interface InvitadoDelDia {
  id: string;
  nombre: string;
  apellidos: string | null;
  mesa: string | null;
  tipoMenu: string;
  alergias: string | null;
  esNino: boolean;
  /** Si ha confirmado. Quien no viene también se busca: para saber que no viene. */
  confirmado: boolean;
}

interface FilaInvitadoDelDia {
  id: string;
  nombre: string;
  apellidos: string | null;
  tipo_menu: string;
  alergias: string | null;
  es_nino: boolean;
  mesas: { nombre: string } | null;
  confirmaciones: { estado: string; es_vigente: boolean }[] | null;
}

/**
 * Todos los invitados con lo que hace falta saber de ellos el mismo día.
 *
 * DE UNA VEZ Y ENTEROS, por lo que se cuenta arriba: quien pregunta «¿en qué
 * mesa estoy?» lo pregunta en mitad del cóctel, y ahí el móvil tiene una raya.
 */
export async function obtenerInvitadosDelDia(): Promise<InvitadoDelDia[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("invitados")
    .select(
      `id, nombre, apellidos, tipo_menu, alergias, es_nino,
       mesas ( nombre ),
       confirmaciones ( estado, es_vigente )`,
    )
    .order("apellidos", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) {
    console.error("No se pudieron leer los invitados del día:", error);
    return [];
  }

  return ((data as unknown as FilaInvitadoDelDia[] | null) ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    mesa: fila.mesas?.nombre ?? null,
    tipoMenu: fila.tipo_menu,
    alergias: fila.alergias,
    esNino: fila.es_nino,
    confirmado:
      fila.confirmaciones?.some(
        (confirmacion) => confirmacion.es_vigente && confirmacion.estado === "confirmado",
      ) ?? false,
  }));
}

/* ------------------------------------------------------------------------ */
/* El recuento del catering (#70)                                            */
/* ------------------------------------------------------------------------ */

export interface LineaDelRecuento {
  tipoMenu: string;
  confirmados: number;
  conAlergias: number;
  /** La corrección de última hora. Positiva o negativa. */
  ajuste: number;
  total: number;
  nota: string | null;
  /** Cuándo se tocó la corrección. Se dice por teléfono, así que se enseña. */
  corregidoEn: string | null;
}

interface FilaRecuento {
  tipo_menu: string;
  confirmados: number;
  con_alergias: number;
  ajuste: number;
  total: number;
  nota: string | null;
  corregido_en: string | null;
}

/**
 * La cifra del catering, menú a menú.
 *
 * SALE DE `v_recuento_catering` TAL CUAL. Esa vista hace el `full join` que
 * evita los dos agujeros del recuento: una corrección de un menú del que aún no
 * hay confirmados no puede desaparecer, y un menú confirmado sin corrección
 * tampoco. Rehacer la suma aquí sería tener dos cifras para la misma llamada.
 */
export async function obtenerRecuento(): Promise<LineaDelRecuento[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_recuento_catering")
    .select("tipo_menu, confirmados, con_alergias, ajuste, total, nota, corregido_en")
    .order("tipo_menu", { ascending: true });

  if (error) {
    console.error("No se pudo leer el recuento del catering:", error);
    return [];
  }

  return ((data as FilaRecuento[] | null) ?? []).map((fila) => ({
    tipoMenu: fila.tipo_menu,
    confirmados: fila.confirmados,
    conAlergias: fila.con_alergias,
    ajuste: fila.ajuste,
    total: fila.total,
    nota: fila.nota,
    corregidoEn: fila.corregido_en,
  }));
}

export interface CabezasDelRecuento {
  ninos: number;
  adultos: number;
  /** Ni confirmados ni rechazados: todavía no han contestado. */
  sinContestar: number;
}

/**
 * Cuántos niños, cuántos adultos y cuántos siguen sin contestar.
 *
 * LOS NIÑOS NO SE CUENTAN POR SU MENÚ, y la base lo deja escrito en el `check`
 * de `invitados`: el menú infantil es exclusivo de menores, pero un menor puede
 * llevar menú sin gluten. Contar «infantil» daría de menos justo en la cifra
 * que decide cuántas tronas hacen falta. Se cuenta por `es_nino`, que es el
 * dato fiable.
 *
 * Y LOS QUE NO HAN CONTESTADO VAN APARTE, nunca sumados a un menú. Su
 * `tipo_menu` dice «estándar» porque es el valor por defecto de la columna, no
 * porque nadie haya pedido nada: sumarlos sería encargar comida para gente que
 * a lo mejor no viene, y el catering la cobra igual.
 */
export async function obtenerCabezas(): Promise<CabezasDelRecuento> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("invitados")
    .select("es_nino, confirmaciones ( estado, es_vigente )");

  if (error) {
    console.error("No se pudieron contar los invitados del recuento:", error);
    return { ninos: 0, adultos: 0, sinContestar: 0 };
  }

  const filas =
    (data as unknown as
      | { es_nino: boolean; confirmaciones: { estado: string; es_vigente: boolean }[] | null }[]
      | null) ?? [];

  const cabezas = { ninos: 0, adultos: 0, sinContestar: 0 };

  for (const fila of filas) {
    const vigente = fila.confirmaciones?.find((confirmacion) => confirmacion.es_vigente);

    if (vigente?.estado === "confirmado") {
      if (fila.es_nino) cabezas.ninos += 1;
      else cabezas.adultos += 1;
      continue;
    }

    // `tentativo` cuenta como sin contestar: «casi seguro» no es una silla.
    if (vigente?.estado !== "rechazado") cabezas.sinContestar += 1;
  }

  return cabezas;
}

export interface AlergiaEnLaMesa {
  mesa: string | null;
  nombre: string;
  apellidos: string | null;
  tipoMenu: string;
  esNino: boolean;
  alergias: string;
}

interface FilaAlergia {
  mesa: string | null;
  nombre: string;
  apellidos: string | null;
  tipo_menu: string;
  es_nino: boolean;
  alergias: string;
}

/**
 * Quién no puede comer qué, y en qué mesa está sentado.
 *
 * LA MESA ES LA MITAD DEL DATO. «Dos celíacos» no le sirve de nada a quien está
 * repartiendo platos: lo que necesita es «mesa 4, María». La vista ya descarta
 * las alergias en blanco, así que lo que llega aquí es siempre algo que alguien
 * escribió a propósito.
 */
export async function obtenerAlergiasPorMesa(): Promise<AlergiaEnLaMesa[]> {
  const supabase = await clienteServidor();

  const { data, error } = await supabase
    .from("v_alergias_por_mesa")
    .select("mesa, nombre, apellidos, tipo_menu, es_nino, alergias")
    .order("mesa", { ascending: true, nullsFirst: false })
    .order("apellidos", { ascending: true });

  if (error) {
    console.error("No se pudieron leer las alergias por mesa:", error);
    return [];
  }

  return ((data as FilaAlergia[] | null) ?? []).map((fila) => ({
    mesa: fila.mesa,
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    tipoMenu: fila.tipo_menu,
    esNino: fila.es_nino,
    alergias: fila.alergias,
  }));
}
