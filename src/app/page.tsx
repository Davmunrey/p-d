import { Fragment, type ReactNode } from "react";

import { Navegacion } from "@/components/marketing/navegacion";
import { Pie } from "@/components/marketing/pie";
import { CuentaAtras } from "@/components/marketing/cuenta-atras";
import { BotonEnlace } from "@/components/ui/boton";
import { Cita, Cuerpo, Display, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
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
  obtenerSecciones,
  type ConfiguracionBoda,
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
 * Se revalida cada hora: la landing no cambia a menudo, y así los invitados
 * reciben HTML de la caché en lugar de esperar a una consulta.
 */
export const revalidate = 3600;

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

export default async function PaginaInicio() {
  const [
    secciones,
    configuracion,
    programa,
    historia,
    alojamientos,
    rutas,
    preguntas,
    canciones,
  ] = await Promise.all([
    obtenerSecciones(),
    obtenerConfiguracion(),
    obtenerPrograma(),
    obtenerHistoria(),
    obtenerAlojamientos(),
    obtenerRutas(),
    obtenerPreguntasFrecuentes(),
    obtenerCanciones(),
  ]);

  // Sin configuración no hay boda que enseñar: puede que falte la variable de
  // entorno o que aún no se haya rellenado el panel. Se dice con claridad, en
  // lugar de pintar una página rota o inventarse datos para tapar el hueco.
  if (!configuracion) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-texto place-items-center px-interno text-center">
        <div>
          <Titulo2 como="h1">{t("portada.enPreparacion")}</Titulo2>
          <Cuerpo className="mt-pila">{t("portada.enPreparacionTexto")}</Cuerpo>
        </div>
      </main>
    );
  }

  const nombres = `${configuracion.nombreNovia} ${t("portada.conjuncion")} ${configuracion.nombreNovio}`;

  const contenido: Partial<Record<Seccion, ReactNode>> = {
    portada: <Portada configuracion={configuracion} />,
    cuenta_atras: <CuentaAtrasSeccion configuracion={configuracion} />,
    historia: historia.length > 0 ? <Historia hitos={historia} /> : undefined,
    programa:
      programa.length > 0 ? (
        <Programa hitos={programa} fecha={configuracion.fechaCeremonia} />
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

/* ------------------------------------------------------------------------ */
/* Secciones                                                                 */
/* ------------------------------------------------------------------------ */

function Portada({ configuracion }: { configuracion: ConfiguracionBoda }) {
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;
  const procedencia = configuracion.direccionCeremonia;

  return (
    <section
      id={anclaDe("portada")}
      className="grid min-h-dvh items-center px-interno py-seccion-compacta"
    >
      <div className="mx-auto w-full max-w-contenido">
        {procedencia ? (
          <p className="animacion-aparecer text-etiqueta uppercase tracking-marcado text-tinta-tenue">
            {procedencia}
          </p>
        ) : null}

        <Display className="animacion-subir mt-pila">{configuracion.nombreNovia}</Display>
        <div className="animacion-subir flex flex-wrap items-baseline gap-elemento">
          <span className="font-titulo text-titulo-1 italic text-marca">
            {t("portada.conjuncion")}
          </span>
          <Display como="p">{configuracion.nombreNovio}</Display>
        </div>

        <hr className="animacion-trazar my-bloque border-t border-borde-fuerte" />

        <dl className="animacion-subir flex flex-wrap gap-bloque">
          <div>
            <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
              {t("portada.etiquetaFecha")}
            </dt>
            <dd className="mt-linea font-titulo text-titulo-2">
              <time dateTime={configuracion.fechaCeremonia.toISOString()}>
                {formatoFechaCorta.format(configuracion.fechaCeremonia)}
              </time>
            </dd>
          </div>
          {lugar ? (
            <div>
              <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
                {t("portada.etiquetaLugar")}
              </dt>
              <dd className="mt-linea font-titulo text-titulo-2">{lugar}</dd>
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
      </div>
    </section>
  );
}

function CuentaAtrasSeccion({ configuracion }: { configuracion: ConfiguracionBoda }) {
  const idTitulo = `titulo-${anclaDe("cuenta_atras")}`;
  return (
    <section
      id={anclaDe("cuenta_atras")}
      data-seccion="inversa"
      className="px-interno py-seccion-compacta text-center"
      aria-labelledby={idTitulo}
    >
      <div className="mx-auto max-w-estrecho">
        <Etiqueta id={idTitulo}>{t("cuentaAtras.titulo")}</Etiqueta>
        <div className="mt-elemento">
          <CuentaAtras fechaIso={configuracion.fechaCeremonia.toISOString()} />
        </div>
        <p className="mt-bloque text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
          {formatoFecha.format(configuracion.fechaCeremonia)}
        </p>
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
    <Bloque seccion="historia" etiqueta={null} titulo={null}>
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

function Programa({
  hitos,
  fecha,
}: {
  hitos: { id: string; hora: string; titulo: string; descripcion: string | null }[];
  fecha: Date;
}) {
  return (
    <Bloque
      seccion="programa"
      etiqueta={formatoFecha.format(fecha)}
      titulo={t("programa.titulo")}
    >
      <ol className="border-t border-borde">
        {hitos.map((hito) => (
          <li
            key={hito.id}
            className="animacion-subir-al-ver rejilla-dato gap-elemento border-b border-borde py-elemento"
          >
            <span className="font-titulo text-titulo-3 text-marca tabular-nums">
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
    <Bloque seccion="preguntas_frecuentes" etiqueta={null} titulo={null} hundida>
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
    <Bloque seccion="playlist" etiqueta={t("playlist.etiqueta")} titulo={t("playlist.titulo")}>
      <Cuerpo className="mx-auto max-w-texto text-center">{t("playlist.descripcion")}</Cuerpo>
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
      className="px-interno py-seccion-compacta text-center"
      aria-labelledby={idTitulo}
    >
      <div className="mx-auto max-w-estrecho">
        {configuracion.fechaLimiteRsvp ? (
          <Etiqueta>{formatoFecha.format(configuracion.fechaLimiteRsvp)}</Etiqueta>
        ) : null}
        <Titulo2 id={idTitulo} className="mt-pila">
          {t("rsvp.titulo")}
        </Titulo2>
        <Cita className="mx-auto mt-elemento max-w-texto">{t("meta.descripcion")}</Cita>
      </div>
    </section>
  );
}

/** Envoltura de sección: mantiene el ritmo vertical sin repetirlo por página. */
function Bloque({
  seccion,
  etiqueta,
  titulo,
  hundida = false,
  children,
}: {
  seccion: Seccion;
  etiqueta: string | null;
  titulo: string | null;
  hundida?: boolean;
  children: ReactNode;
}) {
  const ancla = anclaDe(seccion);
  const idTitulo = `titulo-${ancla}`;
  return (
    <section
      id={ancla}
      className={`px-interno py-seccion-compacta ${hundida ? "bg-superficie-hundida" : ""}`}
      aria-labelledby={titulo ? idTitulo : undefined}
    >
      <div className="mx-auto max-w-contenido">
        {etiqueta || titulo ? (
          <header className="mb-bloque">
            {etiqueta ? <Etiqueta>{etiqueta}</Etiqueta> : null}
            {titulo ? (
              <Titulo2 id={idTitulo} className="mt-pila">
                {titulo}
              </Titulo2>
            ) : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  );
}
