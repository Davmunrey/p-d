import { avanzar, reabrir } from "@/app/acciones-confirmacion";
import { VuestraEstrella } from "@/components/marketing/vuestra-estrella";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto } from "@/components/ui/campo";
import { SignoAbrir } from "@/components/ui/signo-abrir";
import { Cita, Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  LARGOS_DE_CAMPO,
  LONGITUD_MINIMA_NOMBRE,
  MENU_SOLO_NINOS,
  MENUS_RSVP,
  PASOS_RSVP,
  ZONA_HORARIA,
  type PasoRsvp,
  TRAYECTOS_AUTOBUS,
} from "@/config/constants";
import { anclaDe } from "@/config/secciones";
import type { ConfiguracionBoda } from "@/lib/bbdd/landing";
import type { Invitacion, PersonaInvitada } from "@/lib/bbdd/rsvp";
import { t } from "@/lib/copy";
import { fechaConDia, fechaLarga } from "@/lib/fechas";
import {
  ANCLA_ACOMPANANTE,
  ANCLA_FORMULARIO,
  anclaPersona,
  avisoPersona,
  faltanDeLaUrl,
} from "@/lib/rsvp-ancla";
import type { Borrador } from "@/lib/rsvp-borrador";
import { CAMPO_PREGUNTA_PREBODA } from "@/lib/rsvp-preboda";

/**
 * LA CONFIRMACIÓN, AL FINAL DE LA PÁGINA
 *
 * Lo último de la landing es vuestra estrella: hueca, latiendo, con «Sólo falta
 * vuestra estrella». Es un desplegable (`<details>`): tocarla abre, ahí mismo,
 * el formulario del grupo —quién viene, a quién traen si la invitación deja
 * traer a alguien y, de quien viene, el menú, las alergias y el autobús—, sin
 * salir de la página ni perder de vista lo demás.
 * Cuando el grupo ha confirmado que viene alguien, la estrella se enciende.
 *
 * SÓLO CON EL ENLACE DE LA INVITACIÓN. El formulario es el del grupo de quien
 * abrió su enlace (la cookie que deja `/invitacion/<token>`); sin él, la
 * estrella explica cómo se confirma, y nada más.
 *
 * FUNCIONA SIN JAVASCRIPT. Un `POST` por paso a `acciones-confirmacion.ts`,
 * que vuelve a la landing con el paso en la URL: el desplegable sale abierto y
 * en su sitio. Lo que se va escribiendo vive en un borrador en cookie.
 *
 * Esta pieza no lee nada: la página le da ya leída la invitación —o por qué no
 * se pudo leer— y lo que dice la URL.
 */

/** Lo que se pudo saber de la invitación de quien mira. */
export type LecturaInvitacion =
  | { tipo: "sin-enlace" }
  | { tipo: "fallo"; fallo: "intentos" | "averia" }
  | { tipo: "leida"; invitacion: Invitacion | null; borrador: Borrador };

/** Lo que trae la URL al volver de un paso. */
export interface ConsultaConfirmacion {
  paso?: string;
  falta?: string;
  fallo?: string;
  largo?: string;
  /** Qué ha pasado al apuntar o quitar a un acompañante. */
  acompanante?: string;
  enviado: boolean;
}

const nombreCompleto = (persona: PersonaInvitada) =>
  [persona.nombre, persona.apellidos].filter(Boolean).join(" ");

/** «12 de abril, 18:40», en la hora de la boda y no en la del servidor. */
const formatoFechaHora = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_HORARIA,
});

export function Confirmacion({
  lectura,
  consulta,
  configuracion,
  preboda = null,
}: {
  lectura: LecturaInvitacion;
  consulta: ConsultaConfirmacion;
  configuracion: ConfiguracionBoda;
  /** El día de la preboda, si la web la enseña; `null` si no hay que preguntarla. */
  preboda?: Date | null;
}) {
  const idTitulo = `titulo-${anclaDe("rsvp")}`;
  const invitacion = lectura.tipo === "leida" ? lectura.invitacion : null;
  const encendida = Boolean(invitacion?.personas.some((p) => p.estado === "confirmado"));
  const respondido = Boolean(
    invitacion?.personas.every((p) => p.estado === "confirmado" || p.estado === "rechazado"),
  );

  // Abierto si se vuelve de un paso: lo que se estaba haciendo sigue a la vista.
  const abierto = Boolean(
    consulta.paso ||
    consulta.falta ||
    consulta.fallo ||
    consulta.largo ||
    consulta.acompanante ||
    consulta.enviado,
  );

  return (
    <section
      id={anclaDe("rsvp")}
      aria-labelledby={idTitulo}
      className="relative px-margen py-tramo"
    >
      <div className="mx-auto max-w-estrecho">
        <details open={abierto} data-confirmacion="" className="group/confirmar">
          {/*
            LA ESTRELLA ES EL BOTÓN. Todo el `summary` se toca —la estrella, el
            titular y la pista—, que en un móvil es un blanco cómodo para el
            pulgar, y con teclado se abre con Intro o espacio, como cualquier
            desplegable.
          */}
          <summary className="pulsable flex cursor-pointer list-none flex-col items-center rounded-tarjeta py-pila text-center">
            <VuestraEstrella encendida={encendida} className="size-vuestra-estrella" />
            <Cita className="mt-pila">
              {encendida ? t("rsvp.estrellaEncendida") : t("rsvp.faltaVuestraEstrella")}
            </Cita>
            <h2
              id={idTitulo}
              className="mt-pila font-cuerpo text-etiqueta uppercase tracking-etiqueta text-tinta"
            >
              {t("rsvp.titulo")}
            </h2>
            <span className="mt-interno-compacto text-pequeno text-tinta-suave">
              {respondido ? t("rsvp.tocadParaVer") : t("rsvp.tocadLaEstrella")}
              {configuracion.fechaLimiteRsvp
                ? ` ${t("rsvp.antesDel", { fecha: fechaLarga(configuracion.fechaLimiteRsvp) })}.`
                : null}
            </span>
          </summary>

          {/* Cada paso vuelve aquí (`ANCLA_FORMULARIO`), con la tarjeta arriba. */}
          <div
            id={ANCLA_FORMULARIO}
            className="mt-elemento scroll-mt-cabecera rounded-tarjeta border border-borde bg-superficie p-tarjeta-fluida shadow-tarjeta"
          >
            <Contenido
              lectura={lectura}
              consulta={consulta}
              configuracion={configuracion}
              preboda={preboda}
            />
          </div>
        </details>
      </div>
    </section>
  );
}

function Contenido({
  lectura,
  consulta,
  configuracion,
  preboda,
}: {
  lectura: LecturaInvitacion;
  consulta: ConsultaConfirmacion;
  configuracion: ConfiguracionBoda;
  preboda: Date | null;
}) {
  const correo = configuracion.correoContacto;

  if (lectura.tipo === "sin-enlace") {
    return (
      <>
        <Cuerpo className="text-center">{t("rsvp.comoSeConfirma")}</Cuerpo>
        <LineaContacto correo={correo} texto={t("rsvp.enlacePerdido")} />
      </>
    );
  }

  if (lectura.tipo === "fallo") {
    return (
      <p role="alert" className="text-center text-cuerpo leading-cuerpo text-tinta-suave">
        {lectura.fallo === "intentos"
          ? t("rsvp.demasiadosIntentos")
          : t("rsvp.invitacionNoDisponible")}
      </p>
    );
  }

  const { invitacion, borrador } = lectura;
  if (!invitacion) {
    return (
      <>
        <p role="alert" className="text-center text-cuerpo leading-cuerpo text-tinta-suave">
          {t("rsvp.avisoEnlaceNoValido")}
        </p>
        <LineaContacto correo={correo} texto={t("rsvp.enlacePerdido")} />
      </>
    );
  }

  const plazoCerrado = Boolean(
    configuracion.fechaLimiteRsvp && configuracion.fechaLimiteRsvp < new Date(),
  );
  const respondido = invitacion.personas.every(
    (persona) => persona.estado === "confirmado" || persona.estado === "rechazado",
  );

  if (consulta.enviado || (respondido && !consulta.paso)) {
    return (
      <RespuestaEnviada personas={invitacion.personas} cerrado={plazoCerrado} correo={correo} />
    );
  }

  if (plazoCerrado) {
    return (
      <>
        <Cuerpo className="text-center">{t("rsvp.plazoCerrado")}</Cuerpo>
        <LineaContacto correo={correo} texto={t("rsvp.plazoCerradoContacto")} />
      </>
    );
  }

  const alguienViene = invitacion.personas.some(
    (persona) => borrador.asistencia[persona.id] === "confirmado",
  );
  const paso: PasoRsvp =
    consulta.paso === "detalles" && alguienViene ? "detalles" : "asistencia";
  const total = alguienViene ? PASOS_RSVP.length : 1;
  /*
    EL BOTÓN DICE LO QUE VA A PASAR. Sin JavaScript el rótulo se decide al
    pintar, antes de que nadie marque nada: con «Enviar» de entrada, quien
    marcaba «sí» esperaba haber terminado y le salía otro paso. Así que es
    «Siguiente» mientras no esté todo contestado con un «no»; si nadie viene,
    ya no hay más que preguntar y es «Enviar».
  */
  const todosContestados = invitacion.personas.every((persona) =>
    Boolean(borrador.asistencia[persona.id]),
  );
  const ultimo = paso === "detalles" || (todosContestados && !alguienViene);

  return (
    <>
      <header className="text-center">
        <Titulo2 como="p">{t("rsvp.saludo", { grupo: invitacion.grupoNombre })}</Titulo2>
        {configuracion.fechaLimiteRsvp && paso === "asistencia" ? (
          <Cuerpo className="mx-auto mt-pila max-w-texto text-pequeno text-tinta-suave">
            {t("rsvp.entradillaPlazo", { fecha: fechaLarga(configuracion.fechaLimiteRsvp) })}
          </Cuerpo>
        ) : null}
      </header>

      {consulta.fallo ? <Aviso motivo={consulta.fallo} correo={correo} /> : null}

      {/*
        LO DEMASIADO LARGO SE DICE ARRIBA Y EN `alert`, como el resto de lo que
        impide seguir: el aviso es el mismo para todas las casillas de alergias,
        y repetirlo cinco veces no ayuda a nadie.
      */}
      {consulta.largo ? (
        <p
          role="alert"
          className="mt-elemento rounded-campo border border-error bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {t("rsvp.demasiadoLargo")}
        </p>
      ) : null}

      <form action={avanzar} className="mt-elemento grid gap-elemento">
        <input type="hidden" name="paso" value={paso} />
        {/*
          EL INTRO VA HACIA ADELANTE. Intro —o «Ir» en el teclado del móvil— en
          un campo de texto envía el formulario con su PRIMER botón de envío.
          Éste va el primero, fuera de la vista y del tabulador, y hace lo mismo
          que «Siguiente»: si no, quien escribía «celíaca» y tocaba «Ir» volvía
          al paso anterior.
        */}
        <button
          type="submit"
          name="direccion"
          value="siguiente"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        >
          {ultimo ? t("rsvp.enviar") : t("rsvp.siguiente")}
        </button>

        {paso === "asistencia" ? (
          <PasoAsistencia
            /*
              «PASO 1 DE 2» SÓLO SI HAY UN 2: lo mismo que decide el rótulo del
              botón. Si todos han dicho que no, este paso es el único y su
              botón ya es «Enviar».
            */
            etiquetaPaso={
              ultimo
                ? undefined
                : t("rsvp.etiquetaPaso", { actual: 1, total: PASOS_RSVP.length })
            }
            personas={invitacion.personas}
            borrador={borrador}
            faltan={faltanDeLaUrl(consulta.falta ?? "")}
            plazasLibres={invitacion.plazasLibres}
            acompanante={consulta.acompanante}
          />
        ) : (
          <PasoDetalles
            personas={invitacion.personas}
            borrador={borrador}
            etiquetaPaso={t("rsvp.etiquetaPaso", { actual: 2, total })}
            preboda={preboda}
          />
        )}

        {/*
          EN EL MÓVIL, EL BOTÓN QUE AVANZA VA ARRIBA Y A TODO EL ANCHO, bajo el
          pulgar; «Atrás» queda debajo, discreto. Desde tableta, cada uno a su
          lado, como se lee: atrás a la izquierda, adelante a la derecha.
        */}
        <div className="flex flex-col-reverse items-stretch gap-interno sm:flex-row sm:items-center sm:justify-between">
          {paso === "asistencia" ? (
            <span className="hidden sm:block" />
          ) : (
            <BotonEnvio
              name="direccion"
              value="atras"
              jerarquia="terciario"
              className="self-center sm:self-auto"
            >
              {t("rsvp.atras")}
            </BotonEnvio>
          )}
          {/* Sin doble toque: con JavaScript el botón se apaga mientras la acción corre. */}
          <BotonEnvio
            name="direccion"
            value="siguiente"
            rotuloPendiente={ultimo ? t("rsvp.enviando") : t("rsvp.guardando")}
            className="w-full sm:w-auto"
          >
            {ultimo ? t("rsvp.enviar") : t("rsvp.siguiente")}
          </BotonEnvio>
        </div>
      </form>
    </>
  );
}

function LineaContacto({ correo, texto }: { correo: string | null; texto: string }) {
  if (!correo) return null;
  return (
    <p className="mx-auto mt-pila max-w-texto text-center text-pequeno text-tinta-suave">
      {texto}{" "}
      <a
        href={`mailto:${correo}`}
        className="border-b border-borde-fuerte wrap-anywhere transicion-color hover:text-acento"
      >
        {correo}
      </a>
    </p>
  );
}

function Aviso({ motivo, correo }: { motivo: string; correo: string | null }) {
  const texto =
    motivo === "plazo"
      ? t("rsvp.plazoCerrado")
      : motivo === "enlace"
        ? t("rsvp.avisoEnlaceNoValido")
        : motivo === "intentos"
          ? t("rsvp.demasiadosIntentos")
          : motivo === "respuestas"
            ? t("rsvp.errorCaducado")
            : correo
              ? t("rsvp.errorEnviando", { correo })
              : t("rsvp.errorEnviandoSinCorreo");
  return (
    <p
      role="alert"
      className="mt-elemento rounded-campo border border-error bg-error-fondo p-interno text-error-tinta"
    >
      {texto}
    </p>
  );
}

/**
 * Quién viene: dos opciones por persona, cada una en su `fieldset`, que es lo
 * que ata las dos opciones a un nombre. Sin `required`: la comprobación de
 * verdad la hace el servidor, que vuelve aquí señalando a quién falta.
 */
function PasoAsistencia({
  etiquetaPaso,
  personas,
  borrador,
  faltan,
  plazasLibres,
  acompanante,
}: {
  etiquetaPaso?: string;
  personas: PersonaInvitada[];
  borrador: Borrador;
  faltan: Set<string>;
  plazasLibres: number;
  acompanante?: string;
}) {
  return (
    <div className="grid gap-elemento">
      <div>
        {etiquetaPaso ? <Etiqueta>{etiquetaPaso}</Etiqueta> : null}
        <Titulo2 como="h3" className={etiquetaPaso ? "mt-linea" : undefined}>
          {t("rsvp.pasoAsistenciaTitulo")}
        </Titulo2>
        <Cuerpo className="mt-linea">{t("rsvp.pasoAsistenciaAyuda")}</Cuerpo>
      </div>
      <AvisoAcompanante resultado={acompanante} />
      {personas.map((persona) => {
        const elegido = borrador.asistencia[persona.id];
        const falta = faltan.has(persona.id);
        // Un acompañante sin respuesta guardada aún se puede quitar: es el que
        // se acaba de apuntar, quizá con una errata.
        const quitable =
          persona.esAcompanante &&
          persona.estado !== "confirmado" &&
          persona.estado !== "rechazado";
        return (
          <fieldset
            key={persona.id}
            id={anclaPersona(persona.id)}
            className={`grid scroll-mt-cabecera gap-interno rounded-tarjeta border p-interno ${
              falta ? "border-error" : "border-borde"
            }`}
          >
            <legend className="px-linea font-titulo text-titulo-3">
              {nombreCompleto(persona)}
            </legend>
            {(
              [
                ["confirmado", t("rsvp.vieneSi")],
                ["rechazado", t("rsvp.vieneNo")],
              ] as const
            ).map(([valor, rotulo]) => (
              <label
                key={valor}
                className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue"
              >
                <input
                  type="radio"
                  name={`viene-${persona.id}`}
                  value={valor}
                  defaultChecked={elegido === valor}
                  aria-describedby={falta ? avisoPersona(persona.id) : undefined}
                  className="casilla-marca transicion-color"
                />
                <span className="text-cuerpo text-tinta">{rotulo}</span>
              </label>
            ))}
            {falta ? (
              <span
                id={avisoPersona(persona.id)}
                role="alert"
                className="text-pequeno text-error"
              >
                {t("rsvp.errorSinRespuesta", { nombre: persona.nombre })}
              </span>
            ) : null}
            {quitable ? (
              <div className="flex justify-end">
                <BotonEnvio
                  name="quitar"
                  value={persona.id}
                  jerarquia="terciario"
                  aria-label={t("rsvp.acompananteQuitarA", { nombre: nombreCompleto(persona) })}
                  rotuloPendiente={t("rsvp.guardando")}
                >
                  {t("rsvp.acompananteQuitar")}
                </BotonEnvio>
              </div>
            ) : null}
          </fieldset>
        );
      })}
      {plazasLibres > 0 ? (
        <VenisConAlguien plazasLibres={plazasLibres} acompanante={acompanante} />
      ) : null}
    </div>
  );
}

/** Lo que ha pasado con el acompañante: lo bueno en `status`, lo que no en `alert`. */
function AvisoAcompanante({ resultado }: { resultado?: string }) {
  const bien: Record<string, string> = {
    anadido: t("rsvp.acompananteAnadido"),
    quitado: t("rsvp.acompananteQuitado"),
  };
  const mal: Record<string, string> = {
    tope: t("rsvp.acompananteSinSitio"),
    contestado: t("rsvp.acompananteYaContestado"),
  };
  if (resultado && bien[resultado]) {
    return (
      <p
        role="status"
        className="rounded-campo border border-borde-marca bg-superficie-tenue p-interno text-pequeno text-tinta"
      >
        {bien[resultado]}
      </p>
    );
  }
  if (resultado && mal[resultado]) {
    return (
      <p
        role="alert"
        className="rounded-campo border border-error bg-error-fondo p-interno text-pequeno text-error-tinta"
      >
        {mal[resultado]}
      </p>
    );
  }
  return null;
}

/**
 * «¿VENÍS CON ALGUIEN?» Plegado: la mayoría no trae a nadie, y la lista de
 * quién viene es lo que hay que contestar. Sale abierto si lo escrito no se
 * pudo apuntar, con el porqué en el propio campo.
 *
 * Va dentro del mismo formulario y no en uno aparte: así, apuntar a alguien
 * guarda también lo ya marcado arriba. Su botón es otro destino del mismo
 * envío (`direccion=acompanante`).
 */
function VenisConAlguien({
  plazasLibres,
  acompanante,
}: {
  plazasLibres: number;
  acompanante?: string;
}) {
  const errorNombre =
    acompanante === "nombre"
      ? t("rsvp.acompananteNombreCorto")
      : acompanante === "largo"
        ? t("rsvp.demasiadoLargo")
        : undefined;
  return (
    <details
      id={ANCLA_ACOMPANANTE}
      open={Boolean(errorNombre)}
      className="group/acompanante scroll-mt-cabecera rounded-tarjeta border border-borde p-interno"
    >
      <summary className="flex min-h-control cursor-pointer list-none items-center justify-between gap-interno">
        <span className="grid gap-linea">
          <span className="font-titulo text-titulo-3 text-tinta">
            {t("rsvp.acompananteTitulo")}
          </span>
          <span className="text-pequeno text-tinta-suave">
            {plazasLibres === 1
              ? t("rsvp.acompananteHuecoUno")
              : t("rsvp.acompananteHuecos", { cuantos: plazasLibres })}
          </span>
        </span>
        <SignoAbrir grupo="acompanante" />
      </summary>
      <div className="mt-interno grid gap-interno">
        <CampoTexto
          etiqueta={t("rsvp.acompananteNombre")}
          name="acompanante-nombre"
          autoComplete="off"
          minLength={LONGITUD_MINIMA_NOMBRE}
          maxLength={LARGOS_DE_CAMPO["invitados.nombre"]}
          error={errorNombre}
        />
        <CampoTexto
          etiqueta={t("rsvp.acompananteApellidos")}
          name="acompanante-apellidos"
          autoComplete="off"
          maxLength={LARGOS_DE_CAMPO["invitados.apellidos"]}
        />
        <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue">
          <input
            type="checkbox"
            name="acompanante-nino"
            className="casilla-marca transicion-color"
          />
          <span className="text-cuerpo text-tinta">{t("rsvp.acompananteNino")}</span>
        </label>
        <Cuerpo className="text-pequeno text-tinta-suave">
          {t("rsvp.acompananteDespues")}
        </Cuerpo>
        <div>
          <BotonEnvio
            name="direccion"
            value="acompanante"
            jerarquia="secundario"
            rotuloPendiente={t("rsvp.guardando")}
          >
            {t("rsvp.acompananteAnadir")}
          </BotonEnvio>
        </div>
      </div>
    </details>
  );
}

/** El menú, las alergias, el autobús y la preboda de cada persona que viene. */
function PasoDetalles({
  personas,
  borrador,
  etiquetaPaso,
  preboda,
}: {
  personas: PersonaInvitada[];
  borrador: Borrador;
  etiquetaPaso: string;
  preboda: Date | null;
}) {
  const vienen = personas.filter((p) => borrador.asistencia[p.id] === "confirmado");
  // «Viernes 25 de junio»: debajo del rótulo, en pequeño, como un dato.
  const diaPreboda = preboda ? fechaConDia(preboda) : null;
  return (
    <div className="grid gap-elemento">
      {/* Dice que aquí se preguntó: sin él, una casilla sin marcar no viaja. */}
      {diaPreboda ? <input type="hidden" name={CAMPO_PREGUNTA_PREBODA} value="1" /> : null}
      <div>
        <Etiqueta>{etiquetaPaso}</Etiqueta>
        <Titulo2 como="h3" className="mt-linea">
          {t("rsvp.pasoDetallesTitulo")}
        </Titulo2>
        <Cuerpo className="mt-linea">{t("rsvp.pasoDetallesAyuda")}</Cuerpo>
      </div>
      {vienen.map((persona) => (
        <fieldset
          key={persona.id}
          className="grid gap-interno rounded-tarjeta border border-borde p-interno"
        >
          <legend className="px-linea font-titulo text-titulo-3">
            {nombreCompleto(persona)}
          </legend>
          <CampoSeleccion
            etiqueta={t("rsvp.menuEtiqueta")}
            name={`menu-${persona.id}`}
            defaultValue={borrador.menu[persona.id] ?? persona.tipoMenu}
          >
            {/*
              El infantil sólo a quien está marcado como niño: para un adulto
              la base lo descarta y deja `estandar`, así que ofrecerlo era
              prometer un menú que no se iba a servir.
            */}
            {MENUS_RSVP.filter((menu) => menu !== MENU_SOLO_NINOS || persona.esNino).map(
              (menu) => (
                <option key={menu} value={menu}>
                  {t(`rsvp.menus.${menu}`)}
                </option>
              ),
            )}
          </CampoSeleccion>
          <CampoTexto
            etiqueta={t("rsvp.alergias")}
            ayuda={t("rsvp.alergiasAyuda")}
            name={`alergias-${persona.id}`}
            maxLength={LARGOS_DE_CAMPO["invitados.alergias"]}
            defaultValue={borrador.alergias[persona.id] ?? persona.alergias ?? ""}
          />
          {/*
            EL TRAYECTO Y NO UN SÍ/NO: lo que se contrata son plazas de ida y
            plazas de vuelta, y no son las mismas —quien duerme en la finca no
            vuelve—. Un desplegable, como el menú: cuatro casillas por persona
            alargaban el paso hasta perderlo de vista.
          */}
          <CampoSeleccion
            etiqueta={t("rsvp.autobus")}
            name={`autobus-${persona.id}`}
            defaultValue={borrador.autobus[persona.id] ?? "ninguno"}
          >
            {TRAYECTOS_AUTOBUS.map((trayecto) => (
              <option key={trayecto} value={trayecto}>
                {t(`rsvp.trayectos.${trayecto}`)}
              </option>
            ))}
          </CampoSeleccion>
          {diaPreboda ? (
            <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue">
              <input
                type="checkbox"
                name={`preboda-${persona.id}`}
                defaultChecked={Boolean(borrador.preboda[persona.id])}
                className="casilla-marca transicion-color"
              />
              {/*
                EL DÍA VA DEBAJO, NO DETRÁS. En una línea, a 390 px se partía
                por el punto medio y el día quedaba colgando en el renglón de
                abajo; así cada cosa tiene su renglón y se lee de un vistazo.
              */}
              <span className="py-interno-compacto">
                <span className="block text-cuerpo text-tinta">{t("rsvp.prebodaPersona")}</span>
                <span className="block text-pequeno text-tinta-suave">{diaPreboda}</span>
              </span>
            </label>
          ) : null}
        </fieldset>
      ))}
    </div>
  );
}

/** Lo que se ha contestado, y el botón para cambiarlo mientras haya plazo. */
function RespuestaEnviada({
  personas,
  cerrado,
  correo,
}: {
  personas: PersonaInvitada[];
  cerrado: boolean;
  correo: string | null;
}) {
  const vienen = personas.filter((p) => p.estado === "confirmado");
  const noVienen = personas.filter((p) => p.estado === "rechazado");
  const aLaPreboda = vienen.filter((p) => p.asistePreboda);
  const alguienViene = vienen.length > 0;
  const respondido = personas.find((p) => p.respondidoEn)?.respondidoEn ?? null;

  return (
    <div className="text-center" role="status">
      <Titulo2 como="p">{alguienViene ? t("rsvp.graciasSi") : t("rsvp.graciasNo")}</Titulo2>
      <Cuerpo className="mx-auto mt-pila max-w-texto">
        {alguienViene ? t("rsvp.graciasSiTexto") : t("rsvp.graciasNoTexto")}
      </Cuerpo>

      <dl className="mx-auto mt-elemento grid w-fit max-w-texto gap-pila text-left">
        {vienen.length > 0 ? (
          <div>
            <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
              {t("rsvp.resumenVienen")}
            </dt>
            <dd className="mt-linea text-cuerpo text-tinta">
              {vienen.map(nombreCompleto).join(", ")}
            </dd>
          </div>
        ) : null}
        {aLaPreboda.length > 0 ? (
          <div>
            <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
              {t("rsvp.resumenPreboda")}
            </dt>
            <dd className="mt-linea text-cuerpo text-tinta">
              {aLaPreboda.map(nombreCompleto).join(", ")}
            </dd>
          </div>
        ) : null}
        {noVienen.length > 0 ? (
          <div>
            <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
              {t("rsvp.resumenNoVienen")}
            </dt>
            <dd className="mt-linea text-cuerpo text-tinta">
              {noVienen.map(nombreCompleto).join(", ")}
            </dd>
          </div>
        ) : null}
      </dl>

      {respondido ? (
        <p className="mt-elemento text-pequeno text-tinta-suave">
          {t("rsvp.respuestaGuardada", { fecha: formatoFechaHora.format(respondido) })}
        </p>
      ) : null}

      {/*
        Cambiar la respuesta sólo mientras haya plazo; pasado, se dice por qué
        no está el botón, en vez de que desaparezca sin explicación.
      */}
      {cerrado ? (
        <>
          <Cuerpo className="mx-auto mt-elemento max-w-texto text-pequeno">
            {t("rsvp.plazoCerradoTexto")}
          </Cuerpo>
          <LineaContacto correo={correo} texto={t("rsvp.plazoCerradoContacto")} />
        </>
      ) : (
        <form action={reabrir} className="mt-elemento flex justify-center">
          <BotonEnvio jerarquia="secundario">{t("rsvp.editarRespuesta")}</BotonEnvio>
        </form>
      )}
    </div>
  );
}
