import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoTexto } from "@/components/ui/campo";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  LARGOS_DE_CAMPO,
  BUCKET_MEDIOS,
  IDIOMA,
  PESO_MAXIMO_IMAGEN_MB,
  PESO_MAXIMO_VIDEO_MB,
  RUTA_ACCESO,
  RUTA_AJUSTES,
  RUTA_CONTENIDO,
  TIPOS_MEDIO_ADMITIDOS,
} from "@/config/constants";
import { type Seccion } from "@/config/secciones";
import { obtenerEstadoDeLasSecciones } from "@/lib/bbdd/contenido";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import {
  obtenerMediosDelPanel,
  obtenerMediosElegidosEnFichas,
  type MedioDelPanel,
} from "@/lib/bbdd/medios";
import { t, type ClaveCopy } from "@/lib/copy";
import { rotuloDeTipo } from "@/lib/medios";
import {
  seccionEnsenaMedios,
  tiposQuePinta,
  visibilidadEnLaWeb,
  type MotivoNoSeVe,
  type Visibilidad,
} from "@/lib/medios-en-la-web";
import { accesoActual } from "@/lib/sesion";
import { haySubidaDeMedios } from "@/lib/supabase/servicio";

import { alternarPublicado, borrarMedio, guardarAlternativo, moverMedio } from "./acciones";
import { DeQue } from "./de-que";
import {
  ESTADOS_DE_ERROR,
  anclaDeMedio,
  anclaDeSeccion,
  esEstadoMedios,
  type EstadoMedios,
} from "./estado";
import { FormularioSubida } from "./formulario-subida";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.medios.titulo") };

/**
 * BODA-29 · EL GESTOR DE FOTOS Y VÍDEOS
 *
 * La regla 1 dice que ninguna imagen de la landing vive en `/public`: salen de
 * Storage y de la tabla `medios`. Hasta ahora eso era verdad a medias — la
 * landing YA leía de `medios`, pero no había ninguna forma de meter una fila
 * salvo el editor SQL de Supabase. La portada llevaba semanas sin foto por eso.
 *
 * SE AGRUPA POR SECCIÓN, Y CADA SECCIÓN LLEVA SU FORMULARIO. La pregunta que se
 * hace delante de esta pantalla nunca es «¿qué fotos hay?», es «¿qué se ve en
 * la portada?». Un formulario único arriba con un desplegable de sección
 * obligaría a elegirla dos veces —una para mirar y otra para subir— y a que la
 * elección de un desplegable contradijera lo que se está mirando.
 *
 * SIN UNA LÍNEA DE JAVASCRIPT DE CLIENTE. Son `<form>` con Server Actions:
 * subir, publicar, mover y borrar funcionan con el bundle a medio cargar, que
 * es como se abre esto desde el móvil con mala cobertura.
 *
 * UN LECTOR VE PERO NO TOCA. No es la protección —esa es RLS, y cada acción
 * comprueba el recuento de filas por si alguien manda el formulario a mano—
 * sino no ofrecer lo que va a fallar.
 */
export const dynamic = "force-dynamic";

const AVISOS: Record<EstadoMedios, string> = {
  subido: t("panel.medios.avisoSubido"),
  publicado: t("panel.medios.avisoPublicado"),
  despublicado: t("panel.medios.avisoDespublicado"),
  borrado: t("panel.medios.avisoBorrado"),
  "borrado-sin-fichero": t("panel.medios.avisoBorradoSinFichero"),
  "subida-cortada": t("panel.medios.errorSubidaCortada"),
  "confirmar-borrado": t("panel.medios.errorConfirmarBorrado", {
    borrar: t("panel.medios.borrar"),
    confirmar: t("panel.medios.borrarConfirmar"),
  }),
  movido: t("panel.medios.avisoMovido"),
  "alternativo-guardado": t("panel.medios.avisoAlternativo"),
  "sin-fichero": t("panel.medios.errorSinFichero"),
  "sin-alternativo": t("panel.medios.errorSinAlternativo"),
  "tipo-no-admitido": t("panel.medios.errorTipo"),
  "demasiado-grande": t("panel.medios.errorPeso"),
  "sin-poster": t("panel.medios.errorSinPoster"),
  "sin-configurar": t("panel.medios.errorSinConfigurar"),
  "sin-permiso": t("panel.medios.errorSinPermiso"),
  "no-existe": t("panel.medios.errorNoExiste"),
  error: t("panel.medios.errorGuardar"),
};

/**
 * Lo que acepta el campo del fotograma: las imágenes que admite el bucket, del
 * mismo sitio que todo lo demás. Escrito a mano, el día que se añadiera un
 * formato el campo de la foto lo ofrecería y el del fotograma no.
 */
const TIPOS_POSTER = TIPOS_MEDIO_ADMITIDOS.filter((tipo) => tipo.startsWith("image/"));

/** «JPG, PNG o WEBP», para la ayuda y para el error de formato. */
const lista = new Intl.ListFormat(IDIOMA, { type: "disjunction" });
function nombrar(tipos: readonly string[]): string {
  return lista.format(tipos.map(rotuloDeTipo));
}

/**
 * SÓLO SE OFRECE LO QUE ESA PARTE DE LA WEB PINTA. Un vídeo en la galería, en
 * la tarjeta del Save the Date o en historia no sale nunca, y un AVIF en la
 * galería tampoco: se subía, se publicaba y se quedaba en «no se ve».
 */
function camposDeSubida(seccion: Seccion) {
  const tipos = tiposQuePinta(seccion);
  const fotos = tipos.filter((tipo) => tipo.startsWith("image/"));
  const videos = tipos.filter((tipo) => tipo.startsWith("video/"));
  const conVideo = videos.length > 0;

  return {
    accept: tipos.join(","),
    acceptPoster: conVideo ? TIPOS_POSTER.join(",") : null,
    etiquetaFichero: conVideo ? t("panel.medios.fichero") : t("panel.medios.ficheroFoto"),
    ayudaFichero: conVideo
      ? t("panel.medios.ficheroAyuda", {
          fotos: nombrar(fotos),
          imagenMb: PESO_MAXIMO_IMAGEN_MB,
          videos: nombrar(videos),
          videoMb: PESO_MAXIMO_VIDEO_MB,
        })
      : t("panel.medios.ficheroAyudaFotos", {
          fotos: nombrar(fotos),
          imagenMb: PESO_MAXIMO_IMAGEN_MB,
        }),
  };
}

/** Por qué una sección entera no sale en la web, aunque tenga cosas publicadas. */
type Oculta = "apagada" | "paisaje-sin-titulo";

/** El aviso de una acción, donde toque pintarlo. */
function Aviso({ estado, className = "" }: { estado: EstadoMedios; className?: string }) {
  const esError = ESTADOS_DE_ERROR.includes(estado);
  return (
    <p
      role={esError ? "alert" : "status"}
      className={`rounded-campo p-interno text-pequeno ${
        esError ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      } ${className}`}
    >
      {AVISOS[estado]}
    </p>
  );
}

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaMedios({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const leer = (clave: string) => (typeof consulta[clave] === "string" ? consulta[clave] : "");
  const bruto = leer("estado");
  const estado = esEstadoMedios(bruto) ? bruto : null;

  const [secciones, elegidos, estadoDeSecciones, configuracion] = await Promise.all([
    obtenerMediosDelPanel(),
    obtenerMediosElegidosEnFichas(),
    obtenerEstadoDeLasSecciones(),
    obtenerConfiguracion(),
  ]);
  const puedeEditar = acceso.rol !== "lector";
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL;

  /*
    LO QUE LA WEB NO PINTA AUNQUE TENGA FOTOS: una sección apagada en Contenido
    y el paisaje sin título, que la portada se salta. Si las secciones no se han
    podido leer no se da ninguna por apagada: mejor no avisar que avisar mal.
  */
  const ocultas = new Map<Seccion, Oculta>();
  for (const fila of estadoDeSecciones ?? []) {
    if (!fila.visible) ocultas.set(fila.seccion, "apagada");
  }
  if (!ocultas.has("paisaje") && configuracion && !configuracion.paisajeTitulo) {
    ocultas.set("paisaje", "paisaje-sin-titulo");
  }

  /*
    DÓNDE VA EL AVISO: en la ficha o en la sección de la que salió la acción,
    que es a donde vuelve la pantalla. Si ya no están —la foto se borró en otra
    pestaña—, arriba, como siempre.
  */
  const medioSenalado = leer("medio");
  const seccionSenalada = leer("seccion");
  const enUnaFicha = secciones.some(({ medios }) =>
    medios.some((medio) => medio.id === medioSenalado),
  );
  const enUnaSeccion =
    !enUnaFicha && secciones.some(({ seccion }) => seccion === seccionSenalada);

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.medios.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.medios.descripcion")}</Cuerpo>
      </header>

      {estado && !enUnaFicha && !enUnaSeccion ? <Aviso estado={estado} /> : null}

      {/*
        Se dice ARRIBA y una sola vez, no dentro de cada formulario: sin la
        clave no funciona ninguno, y repetirlo dieciséis veces convertiría un
        aviso en ruido.
      */}
      {puedeEditar && !haySubidaDeMedios ? (
        <p
          role="alert"
          className="rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {t("panel.medios.errorSinConfigurar")}
        </p>
      ) : null}

      {!puedeEditar ? (
        <Etiqueta className="block">{t("panel.medios.errorSinPermiso")}</Etiqueta>
      ) : null}

      {secciones.map(({ seccion, medios }) => (
        <BloqueSeccion
          key={seccion}
          seccion={seccion}
          medios={medios}
          elegidos={elegidos}
          puedeEditar={puedeEditar}
          urlBase={urlBase}
          oculta={ocultas.get(seccion)}
          estado={estado}
          medioSenalado={enUnaFicha ? medioSenalado : null}
          senalada={enUnaSeccion && seccion === seccionSenalada}
        />
      ))}
    </div>
  );
}

/** Por qué un medio publicado no sale, en una frase. */
const MOTIVOS: Record<MotivoNoSeVe, ClaveCopy | null> = {
  borrador: null,
  "solo-la-primera": "panel.medios.motivos.soloLaPrimera",
  "solo-la-primera-foto": "panel.medios.motivos.soloLaPrimeraFoto",
  "sin-medidas": "panel.medios.motivos.sinMedidas",
  "sin-ficha": "panel.medios.motivos.sinFicha",
  "solo-fotos": "panel.medios.motivos.soloFotos",
  // Ya lo dice la sección entera, una vez: repetirlo en cada ficha es ruido.
  "seccion-sin-medios": null,
  "seccion-oculta": null,
};

function BloqueSeccion({
  seccion,
  medios,
  elegidos,
  puedeEditar,
  urlBase,
  oculta,
  estado,
  medioSenalado,
  senalada,
}: {
  seccion: Seccion;
  medios: MedioDelPanel[];
  elegidos: ReadonlySet<string>;
  puedeEditar: boolean;
  urlBase: string | undefined;
  oculta: Oculta | undefined;
  estado: EstadoMedios | null;
  /** La ficha a la que ha vuelto la pantalla, si es de esta sección. */
  medioSenalado: string | null;
  /** Si la pantalla ha vuelto a esta sección (una subida, un borrado). */
  senalada: boolean;
}) {
  /*
    «EN LA WEB» ES LO QUE LA WEB PINTA, no lo publicado. La portada enseña una
    sola foto y la galería sólo las que tienen medidas: contar lo publicado
    decía «3 en la web» de una sección que enseñaba una.
  */
  const visibilidad = visibilidadEnLaWeb(seccion, medios, elegidos, !oculta);
  const seVen = medios.filter((medio) => visibilidad.get(medio.id)?.seVe).length;
  const ensena = seccionEnsenaMedios(seccion);

  // Una parte de la web que no enseña fotos y en la que no hay nada no se
  // ofrece: subir ahí sería guardar algo que no va a salir nunca.
  if (!ensena && medios.length === 0) return null;

  const nombre = t(`navegacion.secciones.${seccion}`);

  return (
    <section
      id={anclaDeSeccion(seccion)}
      className="scroll-mt-elemento border-t border-borde pt-bloque"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <Titulo3 como="h2">{nombre}</Titulo3>
        {medios.length > 0 ? (
          <Etiqueta>
            {t("panel.medios.cuantos", { cuantos: seVen, total: medios.length })}
          </Etiqueta>
        ) : null}
      </div>

      {!ensena ? (
        <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
          {t("panel.medios.seccionSinMedios")}
        </Cuerpo>
      ) : null}

      {/* Dicho una vez por sección, no en cada ficha: es la sección la que no sale. */}
      {ensena && oculta ? (
        <div className="mt-pila max-w-texto">
          <Cuerpo className="text-pequeno text-tinta-suave">
            {oculta === "apagada"
              ? t("panel.medios.seccionApagada")
              : t("panel.medios.paisajeSinTitulo")}
          </Cuerpo>
          <EnlaceSuave href={oculta === "apagada" ? RUTA_CONTENIDO : RUTA_AJUSTES}>
            {oculta === "apagada"
              ? t("panel.medios.irAContenido")
              : t("panel.medios.irAAjustes")}
          </EnlaceSuave>
        </div>
      ) : null}

      {senalada && estado ? <Aviso estado={estado} className="mt-elemento" /> : null}

      {medios.length === 0 ? (
        <Cuerpo className="mt-pila text-pequeno text-tinta-suave">
          {t("panel.medios.seccionVacia")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno">
          {medios.map((medio, indice) => (
            <Ficha
              key={medio.id}
              medio={medio}
              visibilidad={visibilidad.get(medio.id) ?? { seVe: false, motivo: "borrador" }}
              elegido={elegidos.has(medio.id)}
              puedeEditar={puedeEditar}
              urlBase={urlBase}
              esElPrimero={indice === 0}
              esElUltimo={indice === medios.length - 1}
              aviso={medio.id === medioSenalado ? estado : null}
            />
          ))}
        </ul>
      )}

      {puedeEditar && ensena ? (
        <FormularioSubida
          seccion={seccion}
          nombre={nombre}
          // Tras un error de subida se vuelve con el formulario abierto, junto
          // al aviso: cerrado, parecía que no había pasado nada.
          abierto={senalada && estado !== null && ESTADOS_DE_ERROR.includes(estado)}
          {...camposDeSubida(seccion)}
        />
      ) : null}
    </section>
  );
}

function Ficha({
  medio,
  visibilidad,
  elegido,
  puedeEditar,
  urlBase,
  esElPrimero,
  esElUltimo,
  aviso,
}: {
  medio: MedioDelPanel;
  visibilidad: Visibilidad;
  /** Si la usa una ficha publicada de Contenido: borrarla la deja sin foto. */
  elegido: boolean;
  puedeEditar: boolean;
  urlBase: string | undefined;
  esElPrimero: boolean;
  esElUltimo: boolean;
  /** El aviso de la acción que acaba de volver a esta ficha. */
  aviso: EstadoMedios | null;
}) {
  /*
    LA MINIATURA ES SIEMPRE UNA IMAGEN, también la de un vídeo: para eso está el
    póster. Reproducir dieciséis vídeos a la vez en una pantalla de gestión
    sería descargar cientos de megas para decidir cuál se publica.
  */
  const rutaVisible = medio.tipo === "video" ? medio.posterRuta : medio.ruta;
  const fuente =
    urlBase && rutaVisible
      ? `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${rutaVisible}`
      : null;

  return (
    <li
      id={anclaDeMedio(medio.id)}
      className={`grid scroll-mt-elemento gap-interno rounded-tarjeta border p-interno sm:grid-cols-[auto_1fr] ${
        medio.publicado ? "border-borde" : "border-borde-fuerte bg-superficie-tenue"
      }`}
    >
      <div className="relative size-miniatura shrink-0 overflow-hidden rounded-campo bg-superficie-hundida">
        {fuente ? (
          <Image
            src={fuente}
            alt={medio.textoAlternativo}
            fill
            sizes="120px"
            className="object-cover"
            // Sin optimizar: son miniaturas de gestión, no páginas públicas, y
            // pasarlas por el optimizador cuesta una invocación por foto.
            unoptimized
          />
        ) : null}
      </div>

      <div className="grid gap-pila">
        {aviso ? <Aviso estado={aviso} /> : null}

        <div className="flex flex-wrap items-center gap-interno-compacto">
          <EtiquetaEstado
            variante={visibilidad.seVe ? "marca" : medio.publicado ? "aviso" : "contorno"}
            tamano="versalita"
          >
            {visibilidad.seVe
              ? t("panel.medios.enLaWeb")
              : medio.publicado
                ? t("panel.medios.publicadaNoSeVe")
                : t("panel.medios.borrador")}
          </EtiquetaEstado>

          {medio.tipo === "video" ? <Etiqueta>{t("panel.medios.esVideo")}</Etiqueta> : null}

          <Etiqueta>
            {medio.ancho && medio.alto
              ? t("panel.medios.medida", { ancho: medio.ancho, alto: medio.alto })
              : t("panel.medios.sinMedida")}
          </Etiqueta>
        </div>

        {/* Publicada y sin salir: se dice por qué, que es lo que hay que arreglar. */}
        {!visibilidad.seVe && MOTIVOS[visibilidad.motivo] ? (
          <Cuerpo className="max-w-texto text-pequeno text-tinta-suave">
            {t(MOTIVOS[visibilidad.motivo]!, { boton: t("panel.medios.subirOrden") })}
          </Cuerpo>
        ) : null}

        {puedeEditar ? (
          <>
            {/*
              EL TEXTO ALTERNATIVO SE EDITA AQUÍ MISMO y no tras un botón de
              «editar»: es lo que más se escribe mal con prisa y lo único de esta
              ficha que se corrige de verdad. Esconderlo garantiza que nadie lo
              arregle.

              CAMPO Y BOTÓN EN FILA SÓLO EN ESCRITORIO. En la tableta, junto a
              la miniatura, al campo le quedaban 115 px: el texto se cortaba a
              la tercera palabra y el rótulo partía en dos líneas. Debajo, el
              campo tiene el ancho de la ficha y el texto se lee entero.
            */}
            <form
              action={guardarAlternativo}
              className="grid items-end gap-interno-compacto lg:grid-cols-[minmax(0,1fr)_auto]"
            >
              <input type="hidden" name="medio_id" value={medio.id} />
              <CampoTexto
                etiqueta={t("panel.medios.alternativo")}
                name="texto_alternativo"
                defaultValue={medio.textoAlternativo}
                minLength={3}
                maxLength={LARGOS_DE_CAMPO["medios.texto_alternativo"]}
                required
              />
              <BotonEnvio jerarquia="secundario" className="justify-self-start">
                {t("panel.medios.guardarAlternativo")}
                <DeQue nombre={medio.textoAlternativo} />
              </BotonEnvio>
            </form>

            <div className="flex flex-wrap items-center gap-interno-compacto">
              <form action={alternarPublicado}>
                <input type="hidden" name="medio_id" value={medio.id} />
                <input type="hidden" name="publicar" value={medio.publicado ? "0" : "1"} />
                <BotonEnvio jerarquia={medio.publicado ? "terciario" : "primario"}>
                  {medio.publicado ? t("panel.medios.despublicar") : t("panel.medios.publicar")}
                  <DeQue nombre={medio.textoAlternativo} />
                </BotonEnvio>
              </form>

              {/*
                El botón de mover no se pinta cuando no hay a dónde. Un botón
                que existe y no hace nada es peor que uno que falta: se pulsa
                tres veces antes de concluir que la aplicación está rota.
              */}
              {!esElPrimero ? (
                <form action={moverMedio}>
                  <input type="hidden" name="medio_id" value={medio.id} />
                  <input type="hidden" name="hacia" value="arriba" />
                  <BotonEnvio jerarquia="terciario">
                    {t("panel.medios.subirOrden")}
                    <DeQue nombre={medio.textoAlternativo} />
                  </BotonEnvio>
                </form>
              ) : null}

              {!esElUltimo ? (
                <form action={moverMedio}>
                  <input type="hidden" name="medio_id" value={medio.id} />
                  <input type="hidden" name="hacia" value="abajo" />
                  <BotonEnvio jerarquia="terciario">
                    {t("panel.medios.bajarOrden")}
                    <DeQue nombre={medio.textoAlternativo} />
                  </BotonEnvio>
                </form>
              ) : null}
            </div>

            {/*
              BORRAR SE CONFIRMA. Se van la fila y el fichero, sin vuelta atrás,
              y un toque al lado de «Quitar de la web» dejaba la portada sin
              foto. La pregunta dice lo que se pierde: si está en la web y si la
              usa una ficha de Contenido, que se quedaría sin foto en silencio.
              Sin la clave de servicio no se ofrece: el fichero se quedaría en
              el bucket público.
            */}
            {haySubidaDeMedios ? (
              <details>
                <summary className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-suave underline decoration-borde-fuerte underline-offset-4 transicion-color hover:text-error-tinta hover:decoration-error">
                  {t("panel.medios.borrar")}
                  <DeQue nombre={medio.textoAlternativo} />
                </summary>
                <form action={borrarMedio} className="mt-pila grid max-w-texto gap-interno">
                  <input type="hidden" name="medio_id" value={medio.id} />
                  <input type="hidden" name="confirmado" value="si" />
                  <p className="text-pequeno text-tinta-suave">
                    {[
                      t("panel.medios.borrarAviso"),
                      visibilidad.seVe ? t("panel.medios.borrarEnLaWeb") : null,
                      elegido ? t("panel.medios.borrarEnUnaFicha") : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  <div>
                    <BotonEnvio jerarquia="secundario">
                      {t("panel.medios.borrarConfirmar")}
                    </BotonEnvio>
                  </div>
                </form>
              </details>
            ) : null}
          </>
        ) : (
          <Cuerpo className="max-w-texto text-pequeno">{medio.textoAlternativo}</Cuerpo>
        )}
      </div>
    </li>
  );
}
