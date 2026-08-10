import type { Metadata } from "next";

import { EnPreparacion } from "@/components/marketing/en-preparacion";
import { Boton, BotonEnlace } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Constelacion } from "@/components/ui/constelacion";
import { Cuerpo, Etiqueta, Titulo1, Titulo3 } from "@/components/ui/tipografia";
import { CONSTELACION_NOVIOS } from "@/config/constelaciones";
import { IDIOMA, PASOS_RSVP, ZONA_HORARIA, type PasoRsvp } from "@/config/constants";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import { obtenerInvitacion, type PersonaInvitada } from "@/lib/bbdd/rsvp";
import { t } from "@/lib/copy";
import { leerBorrador, type Borrador } from "@/lib/rsvp-borrador";

import { avanzar, reabrir } from "./acciones";

/**
 * CONFIRMACIÓN DE ASISTENCIA
 *
 * La pantalla más importante del proyecto. La abre gente mayor desde un móvil
 * prestado, una sola vez, y si se atasca la respuesta se pierde para siempre.
 * Todo lo que hay aquí sale de ahí:
 *
 * FUNCIONA SIN JAVASCRIPT. Tres formularios de servidor, un `POST` por paso.
 * No hay estado en el navegador que se pueda quedar a medias, ni un botón que
 * no responda porque un bundle no cargó. Es el camino que no se puede permitir
 * fallar, así que no depende de nada que pueda no llegar.
 *
 * UN PASO POR PREGUNTA. Quién viene, qué come, y si quieren decirnos algo. Lo
 * escrito sobrevive al «atrás» y a cerrar la pestaña porque vive en una cookie
 * de servidor, no en la página.
 *
 * NO SE CACHEA. Cada invitación es distinta y la respuesta cambia en cuanto se
 * envía: servir esto desde caché sería enseñarle a alguien la invitación de
 * otro, que es el peor fallo imaginable en esta pantalla.
 */
export const dynamic = "force-dynamic";

/**
 * Ni se indexa ni se comparte. El token va en la URL: una vista previa de
 * WhatsApp con el nombre del grupo, o una línea en un buscador, es una fuga.
 */
export const metadata: Metadata = {
  title: t("rsvp.titulo"),
  robots: { index: false, follow: false, nocache: true },
};

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

const formatoFechaHora = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_HORARIA,
});

const MENUS = ["estandar", "vegetariano", "vegano", "infantil", "sin_gluten", "otro"] as const;

interface Parametros {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : undefined;

export default async function PaginaRsvp({ params, searchParams }: Parametros) {
  const { token } = await params;
  const consulta = await searchParams;

  let invitacion;
  let configuracion;
  try {
    [invitacion, configuracion] = await Promise.all([
      obtenerInvitacion(token),
      obtenerConfiguracion(),
    ]);
  } catch {
    // La base no responde. Es una avería, no un enlace malo, y decirle a
    // alguien que su invitación no vale cuando sí vale es la peor manera de
    // perder una confirmación.
    return <EnPreparacion />;
  }

  // Cero filas es el contrato de la base para «este enlace no vale». No se
  // dice nada más: ni si el token existió, ni de quién era.
  if (!invitacion) return <EnlaceNoValido correo={configuracion?.correoContacto ?? null} />;

  const plazoCerrado = Boolean(
    configuracion?.fechaLimiteRsvp && configuracion.fechaLimiteRsvp < new Date(),
  );

  const yaRespondido = invitacion.personas.every(
    (persona) => persona.estado === "confirmado" || persona.estado === "rechazado",
  );

  if (consulta.enviado === "1" || (yaRespondido && !consulta.paso)) {
    return (
      <Marco>
        <RespuestaEnviada
          personas={invitacion.personas}
          token={token}
          cerrado={plazoCerrado}
          correo={configuracion?.correoContacto ?? null}
        />
      </Marco>
    );
  }

  // El plazo lo aplica la base con un trigger; aquí sólo se evita enseñar un
  // formulario que ya no puede guardar nada.
  if (plazoCerrado) {
    return (
      <Marco>
        <Titulo1 className="text-center">{t("rsvp.titulo")}</Titulo1>
        <Cuerpo className="mt-elemento text-center">{t("rsvp.plazoCerrado")}</Cuerpo>
        <LineaContacto
          correo={configuracion?.correoContacto ?? null}
          texto={t("rsvp.plazoCerradoContacto")}
        />
      </Marco>
    );
  }

  const borrador = await leerBorrador(token);
  const alguienViene = invitacion.personas.some(
    (persona) => borrador.asistencia[persona.id] === "confirmado",
  );

  const pedido = soloTexto(consulta.paso);
  const paso: PasoRsvp =
    pedido === "detalles" && alguienViene
      ? "detalles"
      : pedido === "mensaje"
        ? "mensaje"
        : "asistencia";

  // El paso de detalles no existe si no viene nadie, así que hasta que no
  // contesten no se sabe cuántos pasos hay. En el primero no se enseña
  // contador: poner «1 de 2» y que luego se convierta en «2 de 3» al decir que
  // sí es peor que no poner nada — un total que cambia solo hace dudar de si se
  // ha hecho algo mal.
  const total = alguienViene ? PASOS_RSVP.length : PASOS_RSVP.length - 1;
  const actual = paso === "detalles" ? 2 : total;

  return (
    <Marco>
      <header className="text-center">
        {paso === "asistencia" ? null : (
          <Etiqueta>{t("rsvp.etiquetaPaso", { actual, total })}</Etiqueta>
        )}
        <Titulo1 className={paso === "asistencia" ? "" : "mt-pila"}>
          {t("rsvp.saludo", { grupo: invitacion.grupoNombre })}
        </Titulo1>
        <Cuerpo className="mx-auto mt-pila max-w-texto">
          {configuracion?.fechaLimiteRsvp
            ? t("rsvp.entradilla", {
                fecha: formatoFecha.format(configuracion.fechaLimiteRsvp),
              })
            : t("rsvp.entradillaSinPlazo")}
        </Cuerpo>
      </header>

      {consulta.fallo ? <Aviso motivo={soloTexto(consulta.fallo)} /> : null}

      <form action={avanzar} className="mt-bloque grid gap-elemento">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="paso" value={paso} />

        {paso === "asistencia" ? (
          <PasoAsistencia
            personas={invitacion.personas}
            borrador={borrador}
            faltaId={soloTexto(consulta.falta)}
          />
        ) : null}

        {paso === "detalles" ? (
          <PasoDetalles personas={invitacion.personas} borrador={borrador} />
        ) : null}

        {paso === "mensaje" ? <PasoMensaje borrador={borrador} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-interno">
          {paso === "asistencia" ? (
            <span />
          ) : (
            <Boton type="submit" name="direccion" value="atras" jerarquia="terciario">
              {t("rsvp.atras")}
            </Boton>
          )}
          <Boton type="submit" name="direccion" value="siguiente">
            {paso === "mensaje" ? t("rsvp.enviar") : t("rsvp.siguiente")}
          </Boton>
        </div>
      </form>
    </Marco>
  );
}

/* ------------------------------------------------------------------------ */

/** Marco común: fondo marino, ancho de lectura y la constelación de la marca. */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-seccion="inversa"
      className="grid min-h-dvh place-items-center px-interno py-seccion-fluida"
    >
      <div className="mx-auto w-full max-w-estrecho">
        <div className="mx-auto mb-elemento hidden size-constelacion pantalla-alta:block">
          <Constelacion clave={CONSTELACION_NOVIOS} />
        </div>
        {children}
      </div>
    </main>
  );
}

/**
 * CASO DE ERROR. No filtra nada: ni si el token existió alguna vez, ni de
 * quién era, ni cuántas personas tenía. Sólo dice que no vale y a quién
 * escribir.
 */
function EnlaceNoValido({ correo }: { correo: string | null }) {
  return (
    <Marco>
      <Titulo1 className="text-center">{t("rsvp.titulo")}</Titulo1>
      <Cuerpo className="mx-auto mt-elemento max-w-texto text-center">
        {t("rsvp.tokenInvalido")}
      </Cuerpo>

      {/*
        A QUIÉN ESCRIBIR, que es lo único útil que se le puede dar a quien
        llega aquí. «Escribidnos» sin una dirección deja a alguien mirando una
        pantalla que no le resuelve nada.

        El correo sale de la configuración y es el mismo que ya está en el pie
        de la web pública, así que enseñarlo no cuenta nada que no se supiera.
        Lo que NO cambia es el resto: el mensaje es idéntico exista el token o
        no, y esta línea también, porque no depende del token.
      */}
      <LineaContacto correo={correo} texto={t("rsvp.enlacePerdido")} />

      <div className="mt-elemento flex justify-center">
        <BotonEnlace href="/" jerarquia="secundario">
          {t("saveTheDate.verLaWeb")}
        </BotonEnlace>
      </div>
    </Marco>
  );
}

/**
 * LA DIRECCIÓN A LA QUE ESCRIBIR.
 *
 * Sin correo configurado no se pinta nada: mejor una frase de menos que un
 * «escribidnos a» seguido de un hueco. Es el mismo patrón que usa el pie de la
 * landing, y el mismo correo.
 */
function LineaContacto({ correo, texto }: { correo: string | null; texto: string }) {
  if (!correo) return null;

  return (
    <p className="mx-auto mt-elemento max-w-texto text-center text-pequeno text-tinta-suave">
      {texto}{" "}
      <a
        href={`mailto:${correo}`}
        className="border-b border-borde-fuerte transicion-color hover:text-acento"
      >
        {correo}
      </a>
    </p>
  );
}

function Aviso({ motivo }: { motivo: string | undefined }) {
  const texto =
    motivo === "plazo"
      ? t("rsvp.plazoCerrado")
      : motivo === "enlace"
        ? t("rsvp.tokenInvalido")
        : motivo === "respuestas"
          ? t("rsvp.errorCaducado")
          : t("rsvp.errorEnviando");

  return (
    <p
      role="alert"
      className="mt-elemento rounded-campo bg-error-fondo p-interno text-error-tinta"
    >
      {texto}
    </p>
  );
}

const nombreCompleto = (persona: PersonaInvitada) =>
  [persona.nombre, persona.apellidos].filter(Boolean).join(" ");

/**
 * PASO 1 · Quién viene.
 *
 * Radios y no un desplegable: en un móvil, dos botones grandes se aciertan a la
 * primera y un `<select>` obliga a abrir una lista y elegir a ciegas. Van sin
 * `required` porque la comprobación de verdad la hace el servidor —el paso no
 * avanza si falta alguien— y `required` sin JavaScript en según qué navegador
 * deja el formulario mudo, sin decir a quién le falta.
 */
function PasoAsistencia({
  personas,
  borrador,
  faltaId,
}: {
  personas: PersonaInvitada[];
  borrador: Borrador;
  faltaId: string | undefined;
}) {
  return (
    /*
      Sin `fieldset` envolviéndolo todo. Lo llevaba, con un `legend` en
      `sr-only` que repetía palabra por palabra el titular de al lado: quien
      escucha la página oía «¿Quién puede venir?» dos veces seguidas antes de
      llegar a ningún nombre. Los radios de cada persona sí van en su propio
      `fieldset` —eso es lo que ata las dos opciones a un nombre— y el titular
      hace de rótulo del paso sin necesidad de duplicarse.
    */
    <div className="grid gap-elemento">
      <div>
        <Titulo3 como="h2">{t("rsvp.pasoAsistenciaTitulo")}</Titulo3>
        <Cuerpo className="mt-linea">{t("rsvp.pasoAsistenciaAyuda")}</Cuerpo>
      </div>

      {personas.map((persona) => {
        const elegido = borrador.asistencia[persona.id];
        const falta = faltaId === persona.id;
        return (
          <fieldset
            key={persona.id}
            className={`grid gap-interno rounded-tarjeta border p-interno ${
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
                  className="size-casilla accent-marca"
                />
                <span className="text-cuerpo text-tinta">{rotulo}</span>
              </label>
            ))}

            {falta ? (
              <span role="alert" className="text-pequeno text-error">
                {t("rsvp.errorSinRespuesta", { nombre: persona.nombre })}
              </span>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
}

/** PASO 2 · Qué come cada quien. Sólo para quienes vienen. */
function PasoDetalles({
  personas,
  borrador,
}: {
  personas: PersonaInvitada[];
  borrador: Borrador;
}) {
  const vienen = personas.filter((p) => borrador.asistencia[p.id] === "confirmado");

  return (
    <div className="grid gap-elemento">
      <div>
        <Titulo3 como="h2">{t("rsvp.pasoDetallesTitulo")}</Titulo3>
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
            {MENUS.map((menu) => (
              <option key={menu} value={menu}>
                {t(`rsvp.menus.${menu}`)}
              </option>
            ))}
          </CampoSeleccion>

          <CampoTexto
            etiqueta={t("rsvp.alergias")}
            ayuda={t("rsvp.alergiasAyuda")}
            name={`alergias-${persona.id}`}
            defaultValue={borrador.alergias[persona.id] ?? persona.alergias ?? ""}
          />

          <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue">
            <input
              type="checkbox"
              name={`autobus-${persona.id}`}
              defaultChecked={Boolean(borrador.autobus[persona.id])}
              className="size-casilla accent-marca"
            />
            <span className="text-cuerpo text-tinta">{t("rsvp.autobusPersona")}</span>
          </label>
        </fieldset>
      ))}
    </div>
  );
}

/** PASO 3 · Lo que quieran contarnos. Los dos campos son opcionales. */
function PasoMensaje({ borrador }: { borrador: Borrador }) {
  return (
    <div className="grid gap-elemento">
      <div>
        <Titulo3 como="h2">{t("rsvp.pasoMensajeTitulo")}</Titulo3>
        <Cuerpo className="mt-linea">{t("rsvp.pasoMensajeAyuda")}</Cuerpo>
      </div>

      <CampoTexto
        etiqueta={t("rsvp.cancion")}
        ayuda={t("rsvp.cancionAyuda")}
        name="cancion"
        defaultValue={borrador.cancion}
      />
      <CampoTextoLargo
        etiqueta={t("rsvp.mensaje")}
        ayuda={t("rsvp.mensajeAyuda")}
        name="mensaje"
        rows={4}
        defaultValue={borrador.mensaje}
      />
    </div>
  );
}

/**
 * La pantalla que deja claro que la respuesta ha llegado.
 *
 * Enseña lo que quedó guardado, persona a persona. Un «gracias» sin más deja a
 * quien responde sin saber si marcó bien a su suegra, y por ahí es por donde
 * vuelven a entrar a responder otra vez.
 */
function RespuestaEnviada({
  personas,
  token,
  cerrado,
  correo,
}: {
  personas: PersonaInvitada[];
  token: string;
  cerrado: boolean;
  correo: string | null;
}) {
  const vienen = personas.filter((p) => p.estado === "confirmado");
  const noVienen = personas.filter((p) => p.estado === "rechazado");
  const alguienViene = vienen.length > 0;
  const respondido = personas.find((p) => p.respondidoEn)?.respondidoEn ?? null;

  return (
    <div className="text-center">
      <Titulo1>{alguienViene ? t("rsvp.graciasSi") : t("rsvp.graciasNo")}</Titulo1>
      <Cuerpo className="mx-auto mt-elemento max-w-texto">
        {alguienViene ? t("rsvp.graciasSiTexto") : t("rsvp.graciasNoTexto")}
      </Cuerpo>

      <dl className="mx-auto mt-bloque grid max-w-texto gap-pila text-left">
        {vienen.length > 0 ? (
          <div>
            <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
              {t("rsvp.resumenVienen")}
            </dt>
            <dd className="mt-linea text-cuerpo text-tinta">
              {vienen.map(nombreCompleto).join(", ")}
            </dd>
          </div>
        ) : null}

        {noVienen.length > 0 ? (
          <div>
            <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
              {t("rsvp.resumenNoVienen")}
            </dt>
            <dd className="mt-linea text-cuerpo text-tinta">
              {noVienen.map(nombreCompleto).join(", ")}
            </dd>
          </div>
        ) : null}
      </dl>

      {respondido ? (
        <p className="mt-elemento text-pequeno text-tinta-tenue">
          {t("rsvp.respuestaGuardada", { fecha: formatoFechaHora.format(respondido) })}
        </p>
      ) : null}

      {/*
        Y si el plazo ya se ha cerrado, se dice por qué no está el botón de
        cambiar la respuesta. Un botón que desaparece sin explicación se lee
        como una avería, y el siguiente paso de quien lo ve es un WhatsApp
        preguntando qué ha pasado — que es justo lo que este ticket evita.
      */}
      {cerrado ? (
        <>
          <Cuerpo className="mx-auto mt-elemento max-w-texto text-pequeno">
            {t("rsvp.plazoCerrado")}
          </Cuerpo>
          <LineaContacto correo={correo} texto={t("rsvp.plazoCerradoContacto")} />
        </>
      ) : null}

      <div className="mt-elemento flex flex-wrap justify-center gap-interno">
        {/*
          Cambiar la respuesta sólo mientras haya plazo. Pasada la fecha el
          botón no aparece, en lugar de llevar a un formulario que la base va a
          rechazar de todas formas.
        */}
        {cerrado ? null : (
          <form action={reabrir}>
            <input type="hidden" name="token" value={token} />
            <Boton type="submit" jerarquia="secundario">
              {t("rsvp.editarRespuesta")}
            </Boton>
          </form>
        )}
        <BotonEnlace href="/" jerarquia="terciario">
          {t("saveTheDate.verLaWeb")}
        </BotonEnlace>
      </div>
    </div>
  );
}
