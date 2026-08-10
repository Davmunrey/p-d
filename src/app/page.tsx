import { Fragment, type ReactNode } from "react";

import { EnPreparacion } from "@/components/marketing/en-preparacion";
import { HuecoFoto } from "@/components/marketing/hueco-foto";
import { Navegacion } from "@/components/marketing/navegacion";
import { Pie } from "@/components/marketing/pie";
import { CuentaAtras } from "@/components/marketing/cuenta-atras";
import { BotonEnlace } from "@/components/ui/boton";
import {
  Cita,
  Conector,
  Cuerpo,
  Display,
  Etiqueta,
  EtiquetaSeccion,
  Titulo1,
  Titulo3,
} from "@/components/ui/tipografia";
import { ID_CONTENIDO, IDIOMA, ZONA_HORARIA } from "@/config/constants";
import { anclaDe, esAncla, type Seccion } from "@/config/secciones";
import {
  obtenerAlojamientos,
  obtenerCanciones,
  obtenerConfiguracion,
  obtenerHistoria,
  obtenerPreguntasFrecuentes,
  obtenerPrograma,
  obtenerRutas,
  obtenerMedios,
  obtenerSecciones,
  type ConfiguracionBoda,
  type Medio,
} from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * LANDING
 *
 * Todo lo que se ve aquí sale de la base de datos. No hay ni un dato de la boda
 * escrito en el código: cambiar la hora de la ceremonia o añadir un hotel se
 * hace desde el panel y se refleja aquí sin tocar nada.
 *
 * QUÉ SE ENSEÑA Y EN QUÉ ORDEN TAMPOCO LO DECIDE ESTE FICHERO. Lo decide la
 * tabla `secciones_landing`: apagar una sección la quita de la página y del
 * menú a la vez. Aquí solo vive el cómo se pinta cada una.
 *
 * Una sección se enseña si cumple las dos cosas: que la base de datos la dé
 * por visible **y** que haya contenido que pintar. La segunda condición no es
 * un capricho: `galeria` y `ubicaciones` están encendidas desde el primer día
 * y todavía no existen (son BODA-25 y BODA-26). Sin ese filtro, el menú
 * ofrecería dos enlaces que no llevan a ninguna parte.
 *
 * NO SE CACHEA, y es un cambio respecto a cómo nació.
 *
 * Antes se revalidaba cada hora, así que la página se generaba en el despliegue
 * y se servía desde caché. El problema no era el caso bueno: era el malo. Si la
 * base no respondía justo en ese momento —caída, en pausa por inactividad del
 * plan gratuito, o una variable de entorno que aún no estaba—, lo que se
 * horneaba y se servía **durante una hora entera** era la pantalla de «estamos
 * preparando la web». La base podía volver a estar bien a los diez segundos y
 * los invitados seguían viendo eso.
 *
 * Pasó en producción. Ahora se consulta en cada visita: son ocho consultas
 * indexadas sobre tablas de pocas filas, lanzadas a la vez, y la web tiene unos
 * cientos de visitas en total. Cuesta unos milisegundos y a cambio nunca se
 * queda enganchada en un fallo — ni enseñando datos viejos después de un
 * cambio en el panel.
 */
export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

const formatoFechaCorta = new Intl.DateTimeFormat(IDIOMA, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

/**
 * `26 · 06 · 2027`, como en la entrega.
 *
 * Se compone a partir de las partes que da `Intl`, no cortando la cadena
 * formateada: el orden de día y mes depende del idioma, y trocear texto
 * formateado es la forma clásica de acabar publicando el mes como día.
 */
function fechaEnPuntos(fecha: Date): string {
  const partes = Object.fromEntries(
    formatoFechaCorta.formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  return [partes.day, partes.month, partes.year].join(" · ");
}

export default async function PaginaInicio() {
  let datos;
  try {
    datos = await cargarLanding();
  } catch {
    // La avería ya se registró en el log con su motivo. Aquí sólo se decide
    // qué ve el invitado, y lo que ve es la verdad: todavía no hay nada.
    return <EnPreparacion />;
  }

  const {
    secciones,
    configuracion,
    programa,
    preboda,
    historia,
    alojamientos,
    rutas,
    preguntas,
    canciones,
    fotosPortada,
  } = datos;

  // Sin configuración no hay boda que enseñar: la base respondió, pero el panel
  // aún está vacío. Se dice con claridad, en lugar de pintar una página rota o
  // inventarse datos para tapar el hueco.
  if (!configuracion) return <EnPreparacion />;

  const nombres = `${configuracion.nombreNovia} ${t("portada.conjuncion")} ${configuracion.nombreNovio}`;

  const contenido: Partial<Record<Seccion, ReactNode>> = {
    portada: (
      <Portada
        configuracion={configuracion}
        foto={fotosPortada[0] ?? null}
        urlBase={process.env.NEXT_PUBLIC_SUPABASE_URL}
      />
    ),
    cuenta_atras: <CuentaAtrasSeccion configuracion={configuracion} />,
    historia: historia.length > 0 ? <Historia hitos={historia} /> : undefined,
    preboda:
      preboda.length > 0 ? (
        <ListaDeHoras
          seccion="preboda"
          etiqueta={t("preboda.etiqueta")}
          titulo={t("preboda.titulo")}
          entradilla={t("preboda.entradilla")}
          realzada
          hundida
          hitos={preboda}
        />
      ) : undefined,
    programa:
      programa.length > 0 ? (
        <ListaDeHoras
          seccion="programa"
          etiqueta={formatoFecha.format(configuracion.fechaCeremonia)}
          titulo={t("programa.titulo")}
          hitos={programa}
        />
      ) : undefined,
    alojamiento: alojamientos.length > 0 ? <Alojamiento sitios={alojamientos} /> : undefined,
    transporte:
      rutas.length > 0 ? <Transporte rutas={rutas} configuracion={configuracion} /> : undefined,
    preguntas_frecuentes:
      preguntas.length > 0 ? <Preguntas preguntas={preguntas} /> : undefined,
    playlist: <Playlist canciones={canciones} />,
    rsvp: <Rsvp configuracion={configuracion} />,
  };

  // El orden lo pone la base de datos; el filtro, lo que de verdad hay hecho.
  const aPintar = secciones.filter((seccion) => esAncla(seccion) && contenido[seccion]);

  const enlaces = aPintar.map((seccion) => ({
    seccion,
    ancla: anclaDe(seccion),
    rotulo: t(`navegacion.secciones.${seccion}`),
  }));

  return (
    <>
      {/* Primer elemento enfocable del documento: quien navega con teclado no
          debería tener que recorrer once enlaces para llegar al contenido. */}
      <a
        href={`#${ID_CONTENIDO}`}
        className="sr-only capa-cabecera focus:not-sr-only focus:absolute focus:m-interno focus:rounded-boton focus:bg-superficie focus:px-interno focus:py-pila focus:text-tinta"
      >
        {t("navegacion.irAlContenido")}
      </a>

      <Navegacion
        enlaces={enlaces}
        etiqueta={t("navegacion.etiquetaPrincipal")}
        marca={nombres}
      />

      <main id={ID_CONTENIDO}>
        {aPintar.map((seccion) => (
          <Fragment key={seccion}>{contenido[seccion]}</Fragment>
        ))}
      </main>

      <Pie
        nombres={nombres}
        correoContacto={configuracion.correoContacto}
        hashtag={configuracion.hashtag}
        enlaces={enlaces}
      />
    </>
  );
}

/** Todo lo que la landing necesita, pedido de una vez. */
async function cargarLanding() {
  const [
    secciones,
    configuracion,
    programa,
    preboda,
    historia,
    alojamientos,
    rutas,
    preguntas,
    canciones,
    fotosPortada,
  ] = await Promise.all([
    obtenerSecciones(),
    obtenerConfiguracion(),
    obtenerPrograma("boda"),
    obtenerPrograma("preboda"),
    obtenerHistoria(),
    obtenerAlojamientos(),
    obtenerRutas(),
    obtenerPreguntasFrecuentes(),
    obtenerCanciones(),
    obtenerMedios("portada"),
  ]);

  return {
    secciones,
    configuracion,
    programa,
    preboda,
    historia,
    alojamientos,
    rutas,
    preguntas,
    canciones,
    fotosPortada,
  };
}

/* ------------------------------------------------------------------------ */
/* Secciones                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * LA PORTADA
 *
 * La pantalla partida de la entrega: el texto ocupa una mitad y la foto la
 * otra, y en cuanto no caben dos columnas —móvil, o una ventana estrecha— se
 * apilan solas. No hay `breakpoint` escrito: lo resuelve `auto-fit` con un
 * ancho mínimo de columna, así que el corte pasa cuando de verdad estorba y no
 * a un número redondo.
 *
 * LA PARTICIÓN SÓLO EXISTE SI HAY FOTO. Todavía no las hay —la sesión de
 * preboda ni siquiera está decidida— y media pantalla en blanco no se lee como
 * una decisión de diseño, se lee como algo que no ha cargado. Sin foto, el
 * texto se queda en una columna centrada y la portada se sostiene sola; el día
 * que se publique una imagen, `auto-fit` abre la segunda columna sin que haya
 * que tocar nada.
 *
 * El bloque de datos usa `--texto-titulo-2` y la fecha va en `26 · 06 · 2027`,
 * que es como la escribe la marca en todas las piezas.
 */
function Portada({
  configuracion,
  foto,
  urlBase,
}: {
  configuracion: ConfiguracionBoda;
  foto: Medio | null;
  urlBase: string | undefined;
}) {
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;
  const procedencia = configuracion.direccionCeremonia;

  return (
    <section id={anclaDe("portada")} className="rejilla-partida min-h-dvh items-stretch">
      <div
        className={`flex w-full flex-col justify-center px-interno py-seccion-compacta sm:px-bloque ${
          foto ? "" : "mx-auto max-w-contenido"
        }`}
      >
        {procedencia ? (
          <p className="animacion-aparecer text-etiqueta uppercase tracking-marcado text-acento">
            {procedencia}
          </p>
        ) : null}

        <Display className="animacion-subir mt-pila">{configuracion.nombreNovia}</Display>
        <div className="animacion-subir flex flex-wrap items-baseline gap-elemento">
          <Conector>{t("portada.conjuncion")}</Conector>
          <Display como="p">{configuracion.nombreNovio}</Display>
        </div>

        <hr className="animacion-trazar my-bloque border-t border-borde-fuerte" />

        <dl className="animacion-subir flex flex-wrap gap-bloque">
          <div>
            <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
              {t("portada.etiquetaFecha")}
            </dt>
            <dd className="mt-linea font-titulo text-titulo-2 text-tinta-marca tabular-nums">
              <time dateTime={configuracion.fechaCeremonia.toISOString()}>
                {fechaEnPuntos(configuracion.fechaCeremonia)}
              </time>
            </dd>
          </div>
          {lugar ? (
            <div>
              <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
                {t("portada.etiquetaLugar")}
              </dt>
              <dd className="mt-linea font-titulo text-titulo-2 text-tinta-marca">{lugar}</dd>
            </div>
          ) : null}
        </dl>

        <div className="animacion-subir mt-bloque flex flex-wrap gap-interno">
          <BotonEnlace href={`#${anclaDe("rsvp")}`}>
            {t("portada.confirmarAsistencia")}
          </BotonEnlace>
          <BotonEnlace href={`#${anclaDe("programa")}`} jerarquia="secundario">
            {t("portada.verElDia")}
          </BotonEnlace>
        </div>

        {/*
          El aviso de que la página sigue hacia abajo. Con una portada a
          pantalla completa hay quien se queda ahí sin saber que hay más, y
          este es el trabajo que hace la entrega con dos elementos y ningún
          icono: una versalita y una raya que respira.

          `aria-hidden` porque para quien navega con lector de pantalla no
          significa nada: el documento ya continúa, y anunciar «bajad» sería
          ruido. La animación es de las que se apagan con movimiento reducido.
        */}
        <p
          aria-hidden
          className="animacion-aparecer mt-elemento flex items-center gap-interno-compacto text-diminuto uppercase tracking-marcado text-tinta-tenue"
        >
          {t("portada.bajad")}
          <span className="animacion-flotar block h-elemento w-px bg-gradient-to-b from-borde-fuerte to-transparent" />
        </p>
      </div>

      {foto ? (
        <HuecoFoto
          medio={foto}
          urlBase={urlBase}
          prioritaria
          medidas="(min-width: 40rem) 50vw, 100vw"
          className="alto-foto-portada"
        />
      ) : null}
    </section>
  );
}

/**
 * LA CUENTA ATRÁS, BAJO UN CIELO
 *
 * En la entrega no es una franja de color: es una noche. El fondo lleva cuatro
 * capas de estrellas que derivan durante 44 s y titilan cada 7, tan despacio
 * que no se leen como animación — sólo se nota que el bloque está vivo.
 *
 * El cielo es decoración pura, así que va `aria-hidden` y por debajo del
 * contenido. Y se apaga entero con `prefers-reduced-motion`: un fondo en
 * movimiento perpetuo es justo lo que marea a quien activa esa preferencia.
 */
function CuentaAtrasSeccion({ configuracion }: { configuracion: ConfiguracionBoda }) {
  const idTitulo = `titulo-${anclaDe("cuenta_atras")}`;
  return (
    <section
      id={anclaDe("cuenta_atras")}
      data-seccion="inversa"
      className="relative overflow-hidden px-interno py-seccion-compacta text-center"
      aria-labelledby={idTitulo}
    >
      <div
        aria-hidden
        className="animacion-cielo cielo-estrellado pointer-events-none absolute -inset-bloque"
      />

      <div className="animacion-cortina-al-ver relative mx-auto max-w-estrecho">
        <Etiqueta id={idTitulo}>{t("cuentaAtras.titulo")}</Etiqueta>
        <div className="mt-elemento">
          <CuentaAtras fechaIso={configuracion.fechaCeremonia.toISOString()} />
        </div>
        <Cita className="mx-auto mt-bloque max-w-texto text-tinta-suave">
          {t("cuentaAtras.cierre")}
        </Cita>
      </div>
    </section>
  );
}

function Historia({
  hitos,
}: {
  hitos: {
    id: string;
    titulo: string;
    fechaTexto: string | null;
    descripcion: string | null;
  }[];
}) {
  return (
    <Bloque
      seccion="historia"
      etiqueta={t("historia.etiqueta")}
      titulo={t("historia.titulo")}
      realzada
    >
      <ol className="grid gap-bloque sm:grid-cols-3">
        {hitos.map((hito) => (
          <li key={hito.id} className="animacion-subir-al-ver">
            {hito.fechaTexto ? <Etiqueta>{hito.fechaTexto}</Etiqueta> : null}
            <Titulo3 className="mt-pila">{hito.titulo}</Titulo3>
            {hito.descripcion ? <Cuerpo className="mt-linea">{hito.descripcion}</Cuerpo> : null}
          </li>
        ))}
      </ol>
    </Bloque>
  );
}

/**
 * LA LISTA DE HORAS
 *
 * La usan el programa del día y la víspera, que son la misma pieza con otros
 * datos: hora a la izquierda, título y detalle a la derecha, una línea entre
 * filas. La diferencia está en la cabecera —una lleva la fecha de la boda y la
 * otra un rótulo— y en el realce: la preboda es un extra, así que su versalita
 * va en bronce; el programa del día hay que leerlo sí o sí, y va sobrio.
 */
function ListaDeHoras({
  seccion,
  etiqueta,
  titulo,
  entradilla = null,
  realzada = false,
  hundida = false,
  hitos,
}: {
  seccion: Seccion;
  etiqueta: string;
  titulo: string;
  entradilla?: string | null;
  realzada?: boolean;
  hundida?: boolean;
  hitos: { id: string; hora: string; titulo: string; descripcion: string | null }[];
}) {
  return (
    <Bloque
      seccion={seccion}
      etiqueta={etiqueta}
      titulo={titulo}
      entradilla={entradilla}
      realzada={realzada}
      hundida={hundida}
    >
      <ol className="border-t border-borde">
        {hitos.map((hito) => (
          <li
            key={hito.id}
            className="animacion-subir-al-ver rejilla-dato gap-elemento border-b border-borde py-elemento"
          >
            <span className="font-titulo text-titulo-3 text-acento tabular-nums">
              {hito.hora}
            </span>
            <div>
              <Titulo3 como="h3">{hito.titulo}</Titulo3>
              {hito.descripcion ? (
                <Cuerpo className="mt-linea max-w-texto">{hito.descripcion}</Cuerpo>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Bloque>
  );
}

function Alojamiento({
  sitios,
}: {
  sitios: {
    id: string;
    nombre: string;
    distintivo: string | null;
    descripcion: string | null;
    precioTexto: string | null;
    urlReserva: string | null;
  }[];
}) {
  return (
    <Bloque
      seccion="alojamiento"
      etiqueta={t("alojamiento.etiqueta")}
      titulo={t("alojamiento.titulo")}
      hundida
    >
      <ul className="grid gap-elemento sm:grid-cols-2 lg:grid-cols-3">
        {sitios.map((sitio) => (
          <li
            key={sitio.id}
            className="animacion-subir-al-ver flex flex-col rounded-tarjeta border border-borde bg-superficie p-elemento"
          >
            {sitio.distintivo ? <Etiqueta>{sitio.distintivo}</Etiqueta> : null}
            <Titulo3 como="h3" className="mt-pila">
              {sitio.nombre}
            </Titulo3>
            {sitio.descripcion ? (
              <Cuerpo className="mt-linea flex-1">{sitio.descripcion}</Cuerpo>
            ) : null}
            <div className="mt-elemento flex items-baseline justify-between gap-interno border-t border-borde-tenue pt-interno">
              {sitio.precioTexto ? (
                <span className="font-titulo text-titulo-3">{sitio.precioTexto}</span>
              ) : (
                <span />
              )}
              {sitio.urlReserva ? (
                <a
                  href={sitio.urlReserva}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-etiqueta uppercase tracking-etiqueta text-marca transicion-color hover:text-tinta"
                >
                  {t("alojamiento.reservar")}
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

function Transporte({
  rutas,
  configuracion,
}: {
  rutas: { id: string; modo: string; duracion: string | null; detalle: string | null }[];
  configuracion: ConfiguracionBoda;
}) {
  return (
    <Bloque
      seccion="transporte"
      etiqueta={t("comoLlegar.etiqueta")}
      titulo={t("comoLlegar.titulo")}
    >
      <div className="grid gap-bloque lg:grid-cols-2">
        <ul className="border-t border-borde">
          {rutas.map((ruta) => (
            <li
              key={ruta.id}
              className="rejilla-dato gap-elemento border-b border-borde py-pila"
            >
              <span className="font-titulo text-titulo-3 text-marca">{ruta.duracion}</span>
              <div>
                <h3 className="text-etiqueta uppercase tracking-etiqueta text-tinta">
                  {ruta.modo}
                </h3>
                {ruta.detalle ? <Cuerpo className="mt-linea">{ruta.detalle}</Cuerpo> : null}
              </div>
            </li>
          ))}
        </ul>

        {configuracion.latitud !== null && configuracion.longitud !== null ? (
          <div className="self-start">
            <BotonEnlace
              href={`https://www.google.com/maps/search/?api=1&query=${configuracion.latitud},${configuracion.longitud}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("comoLlegar.abrirMapa")}
            </BotonEnlace>
          </div>
        ) : null}
      </div>
    </Bloque>
  );
}

function Preguntas({
  preguntas,
}: {
  preguntas: { id: string; pregunta: string; respuesta: string }[];
}) {
  return (
    <Bloque
      seccion="preguntas_frecuentes"
      etiqueta={t("preguntas.etiqueta")}
      titulo={t("preguntas.titulo")}
      hundida
    >
      <ul className="mx-auto max-w-estrecho border-t border-borde">
        {preguntas.map((pregunta) => (
          <li key={pregunta.id} className="border-b border-borde">
            {/* Acordeón nativo: accesible por teclado sin una línea de JS */}
            <details className="group">
              <summary className="cursor-pointer list-none py-elemento font-titulo text-titulo-3 transicion-color hover:text-tinta-marca">
                {pregunta.pregunta}
              </summary>
              <Cuerpo className="max-w-texto pb-elemento">{pregunta.respuesta}</Cuerpo>
            </details>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

function Playlist({ canciones }: { canciones: { id: string; texto: string }[] }) {
  return (
    <Bloque
      seccion="playlist"
      etiqueta={t("playlist.etiqueta")}
      titulo={t("playlist.titulo")}
      entradilla={t("playlist.descripcion")}
      realzada
      centrada
    >
      {canciones.length > 0 ? (
        <ul className="mt-elemento flex flex-wrap justify-center gap-interno-compacto">
          {canciones.map((cancion) => (
            <li
              key={cancion.id}
              className="rounded-etiqueta bg-superficie-tenue px-interno py-linea text-pequeno text-tinta-marca"
            >
              {cancion.texto}
            </li>
          ))}
        </ul>
      ) : (
        <Cuerpo className="mt-elemento text-center">{t("playlist.vacia")}</Cuerpo>
      )}
    </Bloque>
  );
}

function Rsvp({ configuracion }: { configuracion: ConfiguracionBoda }) {
  const idTitulo = `titulo-${anclaDe("rsvp")}`;
  return (
    <section
      id={anclaDe("rsvp")}
      data-seccion="inversa"
      className="px-interno py-seccion-fluida text-center"
      aria-labelledby={idTitulo}
    >
      <div className="mx-auto max-w-estrecho">
        <CabeceraSeccion
          idTitulo={idTitulo}
          etiqueta={
            configuracion.fechaLimiteRsvp
              ? t("rsvp.antesDel", {
                  fecha: formatoFecha.format(configuracion.fechaLimiteRsvp),
                })
              : null
          }
          titulo={t("rsvp.titulo")}
          entradilla={t("rsvp.comoSeConfirma")}
          centrada
        />

        {/*
          Aquí no hay formulario, y es a propósito. Se confirma por el enlace
          personal de cada invitación, que es lo que identifica al grupo: un
          formulario abierto en la web pública dejaría a cualquiera responder
          por cualquiera, y a los novios sin saber quién ha contestado de
          verdad. Lo que sí hay es la manera de recuperar el enlace, porque el
          mensaje de WhatsApp donde llegó se pierde.
        */}
        {configuracion.correoContacto ? (
          <p className="mx-auto max-w-texto text-pequeno text-tinta-suave">
            {t("rsvp.enlacePerdido")}{" "}
            <a
              href={`mailto:${configuracion.correoContacto}`}
              className="border-b border-borde-fuerte transicion-color hover:text-acento"
            >
              {configuracion.correoContacto}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * LA CABECERA DE UNA SECCIÓN
 *
 * El patrón que la entrega repite en todas: versalita arriba, titular grande
 * debajo y —cuando hace falta— una entradilla corta que lo acompaña.
 *
 * Tiene dos composiciones, y la entrega usa las dos. En la **alineada**, que es
 * la de las secciones con contenido debajo, la entradilla va a la derecha del
 * titular y pegada a su línea base; el titular abre la sección por la
 * izquierda, donde empieza a leerse todo lo demás. En la **centrada**, la de
 * las secciones que son una invitación a hacer algo —la playlist, el RSVP—, la
 * entradilla cae bajo el titular y todo se alinea al eje: no hay una lista que
 * seguir, hay una sola cosa que pedir.
 *
 * El titular es un `h2` con el tamaño de `Titulo1`, no de `Titulo2`, y por eso
 * va con la propiedad `como`. Es lo que dice la entrega y se nota: con el
 * tamaño pequeño las secciones no abren, parecen subapartados de la anterior.
 * La jerarquía del documento la sigue marcando la etiqueta, que es lo que oye
 * un lector de pantalla.
 *
 * Vive suelta y no dentro de `Bloque` porque la usan dos marcos distintos: las
 * secciones de contenido y el RSVP, que tiene su propio fondo.
 */
function CabeceraSeccion({
  idTitulo,
  etiqueta,
  titulo,
  entradilla = null,
  realzada = false,
  centrada = false,
}: {
  idTitulo: string;
  etiqueta: string | null;
  titulo: string | null;
  /** Frase corta que acompaña al titular. Opcional: la mayoría no la lleva. */
  entradilla?: string | null;
  /** Bronce y rombo. Sólo las secciones que son un extra; ver `EtiquetaSeccion`. */
  realzada?: boolean;
  centrada?: boolean;
}) {
  if (!etiqueta && !titulo) return null;

  const rotulo = (
    <div>
      {etiqueta ? <EtiquetaSeccion realzada={realzada}>{etiqueta}</EtiquetaSeccion> : null}
      {titulo ? (
        <Titulo1 como="h2" id={idTitulo} className="mt-pila">
          {titulo}
        </Titulo1>
      ) : null}
      {centrada && entradilla ? (
        <Cuerpo className="mx-auto mt-pila max-w-texto">{entradilla}</Cuerpo>
      ) : null}
    </div>
  );

  return (
    <header
      className={`animacion-subir-al-ver mb-bloque-fluido ${
        centrada ? "text-center" : "flex flex-wrap items-end justify-between gap-elemento"
      }`}
    >
      {rotulo}
      {!centrada && entradilla ? (
        <Cuerpo className="ancho-entradilla">{entradilla}</Cuerpo>
      ) : null}
    </header>
  );
}

/**
 * EL MARCO DE UNA SECCIÓN DE CONTENIDO
 *
 * Mantiene el ritmo vertical sin repetirlo por página. El aire es fluido: 132
 * px fijos dejan una sección casi vacía en un móvil, y por eso la entrega lo
 * escribe con `clamp` en todas.
 */
function Bloque({
  seccion,
  etiqueta,
  titulo,
  entradilla = null,
  realzada = false,
  centrada = false,
  hundida = false,
  children,
}: {
  seccion: Seccion;
  etiqueta: string | null;
  titulo: string | null;
  entradilla?: string | null;
  realzada?: boolean;
  centrada?: boolean;
  hundida?: boolean;
  children: ReactNode;
}) {
  const ancla = anclaDe(seccion);
  const idTitulo = `titulo-${ancla}`;
  return (
    <section
      id={ancla}
      className={`px-interno py-seccion-fluida ${hundida ? "bg-superficie-hundida" : ""}`}
      aria-labelledby={titulo ? idTitulo : undefined}
    >
      <div className="mx-auto max-w-contenido">
        <CabeceraSeccion
          idTitulo={idTitulo}
          etiqueta={etiqueta}
          titulo={titulo}
          entradilla={entradilla}
          realzada={realzada}
          centrada={centrada}
        />
        {children}
      </div>
    </section>
  );
}
