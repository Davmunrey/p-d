import { CuentaAtras } from "@/components/marketing/cuenta-atras";
import { BotonEnlace } from "@/components/ui/boton";
import { Cita, Cuerpo, Display, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import {
  obtenerAlojamientos,
  obtenerCanciones,
  obtenerConfiguracion,
  obtenerHistoria,
  obtenerPreguntasFrecuentes,
  obtenerPrograma,
  obtenerRutas,
} from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * LANDING
 *
 * Todo lo que se ve aquí sale de la base de datos. No hay ni un dato de la boda
 * escrito en el código: cambiar la hora de la ceremonia o añadir un hotel se
 * hace desde el panel y se refleja aquí sin tocar nada.
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
  const [configuracion, programa, historia, alojamientos, rutas, preguntas, canciones] =
    await Promise.all([
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

  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;
  const procedencia = configuracion.direccionCeremonia;

  return (
    <main id="contenido">
      {/* ---------------------------------------------------------------- */}
      {/* Portada                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="portada"
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
            <BotonEnlace href="#rsvp">{t("portada.confirmarAsistencia")}</BotonEnlace>
            <BotonEnlace href="#programa" jerarquia="secundario">
              {t("portada.verElDia")}
            </BotonEnlace>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Cuenta atrás — bloque inverso                                    */}
      {/* ---------------------------------------------------------------- */}
      <section
        data-seccion="inversa"
        className="px-interno py-seccion-compacta text-center"
        aria-labelledby="titulo-cuenta"
      >
        <div className="mx-auto max-w-estrecho">
          <Etiqueta id="titulo-cuenta">{t("cuentaAtras.titulo")}</Etiqueta>
          <div className="mt-elemento">
            <CuentaAtras fechaIso={configuracion.fechaCeremonia.toISOString()} />
          </div>
          <p className="mt-bloque text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
            {formatoFecha.format(configuracion.fechaCeremonia)}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Nuestra historia                                                 */}
      {/* ---------------------------------------------------------------- */}
      {historia.length > 0 ? (
        <Seccion id="historia" etiqueta={null} titulo={null}>
          <ol className="grid gap-bloque sm:grid-cols-3">
            {historia.map((hito) => (
              <li key={hito.id} className="animacion-subir-al-ver">
                {hito.fechaTexto ? <Etiqueta>{hito.fechaTexto}</Etiqueta> : null}
                <Titulo3 className="mt-pila">{hito.titulo}</Titulo3>
                {hito.descripcion ? (
                  <Cuerpo className="mt-linea">{hito.descripcion}</Cuerpo>
                ) : null}
              </li>
            ))}
          </ol>
        </Seccion>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Programa                                                         */}
      {/* ---------------------------------------------------------------- */}
      {programa.length > 0 ? (
        <Seccion
          id="programa"
          etiqueta={formatoFecha.format(configuracion.fechaCeremonia)}
          titulo={t("programa.titulo")}
        >
          <ol className="border-t border-borde">
            {programa.map((hito) => (
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
        </Seccion>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Alojamiento                                                      */}
      {/* ---------------------------------------------------------------- */}
      {alojamientos.length > 0 ? (
        <Seccion
          id="alojamiento"
          etiqueta={t("alojamiento.etiqueta")}
          titulo={t("alojamiento.titulo")}
          hundida
        >
          <ul className="grid gap-elemento sm:grid-cols-2 lg:grid-cols-3">
            {alojamientos.map((sitio) => (
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
        </Seccion>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Cómo llegar                                                      */}
      {/* ---------------------------------------------------------------- */}
      {rutas.length > 0 ? (
        <Seccion
          id="como-llegar"
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
        </Seccion>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Preguntas frecuentes                                             */}
      {/* ---------------------------------------------------------------- */}
      {preguntas.length > 0 ? (
        <Seccion id="preguntas" etiqueta={null} titulo={null} hundida>
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
        </Seccion>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Playlist                                                         */}
      {/* ---------------------------------------------------------------- */}
      <Seccion id="playlist" etiqueta={t("playlist.etiqueta")} titulo={t("playlist.titulo")}>
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
      </Seccion>

      {/* ---------------------------------------------------------------- */}
      {/* RSVP                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="rsvp"
        data-seccion="inversa"
        className="px-interno py-seccion-compacta text-center"
        aria-labelledby="titulo-rsvp"
      >
        <div className="mx-auto max-w-estrecho">
          {configuracion.fechaLimiteRsvp ? (
            <Etiqueta>{formatoFecha.format(configuracion.fechaLimiteRsvp)}</Etiqueta>
          ) : null}
          <Titulo2 id="titulo-rsvp" className="mt-pila">
            {t("rsvp.titulo")}
          </Titulo2>
          <Cita className="mx-auto mt-elemento max-w-texto">{t("meta.descripcion")}</Cita>
        </div>
      </section>
    </main>
  );
}

/** Envoltura de sección: mantiene el ritmo vertical sin repetirlo por página. */
function Seccion({
  id,
  etiqueta,
  titulo,
  hundida = false,
  children,
}: {
  id: string;
  etiqueta: string | null;
  titulo: string | null;
  hundida?: boolean;
  children: React.ReactNode;
}) {
  const idTitulo = `titulo-${id}`;
  return (
    <section
      id={id}
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
