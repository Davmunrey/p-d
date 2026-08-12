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
  /** La frase de la sección de paisaje. `null` mientras no se haya escrito. */
  frasePaisaje: string | null;
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
  /**
   * La foto de ese momento, o `null`. Es opcional a propósito: la historia se
   * escribe antes de tener las fotos escaneadas, y un hito sin imagen tiene que
   * poder publicarse igual.
   */
  foto: FotoDeHito | null;
}

/**
 * Lo que hace falta de un medio para pintar la foto de un hito.
 *
 * NO ES `Medio` ENTERO. Un hito nunca lleva vídeo —es un recuerdo, no un
 * fondo—, así que arrastrar `tipo` y `posterRuta` obligaría a comprobar en la
 * plantilla algo que la consulta ya descarta.
 */
export interface FotoDeHito {
  ruta: string;
  textoAlternativo: string;
  ancho: number | null;
  alto: number | null;
  marcadorBorroso: string | null;
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
        frase_paisaje: string | null;
        latitud_ceremonia: string | null;
        longitud_ceremonia: string | null;
        correo_contacto: string | null;
        hashtag: string | null;
      }[]
    >`
      select
        nombre_novia, nombre_novio, fecha_hora_ceremonia, fecha_hora_banquete, fecha_limite_rsvp,
        lugar_ceremonia, direccion_ceremonia, lugar_banquete,
        latitud_ceremonia, longitud_ceremonia, correo_contacto, hashtag,
        frase_paisaje
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
    frasePaisaje: fila.frase_paisaje,
    latitud: fila.latitud_ceremonia === null ? null : Number(fila.latitud_ceremonia),
    longitud: fila.longitud_ceremonia === null ? null : Number(fila.longitud_ceremonia),
    correoContacto: fila.correo_contacto,
    hashtag: fila.hashtag,
  };
}

/**
 * Los hitos de un momento: la víspera o el día de la boda.
 *
 * Las dos secciones leen la MISMA tabla, filtrando por `momento`. Un hito de
 * la preboda es exactamente lo mismo —hora, título y descripción— y lo único
 * que cambia es el día; dos tablas iguales se acabarían separando en cuanto
 * una ganara una columna que la otra no.
 */
export async function obtenerPrograma(
  momento: "preboda" | "boda" = "boda",
): Promise<HitoPrograma[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ id: string; hora: string; titulo: string; descripcion: string | null }[]>`
      select id, hora, titulo, descripcion
      from public.hitos_programa
      where momento = ${momento}
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

/**
 * BODA-24 · Los hitos de «nuestra historia», con su foto.
 *
 * `LEFT JOIN` Y NO `JOIN`, que es la diferencia entre una sección que funciona
 * y una que desaparece a medias: la historia se escribe meses antes de tener
 * las fotos escaneadas, así que un hito sin `medio_id` es lo normal al
 * principio y tiene que salir igual.
 *
 * SE EXIGE ADEMÁS QUE LA FOTO ESTÉ PUBLICADA. Un hito publicado puede apuntar a
 * una foto que todavía es borrador —se sube la imagen, se enlaza y se deja para
 * revisar—, y sin esta condición esa foto saldría en la web por la puerta de
 * atrás: RLS protege `medios` cuando se pregunta por `medios`, pero aquí se
 * está preguntando por `hitos_historia`, y el `join` se lleva lo que encuentre.
 * En ese caso sale el hito con su texto y sin imagen, que es lo correcto.
 *
 * `where publicado` está de más —la política `hitos_historia_lectura_publica`
 * ya lo impone para `anon`— y se escribe igual, por lo mismo que en
 * `obtenerMedios`: quien lee esta consulta tiene que ver la intención sin ir a
 * buscar la política.
 */
export async function obtenerHistoria(): Promise<HitoHistoria[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<
      {
        id: string;
        titulo: string;
        fecha_texto: string | null;
        descripcion: string | null;
        ruta_almacenamiento: string | null;
        texto_alternativo: Record<string, string> | null;
        ancho: number | null;
        alto: number | null;
        marcador_borroso: string | null;
      }[]
    >`
      select h.id, h.titulo, h.fecha_texto, h.descripcion,
             m.ruta_almacenamiento, m.texto_alternativo,
             m.ancho, m.alto, m.marcador_borroso
      from public.hitos_historia as h
      left join public.medios as m
        on m.id = h.medio_id and m.publicado and m.tipo = 'imagen'
      where h.publicado
      order by h.orden
    `,
  );

  return filas.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    fechaTexto: f.fecha_texto,
    descripcion: f.descripcion,
    foto: f.ruta_almacenamiento
      ? {
          ruta: f.ruta_almacenamiento,
          textoAlternativo:
            f.texto_alternativo?.es ?? Object.values(f.texto_alternativo ?? {})[0] ?? "",
          ancho: f.ancho,
          alto: f.alto,
          marcadorBorroso: f.marcador_borroso,
        }
      : null,
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

export interface ConsejoVestimenta {
  id: string;
  titulo: string;
  texto: string;
}

/** Los bloques del dress code —«Ellas», «Ellos»…—, en su orden. */
export async function obtenerConsejosVestimenta(): Promise<ConsejoVestimenta[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ id: string; titulo: string; texto: string }[]>`
      select id, titulo, texto
      from public.consejos_vestimenta
      order by orden
    `,
  );
  return filas.map((f) => ({ id: f.id, titulo: f.titulo, texto: f.texto }));
}

export interface CuentaRegalos {
  iban: string;
  titular: string | null;
}

/**
 * La cuenta para los regalos, o `null`.
 *
 * NO SE LEE UNA TABLA, se llama a `datos_para_regalos()`. El IBAN vive en
 * `configuracion_privada`, que `anon` no puede tocar —lo comprueba
 * `tests/seguridad`—, y esa función es la única puerta por la que sale: se abre
 * sólo cuando la sección de regalos está encendida.
 *
 * Devuelve `null` cuando no hay cuenta que enseñar, que es lo mismo que dice la
 * base: cero filas. Aquí no se decide nada, sólo se traduce.
 */
export async function obtenerCuentaRegalos(): Promise<CuentaRegalos | null> {
  const filas = await leerComoAnonimo(
    (tx) => tx<{ iban: string; titular: string | null }[]>`
      select iban, titular from public.datos_para_regalos()
    `,
  );
  const cuenta = filas[0];
  return cuenta ? { iban: cuenta.iban, titular: cuenta.titular } : null;
}

export interface Medio {
  id: string;
  /** Ruta relativa dentro del bucket, tal y como la valida la base. */
  ruta: string;
  textoAlternativo: string;
  ancho: number | null;
  alto: number | null;
  /** Miniatura en base64 para pintar algo mientras carga la de verdad. */
  marcadorBorroso: string | null;
  /** Imagen o vídeo. Lo dice la base, no la extensión del fichero. */
  tipo: "imagen" | "video";
  /** El fotograma quieto de un vídeo. `null` en las imágenes. */
  posterRuta: string | null;
}

/**
 * Las imágenes publicadas de una sección, en su orden.
 *
 * Sólo devuelve las que están `publicado`: RLS ya lo impone para `anon`, pero
 * se escribe igual porque esta consulta también se lee, y quien la lee tiene
 * que ver la intención sin ir a buscar la política.
 *
 * El texto alternativo es `jsonb` por idioma. La boda es sólo en castellano
 * —decisión cerrada en el plan maestro—, así que se saca `es` y se cae al
 * primer valor que haya si alguien cargó otro idioma: una imagen sin
 * alternativa es peor que una con la alternativa en el idioma equivocado.
 */
export async function obtenerMedios(seccion: Seccion): Promise<Medio[]> {
  const filas = await leerComoAnonimo(
    (tx) => tx<
      {
        id: string;
        ruta_almacenamiento: string;
        texto_alternativo: Record<string, string>;
        ancho: number | null;
        alto: number | null;
        marcador_borroso: string | null;
        tipo: "imagen" | "video";
        poster_ruta: string | null;
      }[]
    >`
      select id, ruta_almacenamiento, texto_alternativo, ancho, alto, marcador_borroso,
             tipo, poster_ruta
      from public.medios
      where publicado and seccion = ${seccion}::public.seccion_landing
      order by orden nulls last, creado_en
    `,
  );

  return filas.map((f) => ({
    id: f.id,
    ruta: f.ruta_almacenamiento,
    textoAlternativo:
      f.texto_alternativo?.es ?? Object.values(f.texto_alternativo ?? {})[0] ?? "",
    ancho: f.ancho,
    alto: f.alto,
    marcadorBorroso: f.marcador_borroso,
    tipo: f.tipo,
    posterRuta: f.poster_ruta,
  }));
}

/**
 * BODA-25 · Una foto de la galería.
 *
 * NO ES `Medio`, y la diferencia está en dos campos que aquí NO admiten nulo.
 * Una rejilla se compone de huecos, y un hueco sin medidas no se puede
 * reservar: la foto entra al cargar, empuja a las de al lado y la página pega
 * un salto justo cuando alguien iba a pulsar. Exigirlas en el tipo le ahorra al
 * componente preguntar «¿y si faltan?» y decidir sobre la marcha qué pinta en
 * ese hueco.
 *
 * Tampoco lleva `tipo` ni `posterRuta`: la galería es de fotos. Un vídeo se
 * abre, se pausa y se cierra —otra pieza entera—, y arrastrar esos campos
 * obligaría a comprobar en la plantilla algo que la consulta ya descarta.
 */
export interface FotoGaleria {
  id: string;
  /** Ruta relativa dentro del bucket, tal y como la valida la base. */
  ruta: string;
  textoAlternativo: string;
  ancho: number;
  alto: number;
  /** Miniatura en base64 para pintar algo mientras carga la de verdad. */
  marcadorBorroso: string | null;
}

/**
 * Las fotos publicadas de la galería, en el orden que les puso el panel.
 *
 * LO QUE NO SE PUEDE PINTAR SE DESCARTA EN LA CONSULTA, no en la plantilla:
 *
 * - `tipo = 'imagen'`, por lo que dice `FotoGaleria`.
 * - `ancho` y `alto` no nulos. La base los admite vacíos a propósito —hay
 *   formatos que el servidor no sabe medir, y un AVIF sin medir es mejor que un
 *   AVIF rechazado—, pero una foto sin medidas no entra en una rejilla sin
 *   provocar el salto de maquetación que el plan maestro quiere evitar. La
 *   restricción `medios_dimensiones_coherentes` ya obliga a que las dos vayan
 *   juntas, así que preguntar por una bastaría; se preguntan las dos porque el
 *   día que alguien la relaje, esto no se enteraría.
 *
 * EL TEXTO ALTERNATIVO NO SE COMPRUEBA, y es a propósito: el disparador
 * `medios_validar_texto_alternativo` no deja entrar un medio sin alternativa de
 * entre 3 y 300 caracteres en el idioma de la boda. Repetirlo aquí sería fingir
 * que la base puede devolver algo que no puede devolver.
 *
 * `where publicado` está de más —RLS ya lo impone para `anon`— y se escribe
 * igual, por lo mismo que en `obtenerMedios`: quien lee esta consulta tiene que
 * ver la intención sin ir a buscar la política.
 */
export async function obtenerGaleria(): Promise<FotoGaleria[]> {
  // Con nombre y tipado: el día que `galeria` deje de ser un valor del
  // enumerado, esto no compila en lugar de devolver cero filas en silencio.
  const seccion: Seccion = "galeria";

  const filas = await leerComoAnonimo(
    (tx) => tx<
      {
        id: string;
        ruta_almacenamiento: string;
        texto_alternativo: Record<string, string>;
        ancho: number;
        alto: number;
        marcador_borroso: string | null;
      }[]
    >`
      select id, ruta_almacenamiento, texto_alternativo, ancho, alto, marcador_borroso
      from public.medios
      where publicado
        and seccion = ${seccion}::public.seccion_landing
        and tipo = 'imagen'
        and ancho is not null
        and alto is not null
      order by orden nulls last, creado_en
    `,
  );

  return filas.map((f) => ({
    id: f.id,
    ruta: f.ruta_almacenamiento,
    textoAlternativo:
      f.texto_alternativo?.es ?? Object.values(f.texto_alternativo ?? {})[0] ?? "",
    ancho: f.ancho,
    alto: f.alto,
    marcadorBorroso: f.marcador_borroso,
  }));
}
