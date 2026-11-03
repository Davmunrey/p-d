import Image from "next/image";
import { Fragment, type ReactNode } from "react";

import { CieloEstrellado } from "@/components/marketing/cielo-estrellado";
import { CuentaAtras } from "@/components/marketing/cuenta-atras";
import { EnPreparacion } from "@/components/marketing/en-preparacion";
import { EstrellaDeCuatroPuntas } from "@/components/marketing/estrella-de-cuatro-puntas";
import { Galeria } from "@/components/marketing/galeria";
import { HuecoFoto } from "@/components/marketing/hueco-foto";
import { MapaDelLugar } from "@/components/marketing/mapa-del-lugar";
import { Navegacion } from "@/components/marketing/navegacion";
import { Pie } from "@/components/marketing/pie";
import { RetratoDeEstrellas } from "@/components/marketing/retrato-de-estrellas";
import { VideoDeFondo } from "@/components/marketing/video-de-fondo";
import {
  Confirmacion,
  type ConsultaConfirmacion,
  type LecturaInvitacion,
} from "@/components/marketing/confirmacion";
import { DatosEstructurados } from "@/components/datos-estructurados";
import { BotonEnlace } from "@/components/ui/boton";
import { CuentaRegalos } from "@/components/ui/cuenta-regalos";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { FormularioPlaylist } from "@/components/ui/formulario-playlist";
import { SignoAbrir } from "@/components/ui/signo-abrir";
import { Tarjeta } from "@/components/ui/tarjeta";
import {
  Cita,
  Conector,
  Cuerpo,
  Display,
  Etiqueta,
  EtiquetaSeccion,
  Titulo1,
  Titulo2,
  Titulo3,
} from "@/components/ui/tipografia";
import { CIERRE_DE_LA_NOCHE, SECCIONES_DE_LLEGADA, SECCIONES_DE_NOCHE } from "@/config/cielo";
import {
  BUCKET_MEDIOS,
  ID_CONTENIDO,
  MARCA_RSVP_ENVIADO,
  RUTA_OLVIDAR_INVITACION,
  URL_ATRIBUCION_MAPA,
} from "@/config/constants";
import { anclaDe, esAncla, vaEnElMenu, type Seccion } from "@/config/secciones";
import {
  obtenerAlojamientos,
  obtenerCanciones,
  obtenerConfiguracion,
  obtenerConsejosVestimenta,
  obtenerCuentaRegalos,
  obtenerGaleria,
  obtenerHistoria,
  obtenerPlanes,
  obtenerPreguntasFrecuentes,
  obtenerPrograma,
  obtenerRetrato,
  obtenerRutas,
  obtenerMedios,
  obtenerSecciones,
  type Alojamiento as Hotel,
  type ConfiguracionBoda,
  type RutaLlegada,
  type ConsejoVestimenta,
  type HitoHistoria,
  type Medio,
  type Plan,
} from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";
import {
  diaDeCalendario,
  diaEnLaBoda,
  fechaConDia,
  fechaEnPuntos,
  fechaLarga,
  nombreDelDia,
  vispera,
} from "@/lib/fechas";
import { numeroEnLetra } from "@/lib/numeros";
import { enlaceMapaExterno } from "@/lib/mapa";
import { invitacionRecordada } from "@/lib/invitacion-recordada";
import { esCupoAgotado, obtenerInvitacion } from "@/lib/bbdd/rsvp";
import { leerBorrador } from "@/lib/rsvp-borrador";
import { sembrarDesdeLaBase } from "@/lib/rsvp-siembra";

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
 * por visible **y** que haya contenido que pintar. «Todavía no está hecha» y
 * «hoy está vacía» acaban en el mismo sitio: fuera de la página y del menú.
 *
 * UN SOLO CIELO, DE LA NOCHE AL DÍA. La página no tiene secciones con fondo
 * propio: tiene un cielo que empieza de noche, bajo un firmamento que gira
 * mientras se baja, amanece a media página y acaba de día en el mapa del sitio
 * de la boda, donde se posa la última estrella. Las secciones van encima,
 * transparentes, en tres tramos:
 *
 *   · LA NOCHE   → lo que se cuenta bajo las estrellas (`SECCIONES_DE_NOCHE`):
 *                  la portada, el paisaje y la historia.
 *   · EL DÍA     → todo lo demás, en el orden de la base.
 *   · LA LLEGADA → siempre al final (`SECCIONES_DE_LLEGADA`): dónde dormir,
 *                  cómo llegar con el mapa debajo, los regalos plegados y, lo
 *                  último, vuestra estrella, que se toca para confirmar.
 *
 * El orden de la base manda dentro de cada tramo; el tramo, no, porque decide
 * de qué color es el cielo detrás.
 *
 * NO SE CACHEA. Si la base no respondía justo al generar la página, lo que se
 * servía durante una hora entera era la pantalla de «estamos preparando la
 * web», aunque la base volviera a los diez segundos. Pasó en producción. Ahora
 * se consulta en cada visita: son consultas indexadas sobre tablas de pocas
 * filas, lanzadas a la vez, y nunca se queda enganchada en un fallo.
 */
export const dynamic = "force-dynamic";

export default async function PaginaInicio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
    QUIÉN ABRE LA WEB, si ha entrado alguna vez por el enlace de su invitación.
    Con invitación, la portada saluda al grupo por su nombre, la playlist
    enseña el campo para apuntar una canción y la estrella del final abre su
    formulario de confirmación. Se lee aquí, UNA VEZ, y no dentro de cada
    sección: la página tiene un solo sitio donde se decide qué se pinta.

    El enlace se recuerda sin preguntar a nadie (lo hace el middleware, sin
    arrancar una función); la pregunta a la base se hace AQUÍ, una vez, y de
    ella salen el saludo, el campo de la playlist y la confirmación: un nombre
    viejo o de un enlace anulado sería mentir.
  */
  const token = await invitacionRecordada();

  /*
    LA INVITACIÓN Y LO DEMÁS, A LA VEZ. Antes se leía la invitación y después
    lo de la página: en frío, quien llegaba desde el enlace esperaba las dos
    cosas en fila. `cargarLanding` puede fallar y se resuelve aparte, para que
    su avería no se confunda con la de la invitación.
  */
  const [lectura, carga] = await Promise.all([
    leerLaInvitacion(token),
    cargarLanding().then(
      (datos) => ({ datos }),
      () => null,
    ),
  ]);
  /*
    EL ENLACE YA NO VALE si la base, al preguntarle, dice que no existe —mal
    tecleado, o anulado al emitir otro—. Entonces no se saluda, la playlist no
    enseña su campo y la cookie se olvida. Si la base no contesta, NO se da
    por malo: quien sí tenía un enlace bueno conserva la playlist ese día.
  */
  const enlaceQueNoVale = lectura.tipo === "leida" && lectura.invitacion === null;
  const hayInvitacion = token !== null && !enlaceQueNoVale;
  const saludo =
    lectura.tipo === "leida" && lectura.invitacion ? lectura.invitacion.grupoNombre : null;
  const consulta = consultaDeConfirmacion(await searchParams);

  // La avería ya se registró en el log con su motivo. Aquí sólo se decide qué
  // ve el invitado, y lo que ve es la verdad: ahora mismo no se puede.
  if (!carga) return <EnPreparacion motivo="averia" />;
  const { datos } = carga;

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
    consejos,
    planes,
    cuentaRegalos,
    fotosPortada,
    fotosPaisaje,
    fotosGaleria,
    retrato,
  } = datos;

  // Sin configuración no hay boda que enseñar: la base respondió, pero el panel
  // aún está vacío. Se dice con claridad, en lugar de pintar una página rota o
  // inventarse datos para tapar el hueco.
  if (!configuracion) return <EnPreparacion retrato={retrato} />;

  const nombres = `${configuracion.nombreNovia} ${t("portada.conjuncion")} ${configuracion.nombreNovio}`;

  // La misma raíz para todas las fotos: dos lecturas de la variable acaban
  // discrepando el día que una se olvide.
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL;

  /*
    LAS COORDENADAS, COMPROBADAS UNA VEZ Y CON NOMBRE. Son dos columnas que
    sólo valen juntas —una latitud sin longitud no es ningún sitio—, así que se
    comprueban aquí y lo que baja es un punto o nada.
  */
  const coordenadas =
    configuracion.latitud !== null && configuracion.longitud !== null
      ? { latitud: configuracion.latitud, longitud: configuracion.longitud }
      : null;

  /*
    A DÓNDE PUEDE LLEVAR EL BOTÓN. «Ver el día» apunta a #programa, y esa
    sección puede no estar: apagada desde el panel, o sin ningún hito todavía.
    Se usa el mismo criterio que decide qué se pinta: visible y con contenido.
  */
  const hayPrograma = secciones.includes("programa") && programa.length > 0;

  /*
    LA CUENTA ATRÁS VA EN LA PORTADA, en una fila junto a la fecha y el lugar:
    es un dato más del primer vistazo, y como sección aparte costaba media
    pantalla. Sólo si está encendida en el panel y no ha pasado el día; si la
    portada está apagada, vuelve a ser su propia sección.
  */
  const quedaCuenta =
    secciones.includes("cuenta_atras") &&
    diaEnLaBoda(new Date()) <= diaEnLaBoda(configuracion.fechaCeremonia);
  const cuentaEnPortada = quedaCuenta && secciones.includes("portada");

  const contenido: Partial<Record<Seccion, ReactNode>> = {
    portada: (
      <Portada
        configuracion={configuracion}
        foto={fotosPortada[0] ?? null}
        urlBase={urlBase}
        hayPrograma={hayPrograma}
        saludo={saludo}
        cuentaAtras={cuentaEnPortada}
      />
    ),
    /*
      MANDA LA FRASE Y NO LA FOTO. Sin frase no hay nada que decir y la sección
      no se pinta; sin foto sí, sólo con la frase sobre el cielo. Esperar a la
      sesión de fotos para publicar una frase que ya está escrita sería tenerla
      meses en un cajón.
    */
    paisaje: configuracion.paisajeTitulo ? (
      <Paisaje
        intro={configuracion.paisajeIntro}
        titulo={configuracion.paisajeTitulo}
        cierre={configuracion.paisajeCierre}
        foto={fotosPaisaje[0] ?? null}
        urlBase={urlBase}
      />
    ) : undefined,
    // Pasado el día, no queda nada que contar; con portada, va dentro de ella.
    cuenta_atras:
      quedaCuenta && !cuentaEnPortada ? (
        <CuentaAtrasSeccion configuracion={configuracion} />
      ) : undefined,
    historia: historia.length > 0 ? <Historia hitos={historia} urlBase={urlBase} /> : undefined,
    galeria:
      fotosGaleria.length > 0 ? <Galeria fotos={fotosGaleria} urlBase={urlBase} /> : undefined,
    preboda:
      preboda.length > 0 ? (
        <ListaDeHoras
          seccion="preboda"
          /*
            LA VERSALITA ES LA FECHA DE LA VÍSPERA —«Viernes 25 de junio»—, no un
            rótulo fijo: es lo que de verdad quiere saber quien llega de fuera.
            Sale de la fecha de la ceremonia, un día antes, contado en la zona
            de la boda.
          */
          etiqueta={fechaConDia(vispera(configuracion.fechaCeremonia))}
          titulo={t("preboda.titulo")}
          entradilla={t(
            configuracion.ciudadCeremonia
              ? "preboda.entradilla"
              : "preboda.entradillaSinCiudad",
            {
              dia: nombreDelDia(vispera(configuracion.fechaCeremonia)),
              ciudad: configuracion.ciudadCeremonia ?? "",
            },
          )}
          cierre={t("preboda.cierre")}
          menor
          hitos={preboda}
        />
      ) : undefined,
    programa:
      programa.length > 0 ? (
        <ListaDeHoras
          seccion="programa"
          // «Sábado 26 de junio», como la escribe la entrega: sin coma ni año.
          etiqueta={fechaConDia(configuracion.fechaCeremonia)}
          titulo={t("programa.titulo")}
          avisos={configuracion.avisosPrograma}
          /*
            LA NOTA DEL AUTOBÚS SALE DE `rutas_llegada`, NO DE UN LITERAL: esas
            horas ya están en la base, en la ruta del autobús, y copiarlas aquí
            sería tenerlas en dos sitios que se pueden contradecir.
          */
          entradilla={notaDelAutobus(rutas)}
          hitos={programa}
        />
      ) : undefined,
    alojamiento:
      alojamientos.length > 0 ? (
        <Alojamiento
          sitios={alojamientos}
          configuracion={configuracion}
          nombres={nombres}
          urlBase={urlBase}
        />
      ) : undefined,
    /*
      SIN COORDENADAS NO HAY SECCIÓN, aunque haya rutas escritas: «treinta
      minutos en autobús» sin decir hasta dónde no informa de nada, y el mapa,
      que es el final de la página, tampoco se puede dibujar.
    */
    transporte: coordenadas ? (
      <Transporte rutas={rutas} configuracion={configuracion} coordenadas={coordenadas} />
    ) : undefined,
    preguntas_frecuentes:
      preguntas.length > 0 ? <Preguntas preguntas={preguntas} /> : undefined,
    playlist: <Playlist canciones={canciones} puedeApuntar={hayInvitacion} />,
    // Sin cuenta no hay sección: ver el comentario de `Regalos`.
    regalos: cuentaRegalos ? <Regalos firma={configuracion.firmaRegalos} /> : undefined,
    dresscode: consejos.length > 0 ? <DressCode consejos={consejos} /> : undefined,
    planes:
      planes.length > 0 ? (
        <Planes planes={planes} ciudad={configuracion.ciudadCeremonia} urlBase={urlBase} />
      ) : undefined,
    rsvp: (
      <Confirmacion
        lectura={lectura}
        consulta={consulta}
        configuracion={configuracion}
        /*
          LA PREBODA SE PREGUNTA SI LA WEB LA ENSEÑA: encendida y con algo en
          su programa. Preguntar por una cena que no sale en ninguna parte
          sería pedir que confirmen algo que no conocen.
        */
        preboda={
          secciones.includes("preboda") && preboda.length > 0
            ? vispera(configuracion.fechaCeremonia)
            : null
        }
      />
    ),
    // Sin foto recortada publicada no hay retrato: el cielo sigue sin él.
    retrato: retrato ? <RetratoDeEstrellas retrato={retrato} /> : undefined,
  };

  // El orden lo pone la base de datos; el filtro, lo que de verdad hay hecho.
  const aPintar = secciones.filter((seccion) => esAncla(seccion) && contenido[seccion]);

  /*
    LOS TRES TRAMOS DEL CIELO. La noche y el día conservan el orden de la
    base; la llegada va siempre al final, en su propio orden: dónde dormir,
    cómo llegar, los regalos y la confirmación.
  */
  /*
    EL RETRATO CIERRA LA NOCHE, esté donde esté en el orden de la base: es lo
    que se ve de pie sobre el horizonte, con el amanecer detrás.
  */
  const deNoche = [
    ...aPintar.filter((seccion) => esDeNoche(seccion)),
    ...aPintar.filter((seccion) => seccion === CIERRE_DE_LA_NOCHE),
  ];
  const deDia = aPintar.filter(
    (seccion) => !esDeNoche(seccion) && !esDeLlegada(seccion) && seccion !== CIERRE_DE_LA_NOCHE,
  );
  const deLlegada = SECCIONES_DE_LLEGADA.filter((seccion) => aPintar.includes(seccion));
  const enOrden = [...deNoche, ...deDia, ...deLlegada];

  /*
    EL MENÚ NO ES EL ÍNDICE DE LA PÁGINA: lleva sólo lo que alguien busca CON
    PRISA —a qué hora es, cómo se llega y dónde se duerme—. Quién entra lo
    decide `SECCIONES_EN_MENU`, en el orden en que aparecen en la página.
  */
  const enlaces = enOrden
    .filter((seccion) => vaEnElMenu(seccion))
    .map((seccion) => ({
      seccion,
      ancla: anclaDe(seccion),
      rotulo: t(`navegacion.secciones.${seccion}`),
    }));

  // «Volver arriba» y el monograma iban siempre a #portada, que también se
  // puede apagar. Sin portada, el principio del contenido.
  const inicio = aPintar.includes("portada") ? `#${anclaDe("portada")}` : `#${ID_CONTENIDO}`;

  const pintar = (lista: readonly Seccion[]) =>
    lista.map((seccion) => <Fragment key={seccion}>{contenido[seccion]}</Fragment>);

  return (
    <>
      {/* Los datos del evento para buscadores y asistentes de voz. */}
      <DatosEstructurados
        configuracion={configuracion}
        nombres={nombres}
        aLaVista={{
          // La dirección se lee en «Cómo llegar» y, cuando no hay ciudad, en
          // la portada, que la usa como procedencia. El mapa, sólo en «Cómo
          // llegar».
          direccion:
            aPintar.includes("transporte") ||
            (aPintar.includes("portada") && !configuracion.ciudadCeremonia),
          mapa: aPintar.includes("transporte"),
        }}
      />

      {/* Primer elemento enfocable del documento: quien navega con teclado no
          debería tener que recorrer el menú para llegar al contenido. Va en la
          capa modal y no en la de la cabecera: con la misma capa gana el
          último del documento, que es la cabecera fija. */}
      <a
        href={`#${ID_CONTENIDO}`}
        className="sr-only focus:not-sr-only focus:absolute focus:capa-modal focus:m-interno focus:rounded-boton focus:bg-superficie focus:px-interno focus:py-pila focus:text-tinta"
      >
        {t("navegacion.irAlContenido")}
      </a>

      {/*
        La barra de lectura: dos píxeles de bronce fijos arriba que crecen con
        lo leído. Sin JavaScript —va ligada al scroll con CSS— y sin
        anunciarse: para quien escucha la página no mide nada.
      */}
      <div aria-hidden="true" className="barra-lectura" />

      {/*
        OLVIDAR UN ENLACE QUE NO VALE. La página no puede borrar una cookie;
        una imagen sí puede pedir que se borre, y se pide también sin
        JavaScript. La contesta el middleware con un 204 (ver `middleware.ts`).
      */}
      {enlaceQueNoVale ? (
        // eslint-disable-next-line @next/next/no-img-element -- no es una foto: es la petición que olvida la cookie, y `next/image` la mandaría por el optimizador
        <img src={RUTA_OLVIDAR_INVITACION} alt="" hidden />
      ) : null}

      <Navegacion
        inicio={inicio}
        enlaces={enlaces}
        etiqueta={t("navegacion.etiquetaPrincipal")}
        nombreNovia={configuracion.nombreNovia}
        nombreNovio={configuracion.nombreNovio}
        empiezaDeNoche={deNoche.length > 0}
      />

      <main id={ID_CONTENIDO}>
        {deNoche.length > 0 ? (
          <>
            {/*
              LA NOCHE. Un bloque inverso —los colores de noche de la marca—
              con el cielo pintado de cenit a horizonte a lo largo de todo el
              tramo. El firmamento va en un lienzo pegado arriba, detrás de
              todo: gira mientras se baja y se apaga al acercarse el amanecer.
            */}
            <div
              data-tramo="noche"
              data-seccion="inversa"
              className="tramo-noche relative isolate"
            >
              <div aria-hidden className="lienzo-pegado capa-cielo">
                <CieloEstrellado viaLactea fugaces className="size-full" />
              </div>
              {pintar(deNoche)}
            </div>

            {/* EL AMANECER: la franja sin texto donde la noche se hace día. */}
            <div aria-hidden data-amanecer="" className="amanecer" />
          </>
        ) : null}

        {/* EL DÍA, del alba al blanco de mediodía, y al final, el mapa. */}
        <div data-tramo="dia" className="tramo-dia">
          {pintar(deDia)}
          {pintar(deLlegada)}
        </div>
      </main>

      <Pie
        inicio={inicio}
        nombreNovia={configuracion.nombreNovia}
        nombreNovio={configuracion.nombreNovio}
        fechaCeremonia={configuracion.fechaCeremonia}
        lugar={lugarConCiudad(configuracion)}
        correoContacto={configuracion.correoContacto}
        hashtag={configuracion.hashtag}
        secciones={secciones}
      />
    </>
  );
}

function esDeNoche(seccion: Seccion): boolean {
  return (SECCIONES_DE_NOCHE as readonly Seccion[]).includes(seccion);
}

function esDeLlegada(seccion: Seccion): boolean {
  return (SECCIONES_DE_LLEGADA as readonly Seccion[]).includes(seccion);
}

/**
 * La invitación de quien mira, leída una vez. Sin enlace recordado no se
 * pregunta nada; con él, la base dice su grupo —o que el enlace ya no vale—, y
 * si no responde o salta el cortafuegos, se dice eso y lo demás de la página
 * sigue en pie. Con el grupo va su borrador, sembrado con lo ya contestado.
 */
async function leerLaInvitacion(token: string | null): Promise<LecturaInvitacion> {
  if (!token) return { tipo: "sin-enlace" };
  try {
    const invitacion = await obtenerInvitacion(token);
    const borrador = await leerBorrador(token);
    return {
      tipo: "leida",
      invitacion,
      borrador: invitacion ? sembrarDesdeLaBase(borrador, invitacion.personas) : borrador,
    };
  } catch (error) {
    if (esCupoAgotado(error)) return { tipo: "fallo", fallo: "intentos" };
    console.error("No se pudo leer la invitación para la landing:", error);
    return { tipo: "fallo", fallo: "averia" };
  }
}

/** Lo que trae la URL al volver de un paso de la confirmación. */
function consultaDeConfirmacion(
  parametros: Record<string, string | string[] | undefined>,
): ConsultaConfirmacion {
  const uno = (clave: string) => {
    const valor = parametros[clave];
    return typeof valor === "string" && valor ? valor : undefined;
  };
  return {
    paso: uno("paso"),
    falta: uno("falta"),
    fallo: uno("fallo"),
    largo: uno("largo"),
    acompanante: uno("acompanante"),
    enviado: uno(MARCA_RSVP_ENVIADO.parametro) === MARCA_RSVP_ENVIADO.valor,
  };
}

/** «Finca La Sierra, León»: el lugar y, si está escrita, la ciudad detrás. */
function lugarConCiudad(configuracion: ConfiguracionBoda): string | null {
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;
  if (!lugar) return null;
  return configuracion.ciudadCeremonia
    ? t("pie.lugarYCiudad", { lugar, ciudad: configuracion.ciudadCeremonia })
    : lugar;
}

/**
 * El detalle de la ruta en autobús, para anunciarlo encima del programa.
 *
 * Se busca por el modo y no por una posición fija: las rutas las ordena quien
 * organiza desde el panel, y «la segunda de la lista» dejaría de ser el autobús
 * en cuanto alguien mueva una. Si no hay ruta en autobús no se anuncia nada,
 * que es lo correcto: no todas las bodas ponen.
 */
function notaDelAutobus(rutas: RutaLlegada[]): string | null {
  const autobus = rutas.find((ruta) => /autob[uú]s|bus/i.test(ruta.modo));
  return autobus?.detalle ?? null;
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
    consejos,
    planes,
    cuentaRegalos,
    fotosPortada,
    fotosPaisaje,
    fotosGaleria,
    retrato,
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
    obtenerConsejosVestimenta(),
    obtenerPlanes(),
    obtenerCuentaRegalos(),
    obtenerMedios("portada"),
    obtenerMedios("paisaje"),
    obtenerGaleria(),
    obtenerRetrato(),
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
    consejos,
    planes,
    cuentaRegalos,
    fotosPortada,
    fotosPaisaje,
    fotosGaleria,
    retrato,
  };
}

/* ------------------------------------------------------------------------ */
/* Secciones                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * LA PORTADA
 *
 * La pantalla partida: el texto ocupa una mitad y la foto la otra, y en cuanto
 * no caben dos columnas —móvil, o una ventana estrecha— se apilan solas. No hay
 * `breakpoint` escrito: lo resuelve `auto-fit` con un ancho mínimo de columna.
 *
 * ES DE NOCHE: no tiene fondo propio, va sobre el principio del cielo, con el
 * firmamento recién encendido detrás y los nombres en marfil. Sin foto el
 * texto se queda centrado sobre el cielo; el día que se publique una imagen,
 * ocupa su mitad sin tocar nada.
 */
function Portada({
  configuracion,
  foto,
  urlBase,
  hayPrograma,
  saludo,
  cuentaAtras,
}: {
  configuracion: ConfiguracionBoda;
  foto: Medio | null;
  urlBase: string | undefined;
  /** Si el programa existe de verdad en la página, para no enlazar al vacío. */
  hayPrograma: boolean;
  /** El nombre del grupo que ha abierto su invitación, o `null`. */
  saludo: string | null;
  /** Si va la cuenta atrás debajo de la fecha y el lugar. */
  cuentaAtras: boolean;
}) {
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;
  /*
    «Nos casamos en León». La dirección postal tiene su sitio en «cómo
    llegar»; aquí sólo aparece si nadie ha escrito la ciudad, que es mejor que
    dejar la portada sin su versalita.
  */
  const procedencia = configuracion.ciudadCeremonia
    ? t("portada.etiqueta", { ciudad: configuracion.ciudadCeremonia })
    : configuracion.direccionCeremonia;

  return (
    /*
      EN UN MÓVIL, UNA PANTALLA JUSTA: el texto arriba y la foto ocupando lo
      que quede, con un mínimo. Apilada a su alto fijo, la portada medía pantalla
      y media y la foto empujaba todo lo demás hacia abajo.
    */
    <section
      id={anclaDe("portada")}
      className="relative rejilla-partida min-h-dvh items-stretch max-md:flex max-md:flex-col"
    >
      <div
        className={`flex w-full flex-col justify-center px-portada-lado pt-portada-arriba pb-portada-abajo ${
          foto ? "" : "mx-auto max-w-contenido"
        }`}
      >
        {/*
          EL SALUDO, COMO EN UN SOBRE: «Para Familia Fernández». Sólo si se ha
          entrado por el enlace de la invitación; para el resto la portada es
          la de todos.
        */}
        {saludo ? (
          <p className="animacion-aparecer-lento mb-interno font-titulo text-saludo italic leading-titulo-corto text-tinta-marca">
            {t("portada.saludo", { grupo: saludo })}
          </p>
        ) : null}
        {procedencia ? (
          <p className="animacion-aparecer-lento retardo-1 text-boton uppercase tracking-marcado text-acento">
            {procedencia}
          </p>
        ) : null}

        {/*
          LOS NOMBRES EMERGEN de detrás de una línea invisible, cada uno con la
          pausa de su línea: es el primer plano de la película, y entra como un
          título, no como un párrafo.
        */}
        <Display className="animacion-subir retardo-2 mt-nombres">
          <span className="mascara-linea">
            <span className="linea-que-emerge pausa-nombre-novia">
              {configuracion.nombreNovia}
            </span>
          </span>
        </Display>
        <div className="animacion-subir retardo-3 flex flex-wrap items-baseline gap-conector">
          <Conector escrita>{t("portada.conjuncion")}</Conector>
          <Display como="p">
            <span className="mascara-linea">
              <span className="linea-que-emerge pausa-nombre-novio">
                {configuracion.nombreNovio}
              </span>
            </span>
          </Display>
        </div>

        <hr className="animacion-trazar retardo-4 my-raya border-t border-borde-fuerte" />

        {/*
          LOS DATOS Y LA CUENTA ATRÁS ENTRAN JUNTOS: son el mismo bloque —qué
          día, dónde y cuánto falta— y llegan a la vez, tras la raya.
        */}
        <div className="animacion-subir retardo-5">
          <dl className="flex flex-wrap gap-datos">
            <div>
              <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
                {t("portada.etiquetaFecha")}
              </dt>
              <dd className="mt-interno-compacto font-titulo peso-titulo-menor text-dato leading-titulo-corto text-tinta-marca tabular-nums">
                <time dateTime={configuracion.fechaCeremonia.toISOString()}>
                  {fechaEnPuntos(configuracion.fechaCeremonia)}
                </time>
              </dd>
            </div>
            {lugar ? (
              <div>
                <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
                  {t("portada.etiquetaLugar")}
                </dt>
                <dd className="mt-interno-compacto font-titulo peso-titulo-menor text-dato leading-titulo-corto text-tinta-marca">
                  {lugar}
                </dd>
              </div>
            ) : null}
          </dl>

          {cuentaAtras ? (
            <div id={anclaDe("cuenta_atras")} className="mt-hueco-fluido">
              <p className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
                {t("cuentaAtras.titulo")}
              </p>
              <div className="mt-interno-compacto">
                <CuentaAtras
                  fechaIso={configuracion.fechaCeremonia.toISOString()}
                  ahoraIso={new Date().toISOString()}
                  enFila
                />
              </div>
            </div>
          ) : null}
        </div>

        {/*
          El aviso de que la página sigue hacia abajo: una versalita y una raya
          que respira. `aria-hidden` porque para quien navega con lector de
          pantalla no significa nada: el documento ya continúa.
        */}
        <p
          aria-hidden
          className="animacion-aparecer-lento retardo-7 mt-hueco-fluido flex items-center gap-hueco-corto text-diminuto uppercase tracking-pista text-tinta-suave"
        >
          {t("portada.bajad")}
          <span className="animacion-flotar block h-raya-pista w-px bg-gradient-to-b from-borde-fuerte to-transparent" />
        </p>

        {/* Confirmar no va en la portada: está al final, tocando la estrella. */}
        {hayPrograma ? (
          <div className="animacion-subir retardo-6 mt-acciones flex flex-wrap gap-interno">
            <BotonEnlace href={`#${anclaDe("programa")}`}>{t("portada.verElDia")}</BotonEnlace>
          </div>
        ) : null}
      </div>

      {foto ? (
        <HuecoFoto
          medio={foto}
          urlBase={urlBase}
          prioritaria
          medidas="(min-width: 48rem) 50vw, 100vw"
          className="alto-foto-portada max-md:flex-1"
        />
      ) : null}
    </section>
  );
}

/**
 * EL PAISAJE · de dónde vienen los novios, en una frase
 *
 * Lo único de la página que cuenta de dónde vienen, en la costura entre los
 * nombres y lo demás. Antes era una escena de tres pantallas de alto; ahora es
 * una frase sobre el cielo de la noche —versalita, titular y un cierre en la
 * letra del conector— y, si hay, la foto o el vídeo en una franja apaisada.
 *
 * MANDA EL TITULAR, NO LA FOTO: sin titular no hay sección (lo decide quien la
 * pinta). La versalita y el cierre son opcionales una a una.
 */
function Paisaje({
  intro,
  titulo,
  cierre,
  foto,
  urlBase,
}: {
  intro: string | null;
  titulo: string;
  cierre: string | null;
  foto: Medio | null;
  urlBase: string | undefined;
}) {
  const idTitulo = `titulo-${anclaDe("paisaje")}`;
  const enElBucket = (ruta: string) =>
    `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${ruta}`;
  const fuente = foto && urlBase ? enElBucket(foto.ruta) : null;
  /*
    Lo dice la base —el campo `tipo`—, no el final de la ruta. El vídeo se
    monta por su propia rama porque se rinde solo ante `prefers-reduced-motion`
    y deja el fotograma.
  */
  const esVideo = Boolean(foto?.tipo === "video" && foto.posterRuta && fuente);

  return (
    <section
      id={anclaDe("paisaje")}
      aria-labelledby={idTitulo}
      className="relative px-margen py-tramo"
    >
      {/*
        Con foto y sitio, la foto a un lado y la frase al otro: apiladas, en
        pantalla ancha la franja medía casi una pantalla. Sin foto, o en un
        móvil, una columna centrada.
      */}
      <div
        className={`mx-auto max-w-medio text-center ${
          fuente
            ? "md:grid md:grid-cols-2 md:items-center md:gap-columnas-fluido md:text-left"
            : ""
        }`}
      >
        {fuente ? (
          <div className="animacion-escala-al-ver relative mb-cabecera-tramo aspect-paisaje overflow-hidden rounded-imagen bg-superficie-hundida md:mb-0">
            {esVideo ? (
              <VideoDeFondo
                fuente={fuente}
                poster={enElBucket(foto!.posterRuta!)}
                textoAlternativo={foto!.textoAlternativo}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <Image
                src={fuente}
                alt={foto!.textoAlternativo}
                fill
                sizes="(min-width: 48rem) 34rem, 100vw"
                className="object-cover"
                placeholder={foto!.marcadorBorroso ? "blur" : "empty"}
                blurDataURL={foto!.marcadorBorroso ?? undefined}
              />
            )}
          </div>
        ) : null}

        {/*
          El titular es el `h2` —es lo que la sección dice—; la versalita que lo
          abre y el cierre en la letra del conector son párrafos, porque leídos
          sueltos no son encabezados de nada.
        */}
        <header className="animacion-subir-al-ver">
          {intro ? (
            <p className="text-etiqueta uppercase tracking-marcado text-acento">{intro}</p>
          ) : null}
          <Titulo1 como="h2" id={idTitulo} tamano="tramo" className={intro ? "mt-pila" : ""}>
            {titulo}
          </Titulo1>
          {cierre ? (
            <p className="mt-pila">
              <Conector tamano="frase">{cierre}</Conector>
            </p>
          ) : null}
        </header>
      </div>
    </section>
  );
}

function CuentaAtrasSeccion({ configuracion }: { configuracion: ConfiguracionBoda }) {
  const idTitulo = `titulo-${anclaDe("cuenta_atras")}`;
  return (
    <section
      id={anclaDe("cuenta_atras")}
      className="relative px-margen py-tramo text-center"
      aria-labelledby={idTitulo}
    >
      <div className="animacion-cortina-al-ver mx-auto max-w-cuenta">
        <Etiqueta id={idTitulo} espaciado="seccion">
          {t("cuentaAtras.titulo")}
        </Etiqueta>
        <div className="mt-contador">
          <CuentaAtras
            fechaIso={configuracion.fechaCeremonia.toISOString()}
            ahoraIso={new Date().toISOString()}
          />
        </div>
        <Cita className="mx-auto mt-cita-arriba max-w-cita text-tinta-suave">
          {t("cuentaAtras.cierre")}
        </Cita>
      </div>
    </section>
  );
}

/**
 * NUESTRA HISTORIA, UNA ESTRELLA POR MOMENTO
 *
 * Bajo el cielo de la noche, cada hito es una estrella de cuatro puntas en una
 * columna, unidas por un hilo: la fecha, lo que pasó y, si hay, su foto en
 * pequeño. Al llegar a cada una, se enciende. Cabe en poco más de una pantalla:
 * es una historia que se lee de un vistazo, no un capítulo por pantalla.
 *
 * Con el último hito, la frase que lo cierra: «cada momento fue una estrella».
 */
function Historia({ hitos, urlBase }: { hitos: HitoHistoria[]; urlBase: string | undefined }) {
  return (
    <Bloque
      seccion="historia"
      etiqueta={t("historia.etiqueta")}
      titulo={t("historia.titulo")}
      realzada
      ancho="medio"
    >
      <ol className="hilo-de-estrellas">
        {hitos.map((hito) => (
          <li key={hito.id} className="rejilla-hito pb-elemento last:pb-0">
            <span className="flex h-columna-estrella items-center justify-center">
              <EstrellaDeCuatroPuntas className="animacion-pop-al-ver size-estrella-hito text-acento" />
            </span>
            <div className="animacion-subir-al-ver">
              {hito.fechaTexto ? <Etiqueta tono="acento">{hito.fechaTexto}</Etiqueta> : null}
              <Titulo3 como="h3" tamano="hito-menor" className="mt-interno-compacto">
                {hito.titulo}
              </Titulo3>
              {hito.descripcion ? (
                <Cuerpo className="mt-interno-compacto max-w-texto text-pequeno text-tinta-suave">
                  {hito.descripcion}
                </Cuerpo>
              ) : null}
            </div>
            {hito.foto && urlBase ? (
              <div className="animacion-escala-al-ver relative size-miniatura overflow-hidden rounded-imagen bg-superficie-hundida">
                <Image
                  src={`${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${hito.foto.ruta}`}
                  alt={hito.foto.textoAlternativo}
                  fill
                  sizes="6rem"
                  className="object-cover"
                  placeholder={hito.foto.marcadorBorroso ? "blur" : "empty"}
                  blurDataURL={hito.foto.marcadorBorroso ?? undefined}
                />
              </div>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
      <Cita className="animacion-subir-al-ver mt-cabecera-tramo text-center">
        {t("historia.cierre")}
      </Cita>
    </Bloque>
  );
}

function ListaDeHoras({
  seccion,
  etiqueta,
  titulo,
  entradilla = null,
  cierre = null,
  menor = false,
  avisos = [],
  hitos,
}: {
  seccion: Seccion;
  etiqueta: string;
  titulo: string;
  entradilla?: string | null;
  cierre?: string | null;
  menor?: boolean;
  avisos?: string[];
  hitos: { id: string; hora: string; titulo: string; descripcion: string | null }[];
}) {
  return (
    <Bloque
      seccion={seccion}
      etiqueta={etiqueta}
      titulo={titulo}
      entradilla={entradilla}
      realzada={!menor}
      ancho="medio"
    >
      {/*
        LA FILA: la hora en bronce, un filete de un píxel y el texto. Compacta:
        el día entero tiene que leerse bajando poco. En un móvil la hora va al
        lado del titular y la descripción debajo, a todo el ancho
        (`rejilla-hora`); con sitio, cada cosa en su columna.
      */}
      <ol>
        {hitos.map((hito) => (
          <li
            key={hito.id}
            className={`animacion-subir-al-ver rejilla-hora py-fila-compacta ${
              menor ? "border-b border-borde-filete" : "border-t border-borde"
            }`}
          >
            {/*
              Interlínea compacta y no la del cuerpo: es una cifra sola, y con
              la del cuerpo flotaba en vez de alinearse con el titular.

              EL HILO DEL DÍA, sólo en el programa: al bajar por cada fila, su
              filete se llena de bronce y la hora, que espera en tinta tenue, se
              enciende al llegar a ella. El scroll es el paso de las horas. Sin
              líneas de tiempo de scroll —o con movimiento reducido— la hora
              está en bronce desde el principio.
            */}
            <span
              className={`area-hora animacion-izquierda-al-ver font-titulo peso-titulo-menor ${
                menor ? "text-hora-menor" : "text-hora"
              } leading-compacto text-acento tabular-nums`}
            >
              {menor ? hito.hora : <span className="hora-que-llega">{hito.hora}</span>}
            </span>
            {/* El filete es color, no contenido: se dibuja de arriba abajo al entrar. */}
            <span
              aria-hidden="true"
              className={`area-filete animacion-trazar-vertical-al-ver hidden self-stretch md:block ${
                menor ? "bg-borde-filete" : "relative bg-borde"
              }`}
            >
              {menor ? null : <span className="hilo-del-dia absolute inset-0 bg-acento" />}
            </span>
            <Titulo3 como="h3" tamano={menor ? "hito-menor" : "hito"} className="area-titulo">
              {hito.titulo}
            </Titulo3>
            {hito.descripcion ? (
              <Cuerpo className="area-texto mt-interno-compacto max-w-texto text-pequeno">
                {hito.descripcion}
              </Cuerpo>
            ) : null}
          </li>
        ))}
      </ol>

      {/*
        LOS AVISOS: lo que conviene saber antes de vestirse. Son contenido de la
        boda —se editan en Ajustes— y sin ninguno no se pinta ni la línea.
      */}
      {avisos.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-fila-hueco border-t border-borde pt-elemento">
          {avisos.map((aviso) => (
            <EtiquetaEstado como="li" key={aviso} tamano="aviso">
              {aviso}
            </EtiquetaEstado>
          ))}
        </ul>
      ) : null}

      {cierre ? (
        <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-suave">
          {cierre}
        </Cuerpo>
      ) : null}
    </Bloque>
  );
}

/**
 * DÓNDE DORMIR, justo antes del mapa: los hoteles en filas, no en tarjetas
 * con foto grande. Se lee el nombre, el precio y «reservar»; la foto, si hay,
 * va en pequeño, que es lo que hace falta para reconocer la fachada.
 */
function Alojamiento({
  sitios,
  configuracion,
  nombres,
  urlBase,
}: {
  sitios: Hotel[];
  configuracion: ConfiguracionBoda;
  nombres: string;
  urlBase: string | undefined;
}) {
  /*
    «tres hoteles de León»: la cantidad sale de la lista y la ciudad de la
    configuración, en letra, que es como se escribe una cantidad pequeña
    dentro de una frase.
  */
  const cuantos = numeroEnLetra(sitios.length);
  const ciudad = configuracion.ciudadCeremonia;
  const hoteles =
    sitios.length === 1
      ? ciudad
        ? t("alojamiento.hotelDeCiudad", { ciudad })
        : t("alojamiento.hotel")
      : ciudad
        ? t("alojamiento.hotelesDeCiudad", { cuantos, ciudad })
        : t("alojamiento.hoteles", { cuantos });

  return (
    <Bloque
      seccion="alojamiento"
      etiqueta={t("alojamiento.etiqueta")}
      titulo={t("alojamiento.titulo")}
      entradilla={
        /*
          El plazo y los nombres salen de la base: escritos aquí se quedarían
          viejos el día que cambie cualquiera de los dos. Sin fecha límite se
          dice lo mismo sin ella.

          CADA HOTEL TIENE SU PLAZO. Si alguno lo trae (`fecha_limite_reserva`),
          va junto a ese hotel y la entradilla no pone ninguno: el de confirmar
          asistencia no es el del hotel, y dos fechas distintas en la misma
          sección se contradicen. Sólo si ninguno lo trae se queda la de
          siempre.
        */
        configuracion.fechaLimiteRsvp && !sitios.some((sitio) => sitio.fechaLimiteReserva)
          ? t("alojamiento.entradilla", {
              hoteles,
              nombres,
              fecha: fechaLarga(configuracion.fechaLimiteRsvp),
            })
          : t("alojamiento.entradillaSinPlazo", { hoteles, nombres })
      }
      composicion="apilada"
      ancho="medio"
    >
      <ul className="border-t border-borde">
        {sitios.map((sitio) => (
          <li
            key={sitio.id}
            className="animacion-subir-al-ver flex gap-elemento border-b border-borde py-fila"
          >
            {sitio.foto && urlBase ? (
              <div className="relative size-miniatura shrink-0 overflow-hidden rounded-imagen bg-superficie-hundida">
                <Image
                  src={`${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${sitio.foto.ruta}`}
                  alt={sitio.foto.textoAlternativo}
                  fill
                  sizes="6rem"
                  className="object-cover"
                  placeholder={sitio.foto.marcadorBorroso ? "blur" : "empty"}
                  blurDataURL={sitio.foto.marcadorBorroso ?? undefined}
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {sitio.distintivo ? <Etiqueta tono="acento">{sitio.distintivo}</Etiqueta> : null}
              <Titulo3 como="h3" tamano="hito-menor" className="mt-interno-compacto">
                {sitio.nombre}
              </Titulo3>
              {sitio.descripcion ? (
                <Cuerpo className="mt-interno-compacto text-pequeno">
                  {sitio.descripcion}
                </Cuerpo>
              ) : null}
              {/*
                LO QUE INCLUYE, EN ETIQUETAS: parking, desayuno, cena… Es lo
                que se compara entre dos hoteles antes de elegir, así que va a
                la vista y no dentro de la descripción.
              */}
              {sitio.incluye.length > 0 ? (
                <ul className="mt-interno flex flex-wrap gap-interno-compacto">
                  {sitio.incluye.map((cosa) => (
                    <EtiquetaEstado como="li" key={cosa} tamano="aviso">
                      {cosa}
                    </EtiquetaEstado>
                  ))}
                </ul>
              ) : null}
              {sitio.fechaLimiteReserva ? (
                <p className="mt-interno text-pequeno text-tinta-marca">
                  {t("alojamiento.plazo", {
                    fecha: fechaLarga(diaDeCalendario(sitio.fechaLimiteReserva)),
                  })}
                </p>
              ) : null}
              <div className="mt-interno-compacto flex flex-wrap items-baseline justify-between gap-interno">
                {sitio.precioTexto ? (
                  <span className="font-titulo peso-titulo-menor text-cifra-dato text-tinta-marca">
                    {sitio.precioTexto}
                  </span>
                ) : (
                  <span />
                )}
                {sitio.urlReserva ? (
                  <a
                    href={sitio.urlReserva}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-control-compacto items-center text-etiqueta uppercase tracking-boton text-marca transicion-color hover:text-tinta"
                  >
                    {t("alojamiento.reservar")}
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

/**
 * CÓMO LLEGAR, Y EL FINAL DE LA PÁGINA
 *
 * El día acaba en el sitio de la boda: el fondo se vuelve el mapa de
 * alrededor de la finca, una estrella baja hasta el punto exacto, y encima va
 * la tarjeta con el nombre del lugar, la dirección, las rutas y el botón que
 * abre la aplicación de mapas. En un móvil la tarjeta va debajo del mapa,
 * montada sobre su borde; en pantalla ancha, a su izquierda, encima.
 */
function Transporte({
  rutas,
  configuracion,
  coordenadas,
}: {
  rutas: { id: string; modo: string; duracion: string | null; detalle: string | null }[];
  configuracion: ConfiguracionBoda;
  coordenadas: { latitud: number; longitud: number };
}) {
  const idTitulo = `titulo-${anclaDe("transporte")}`;
  const lugar = configuracion.lugarCeremonia ?? configuracion.lugarBanquete;

  return (
    <section id={anclaDe("transporte")} aria-labelledby={idTitulo} className="relative grid">
      <MapaDelLugar
        latitud={coordenadas.latitud}
        longitud={coordenadas.longitud}
        rotulo={lugar}
        className="col-start-1 row-start-1 mapa-final"
      />

      <div className="relative col-start-1 row-start-2 -mt-solape-mapa px-margen pb-tramo md:row-start-1 md:mt-0 md:flex md:items-center md:pt-tramo">
        <div className="mx-auto w-full max-w-contenido">
          <div className="animacion-subir-al-ver max-w-entradilla-llegar rounded-tarjeta border border-borde bg-superficie-cabecera p-tarjeta-fluida shadow-tarjeta">
            <CabeceraSeccion
              idTitulo={idTitulo}
              /*
                EL NOMBRE DE LA FINCA, no un rótulo genérico: es lo que se busca
                cuando alguien llega aquí. Sin lugar configurado se cae al
                rótulo de siempre en vez de dejar un hueco.
              */
              etiqueta={configuracion.lugarCeremonia ?? t("comoLlegar.etiqueta")}
              titulo={t("comoLlegar.titulo")}
              entradilla={configuracion.direccionCeremonia ?? undefined}
              composicion="apilada"
              anchoEntradilla="llegar"
              className="mb-elemento"
            />

            {/*
              UNA SOLA REJILLA PARA TODAS LAS RUTAS: con `subgrid`, la columna de
              la duración la marca la más ancha y vale para todas, y los textos
              empiezan a la misma altura.
            */}
            {rutas.length > 0 ? (
              <ul className="rejilla-dato gap-x-elemento border-t border-borde">
                {rutas.map((ruta) => (
                  <li
                    key={ruta.id}
                    className="col-span-full grid grid-cols-subgrid border-b border-borde py-pila"
                  >
                    <span className="font-titulo peso-titulo-menor text-cifra-dato-menor text-marca">
                      {ruta.duracion}
                    </span>
                    <div>
                      <Etiqueta como="h3" tamano="boton" espaciado="boton" tono="tinta">
                        {ruta.modo}
                      </Etiqueta>
                      {ruta.detalle ? (
                        <Cuerpo className="mt-interno-compacto text-pequeno">
                          {ruta.detalle}
                        </Cuerpo>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-elemento flex flex-wrap items-center justify-between gap-elemento">
              <BotonEnlace
                href={enlaceMapaExterno(coordenadas.latitud, coordenadas.longitud)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("comoLlegar.abrirMapa")}
              </BotonEnlace>
              {/* De quién es el mapa: usar sus teselas obliga a decirlo. */}
              <p className="text-diminuto text-tinta-suave">
                {t("comoLlegar.mapaDe")}{" "}
                <a
                  href={URL_ATRIBUCION_MAPA}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline transicion-color hover:text-tinta"
                >
                  {t("comoLlegar.atribucionMapa")}
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * LAS PREGUNTAS, PLEGADAS. Son para quien tiene una duda, no para leerlas de
 * corrido: la sección es una sola línea —el titular— que se abre, y dentro
 * cada pregunta se abre a su vez. Acordeón nativo: accesible por teclado sin
 * una línea de JavaScript.
 */
function Preguntas({
  preguntas,
}: {
  preguntas: { id: string; pregunta: string; respuesta: string }[];
}) {
  const idTitulo = `titulo-${anclaDe("preguntas_frecuentes")}`;
  return (
    <section
      id={anclaDe("preguntas_frecuentes")}
      aria-labelledby={idTitulo}
      className="relative px-margen py-tramo"
    >
      <div className="mx-auto max-w-medio">
        <details className="group/preguntas border-y border-borde">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-elemento py-elemento">
            <span>
              <EtiquetaSeccion>{t("preguntas.etiqueta")}</EtiquetaSeccion>
              <Titulo2 id={idTitulo} className="mt-pila">
                {t("preguntas.titulo")}
              </Titulo2>
            </span>
            <SignoAbrir grupo="preguntas" />
          </summary>
          <ul className="border-t border-borde">
            {preguntas.map((pregunta) => (
              <li key={pregunta.id} className="border-b border-borde last:border-b-0">
                <details>
                  <summary className="cursor-pointer list-none py-pila font-titulo text-hito-menor transicion-color hover:text-tinta-marca">
                    {pregunta.pregunta}
                  </summary>
                  <Cuerpo className="max-w-texto pb-pila text-pequeno">
                    {pregunta.respuesta}
                  </Cuerpo>
                </details>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

function Playlist({
  canciones,
  puedeApuntar,
}: {
  canciones: { id: string; texto: string }[];
  puedeApuntar: boolean;
}) {
  return (
    <Bloque
      seccion="playlist"
      etiqueta={t("playlist.etiqueta")}
      titulo={t("playlist.titulo")}
      entradilla={t("playlist.descripcion")}
      realzada
      composicion="centrada"
      ancho="playlist"
    >
      {puedeApuntar ? (
        <FormularioPlaylist />
      ) : (
        <Cuerpo className="mx-auto max-w-texto text-center text-pequeno text-tinta-suave">
          {t("playlist.sinInvitacion")}
        </Cuerpo>
      )}

      {/*
        EN UN MÓVIL, UNA SOLA FILA QUE SE DESLIZA: con todas las canciones
        envueltas, la lista crecía hacia abajo con cada una que se apunta. Se
        puede recorrer con el dedo y, con el foco, con las flechas.
      */}
      {canciones.length > 0 ? (
        <ul
          tabIndex={0}
          aria-label={t("playlist.apuntadas")}
          className="-mx-margen mt-elemento flex gap-hueco-corto overflow-x-auto px-margen pb-interno-compacto max-sm:flex-nowrap sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {canciones.map((cancion) => (
            <EtiquetaEstado
              como="li"
              key={cancion.id}
              tamano="chip"
              className="animacion-pop levantar-al-pasar shrink-0"
            >
              {cancion.texto}
            </EtiquetaEstado>
          ))}
        </ul>
      ) : (
        <Cuerpo className="mt-elemento text-center">{t("playlist.vacia")}</Cuerpo>
      )}
    </Bloque>
  );
}

/**
 * LOS REGALOS, PLEGADOS Y AL FINAL, junto a la confirmación: lo que se hace
 * va junto. Una línea —el titular— que se abre, y dentro el texto, el número
 * de cuenta con su botón de copiar y el buzón.
 *
 * EL TEXTO ES UNA CARTA, Y SE FIRMA: «Paloma, David y Hati», en la cursiva de
 * las citas, justo debajo. La firma es un dato de la boda (`firma_regalos`, en
 * Ajustes) porque lleva sus nombres; sin firma, la carta va sin firmar.
 */
function Regalos({ firma }: { firma: string | null }) {
  const idTitulo = `titulo-${anclaDe("regalos")}`;
  return (
    <section
      id={anclaDe("regalos")}
      aria-labelledby={idTitulo}
      className="relative px-margen py-tramo"
    >
      {/* El mismo ancho y eje que vuestra estrella, que va justo debajo. */}
      <div className="mx-auto max-w-estrecho">
        <details className="group/regalos border-y border-borde">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-elemento py-elemento">
            <span>
              <EtiquetaSeccion realzada>{t("regalos.etiqueta")}</EtiquetaSeccion>
              <Titulo2 id={idTitulo} className="mt-pila">
                {t("regalos.titulo")}
              </Titulo2>
            </span>
            <SignoAbrir grupo="regalos" />
          </summary>
          {/*
            EL NÚMERO NO ESTÁ AQUÍ. Este componente pinta un botón; el IBAN se
            pide a `/regalos/cuenta` cuando alguien lo pulsa. Lo que el servidor
            decide es sólo SI hay cuenta —para no enseñar un botón que no lleva
            a nada— y eso no revela el número.
          */}
          <div className="pb-elemento">
            <Cuerpo className="max-w-texto">{t("regalos.descripcion")}</Cuerpo>
            {firma ? <Cita className="mt-pila">{firma}</Cita> : null}
            <div className="mt-elemento">
              <CuentaRegalos />
            </div>
            <Cuerpo className="mt-pila text-pequeno text-tinta-suave">
              {t("regalos.buzon")}
            </Cuerpo>
          </div>
        </details>
      </div>
    </section>
  );
}

function DressCode({ consejos }: { consejos: ConsejoVestimenta[] }) {
  return (
    <Bloque
      seccion="dresscode"
      etiqueta={t("dresscode.etiqueta")}
      titulo={t("dresscode.titulo")}
      entradilla={t("dresscode.descripcion")}
      realzada
      composicion="apilada"
      ancho="medio"
    >
      {/* Sin tarjetas: una versalita y su texto, en columnas cuando caben, que
          entran de izquierda a derecha (`escalonado`). */}
      <ul className="escalonado rejilla-consejos gap-elemento border-t border-borde pt-elemento">
        {consejos.map((consejo) => (
          <li key={consejo.id} className="animacion-subir-al-ver">
            <Etiqueta como="h3" tono="marca" className="mb-interno-compacto">
              {consejo.titulo}
            </Etiqueta>
            <Cuerpo className="text-pequeno">{consejo.texto}</Cuerpo>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

/**
 * MIENTRAS ESTÁIS POR AQUÍ: lo que haríais vosotros en la ciudad, para quien
 * viene de fuera y se queda el fin de semana. Cada plan es una tarjeta con una
 * foto vuestra allí —es lo que lo hace vuestro y no una guía—, y sin foto la
 * tarjeta sale igual, con su texto. Las fotos van en el tono del mapa del
 * final (`tono-de-plano`): grises tostados, como un plano impreso.
 *
 * El título lleva la ciudad de la configuración: «Planes por León».
 */
function Planes({
  planes,
  ciudad,
  urlBase,
}: {
  planes: Plan[];
  ciudad: string | null;
  urlBase: string | undefined;
}) {
  return (
    <Bloque
      seccion="planes"
      etiqueta={t("planes.etiqueta")}
      titulo={ciudad ? t("planes.titulo", { ciudad }) : t("planes.tituloSinCiudad")}
      entradilla={t("planes.entradilla")}
      composicion="apilada"
      ancho="medio"
    >
      <ul className="escalonado rejilla-tarjetas gap-elemento">
        {planes.map((plan) => (
          <Tarjeta
            key={plan.id}
            como="li"
            tamano="amplia"
            className="animacion-subir-al-ver"
            titulo={plan.titulo}
            texto={plan.texto}
            imagen={
              plan.foto && urlBase ? (
                <Image
                  src={`${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${plan.foto.ruta}`}
                  alt={plan.foto.textoAlternativo}
                  fill
                  // Hasta tres por fila en escritorio, dos en tableta, una en el móvil.
                  sizes="(min-width: 64rem) 22rem, (min-width: 36rem) 50vw, 100vw"
                  // En sepia, como el mapa del final: todas casan, vengan de donde vengan.
                  className="tono-de-plano object-cover"
                  placeholder={plan.foto.marcadorBorroso ? "blur" : "empty"}
                  blurDataURL={plan.foto.marcadorBorroso ?? undefined}
                />
              ) : undefined
            }
          />
        ))}
      </ul>
    </Bloque>
  );
}

type ComposicionDeCabecera = "alineada" | "apilada" | "centrada";

function CabeceraSeccion({
  idTitulo,
  etiqueta,
  titulo,
  entradilla = null,
  realzada = false,
  barrido = false,
  composicion = "alineada",
  anchoEntradilla = "texto",
  className = "mb-cabecera-tramo",
}: {
  idTitulo: string;
  etiqueta: string | null;
  titulo: string | null;
  entradilla?: string | null;
  realzada?: boolean;
  barrido?: boolean;
  composicion?: ComposicionDeCabecera;
  anchoEntradilla?: "texto" | "llegar";
  className?: string;
}) {
  if (!etiqueta && !titulo) return null;

  const entradillaDebajo = composicion !== "alineada" && entradilla;
  const anchoDeEntradilla =
    composicion === "centrada"
      ? "mx-auto max-w-entradilla-centrada"
      : anchoEntradilla === "llegar"
        ? "max-w-entradilla-llegar"
        : "max-w-texto";

  const rotulo = (
    <div className={composicion === "apilada" ? "max-w-cabecera-seccion" : undefined}>
      {etiqueta ? (
        <EtiquetaSeccion
          realzada={realzada}
          className={barrido ? "animacion-barrido-al-ver" : ""}
        >
          {etiqueta}
        </EtiquetaSeccion>
      ) : null}
      {titulo ? (
        <Titulo1 como="h2" id={idTitulo} tamano="tramo" className="mt-pila">
          {titulo}
        </Titulo1>
      ) : null}
      {entradillaDebajo ? (
        <Cuerpo className={`mt-pila ${anchoDeEntradilla}`}>{entradilla}</Cuerpo>
      ) : null}
    </div>
  );

  return (
    <header
      className={`animacion-subir-al-ver ${className} ${
        composicion === "centrada"
          ? "text-center"
          : composicion === "alineada"
            ? "flex flex-wrap items-end justify-between gap-elemento"
            : ""
      }`}
    >
      {rotulo}
      {composicion === "alineada" && entradilla ? (
        <Cuerpo className="ancho-entradilla">{entradilla}</Cuerpo>
      ) : null}
    </header>
  );
}

type AnchoDeBloque = "contenido" | "medio" | "playlist" | "estrecho" | "amplio";

const ANCHOS: Record<AnchoDeBloque, string> = {
  contenido: "max-w-contenido",
  medio: "max-w-medio",
  playlist: "max-w-playlist",
  estrecho: "max-w-estrecho",
  amplio: "max-w-amplio",
};

/**
 * UNA SECCIÓN SOBRE EL CIELO: sin fondo propio —el cielo es uno— y con el
 * aire del cielo continuo (`py-tramo`), que es menos que el de una sección con
 * su banda de color: aquí ya no hace falta una pantalla de margen para saber
 * que empieza otra cosa.
 */
function Bloque({
  seccion,
  etiqueta,
  titulo,
  entradilla = null,
  realzada = false,
  barrido = false,
  composicion = "alineada",
  ancho = "contenido",
  children,
}: {
  seccion: Seccion;
  etiqueta: string | null;
  titulo: string | null;
  entradilla?: string | null;
  realzada?: boolean;
  barrido?: boolean;
  composicion?: ComposicionDeCabecera;
  ancho?: AnchoDeBloque;
  children: ReactNode;
}) {
  const ancla = anclaDe(seccion);
  const idTitulo = `titulo-${ancla}`;
  return (
    <section
      id={ancla}
      className="relative px-margen py-tramo"
      aria-labelledby={titulo ? idTitulo : undefined}
    >
      <div className={`mx-auto ${ANCHOS[ancho]}`}>
        <CabeceraSeccion
          idTitulo={idTitulo}
          etiqueta={etiqueta}
          titulo={titulo}
          entradilla={entradilla}
          realzada={realzada}
          barrido={barrido}
          composicion={composicion}
        />
        {children}
      </div>
    </section>
  );
}
