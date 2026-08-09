import "server-only";

import { esSeccionConocida, type Seccion } from "@/config/secciones";

import { leerComoAnonimo } from "./cliente";

/**
 * CONSULTAS DE LA LANDING
 *
 * Un sitio para todo lo que la web pública necesita saber. Los componentes no
 * escriben SQL: piden datos ya tipados.
 *
 * Todas las lecturas se ejecutan como `anon`, así que lo que devuelven es
 * exactamente lo que puede ver un invitado. No hay filtrado en el frontend
 * porque no hace falta: lo hace la base de datos.
 *
 * ESTAS FUNCIONES LANZAN si la base no responde. No devuelven listas vacías
 * disfrazando la avería: una lista vacía significa «no hay nada que enseñar» y
 * tiene que seguir significando eso. Quien pinta la página decide qué hacer con
 * el fallo, y así puede distinguir «todavía no hay hoteles» de «no he podido
 * preguntar».
 */

export interface ConfiguracionBoda {
  nombreNovia: string;
  nombreNovio: string;
  fechaCeremonia: Date;
  fechaBanquete: Date | null;
  fechaLimiteRsvp: Date | null;
  lugarCeremonia: string | null;
  direccionCeremonia: string | null;
  lugarBanquete: string | null;
  latitud: number | null;
  longitud: number | null;
  correoContacto: string | null;
  hashtag: string | null;
}

export interface HitoPrograma {
  id: string;
  hora: string;
  titulo: string;
  descripcion: string | null;
}

export interface Alojamiento {
  id: string;
  nombre: string;
  distintivo: string | null;
  descripcion: string | null;
  precioTexto: string | null;
  urlReserva: string | null;
}

export interface RutaLlegada {
  id: string;
  modo: string;
  duracion: string | null;
  detalle: string | null;
}

export interface PreguntaFrecuente {
  id: string;
  pregunta: string;
  respuesta: string;
}

export interface HitoHistoria {
  id: string;
  titulo: string;
  fechaTexto: string | null;
  descripcion: string | null;
}

export interface Cancion {
  id: string;
  texto: string;
}

/**
 * Secciones que la web debe enseñar, en el orden en que van.
 *
 * Se lee de `v_secciones_publicas`, que ya filtra por `visible` y ordena por
 * `orden`. Además la política RLS de la tabla base es `using (visible)`, así
 * que a `anon` no le llega una sección apagada ni saltándose la vista: el
 * frontend no filtra nada porque no le hace falta.
 *
 * Si la consulta falla devuelve lista vacía y quien llama decide qué enseñar;
 * nunca se inventa un orden por defecto.
 *
 * Un valor que el frontend no sepa pintar se descarta con un aviso en el log,
 * en lugar de tumbar la página: la base de datos puede ir por delante de un
 * despliegue.
 */
export async function obtenerSecciones(): Promise<Seccion[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ seccion: string }[]>`
      select seccion
      from public.v_secciones_publicas
    `,
  );

  const conocidas: Seccion[] = [];
  for (const fila of filas) {
    if (esSeccionConocida(fila.seccion)) {
      conocidas.push(fila.seccion);
    } else {
      console.warn(
        `Sección desconocida en secciones_landing: "${fila.seccion}". Se omite; ` +
          "probablemente la base de datos va por delante del despliegue.",
      );
    }
  }
  return conocidas;
}

/**
 * Configuración de la boda. Devuelve `null` si todavía no se ha configurado,
 * para que la landing pueda decirlo en lugar de romperse.
 */
export async function obtenerConfiguracion(): Promise<ConfiguracionBoda | null> {
  const filas = await leerComoAnonimo(
    (tx) => tx<
      {
        nombre_novia: string;
        nombre_novio: string;
        fecha_hora_ceremonia: Date;
        fecha_hora_banquete: Date | null;
        fecha_limite_rsvp: Date | null;
        lugar_ceremonia: string | null;
        direccion_ceremonia: string | null;
        lugar_banquete: string | null;
        latitud_ceremonia: string | null;
        longitud_ceremonia: string | null;
        correo_contacto: string | null;
        hashtag: string | null;
      }[]
    >`
      select
        nombre_novia, nombre_novio, fecha_hora_ceremonia, fecha_hora_banquete, fecha_limite_rsvp,
        lugar_ceremonia, direccion_ceremonia, lugar_banquete,
        latitud_ceremonia, longitud_ceremonia, correo_contacto, hashtag
      from public.v_configuracion_publica
      limit 1
    `,
  );

  const fila = filas[0];
  if (!fila) return null;

  return {
    nombreNovia: fila.nombre_novia,
    nombreNovio: fila.nombre_novio,
    fechaCeremonia: fila.fecha_hora_ceremonia,
    fechaBanquete: fila.fecha_hora_banquete,
    fechaLimiteRsvp: fila.fecha_limite_rsvp,
    lugarCeremonia: fila.lugar_ceremonia,
    direccionCeremonia: fila.direccion_ceremonia,
    lugarBanquete: fila.lugar_banquete,
    latitud: fila.latitud_ceremonia === null ? null : Number(fila.latitud_ceremonia),
    longitud: fila.longitud_ceremonia === null ? null : Number(fila.longitud_ceremonia),
    correoContacto: fila.correo_contacto,
    hashtag: fila.hashtag,
  };
}

export async function obtenerPrograma(): Promise<HitoPrograma[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ id: string; hora: string; titulo: string; descripcion: string | null }[]>`
      select id, hora, titulo, descripcion
      from public.hitos_programa
      order by orden, hora
    `,
  );
  return filas.map((f) => ({
    id: f.id,
    hora: f.hora,
    titulo: f.titulo,
    descripcion: f.descripcion,
  }));
}

export async function obtenerAlojamientos(): Promise<Alojamiento[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<
      {
        id: string;
        nombre: string;
        distintivo: string | null;
        descripcion: string | null;
        precio_texto: string | null;
        url_reserva: string | null;
      }[]
    >`
      select id, nombre, distintivo, descripcion, precio_texto, url_reserva
      from public.alojamientos
      order by orden, nombre
    `,
  );
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    distintivo: f.distintivo,
    descripcion: f.descripcion,
    precioTexto: f.precio_texto,
    urlReserva: f.url_reserva,
  }));
}

export async function obtenerRutas(): Promise<RutaLlegada[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ id: string; modo: string; duracion: string | null; detalle: string | null }[]>`
      select id, modo, duracion, detalle
      from public.rutas_llegada
      order by orden, modo
    `,
  );
  return filas.map((f) => ({
    id: f.id,
    modo: f.modo,
    duracion: f.duracion,
    detalle: f.detalle,
  }));
}

export async function obtenerPreguntasFrecuentes(): Promise<PreguntaFrecuente[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ id: string; pregunta: string; respuesta: string }[]>`
      select id, pregunta, respuesta
      from public.preguntas_frecuentes
      order by orden
    `,
  );
  return filas.map((f) => ({ id: f.id, pregunta: f.pregunta, respuesta: f.respuesta }));
}

export async function obtenerHistoria(): Promise<HitoHistoria[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<
      { id: string; titulo: string; fecha_texto: string | null; descripcion: string | null }[]
    >`
      select id, titulo, fecha_texto, descripcion
      from public.hitos_historia
      order by orden
    `,
  );
  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    fechaTexto: f.fecha_texto,
    descripcion: f.descripcion,
  }));
}

export async function obtenerCanciones(limite = 30): Promise<Cancion[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ id: string; texto: string }[]>`
      select id, texto
      from public.canciones_sugeridas
      order by creado_en desc
      limit ${limite}
    `,
  );
  return filas.map((f) => ({ id: f.id, texto: f.texto }));
}
