import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  LARGOS_DE_CAMPO,
  MAXIMO_ACOMPANANTES,
  MENUS_RSVP,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_RSVP,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerGrupo, type DetalleGrupo, type PersonaDelGrupo } from "@/lib/bbdd/invitados";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { urlDelSitio } from "@/lib/url-sitio";

import {
  anadirPersona,
  apuntarRespuesta,
  borrarInvitacion,
  editarInvitacion,
  editarPersona,
  emitirEnlace,
  quitarPersona,
  repartirPorWhatsApp,
} from "../acciones";
import { AvisoEstado } from "../aviso";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.modulos.invitados") };

/**
 * BODA-51/52 · UNA INVITACIÓN
 *
 * Quién va dentro y cuál es su enlace.
 *
 * EL ENLACE SE ENSEÑA UNA SOLA VEZ, y no por prudencia excesiva: la base
 * guarda la **huella** del token, no el token. Nadie —ni el panel, ni quien
 * tenga la contraseña de Supabase— puede volver a leerlo. Si se pierde, se
 * emite otro y el anterior deja de valer en el acto, que es también lo que se
 * hace si un enlace acaba donde no debía.
 *
 * Por eso el token llega en la URL de vuelta de la acción y se pinta aquí sin
 * guardarse en ninguna parte.
 */
export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

interface Parametros {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

const ROTULO_ESTADO: Record<string, string> = {
  confirmado: "rsvp.vieneSi",
  rechazado: "rsvp.vieneNo",
};

export default async function PaginaInvitacion({ params, searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const { id } = await params;
  const consulta = await searchParams;

  const grupo = await obtenerGrupo(id);
  if (!grupo) notFound();

  const puedeEditar = acceso.rol !== "lector";
  const token = soloTexto(consulta.token);

  /*
    El enlace absoluto, para poder pegarlo en WhatsApp. `urlDelSitio()` puede
    devolver `undefined` si nadie ha configurado el dominio todavía: en ese caso
    se enseña la ruta relativa en lugar de un enlace con «undefined» pegado
    delante, que es lo que saldría al interpolarlo sin mirar.
  */
  const sitio = urlDelSitio();
  const enlace = token
    ? `${sitio ? sitio.origin : ""}${RUTA_RSVP}/${encodeURIComponent(token)}`
    : null;

  return (
    <>
      {/* Con su alto de control: un enlace suelto se toca con el pulgar. */}
      <EnlaceSuave href={RUTA_INVITADOS} discreto>
        {t("panel.invitados.volver")}
      </EnlaceSuave>

      <header className="mt-pila max-w-texto">
        <Titulo2 como="h1">{grupo.nombre}</Titulo2>
        <Cuerpo className="mt-pila">
          {t(`panel.invitados.lados.${grupo.lado}` as "panel.invitados.lados.ambos")}
          {" · "}
          {t("panel.invitados.resumenEstado", {
            confirmados: grupo.confirmados,
            rechazados: grupo.rechazados,
            pendientes: grupo.pendientes,
          })}
          {" · "}
          {/* El cupo no salía en ninguna parte: ni aquí ni en la lista. */}
          {grupo.maximoAcompanantes === 0
            ? t("panel.invitados.sinAcompanantes")
            : grupo.maximoAcompanantes === 1
              ? t("panel.invitados.puedeTraerUno")
              : t("panel.invitados.puedeTraer", { cuantos: grupo.maximoAcompanantes })}
        </Cuerpo>
      </header>

      <AvisoEstado estado={soloTexto(consulta.estado)} />

      {/*
        CORREGIR Y BORRAR LA INVITACIÓN, plegados: son lo excepcional. Sin
        ellos, una errata en el nombre que lee la familia se quedaba para
        siempre y una invitación creada dos veces sólo se quitaba con SQL.
        Borrar sólo se ofrece si nadie ha contestado.
      */}
      {puedeEditar ? (
        <div className="mt-pila flex flex-wrap items-start gap-x-elemento">
          <CorregirInvitacion grupo={grupo} token={token} />
          {grupo.confirmados + grupo.rechazados === 0 ? (
            <BorrarInvitacion grupoId={grupo.id} />
          ) : null}
        </div>
      ) : null}

      {/*
        El enlace en claro, si la acción que acaba de correr lo ha devuelto.
        Se pinta en un campo de sólo lectura y no como texto suelto: así se
        selecciona entero de una pasada, que es lo que hace falta para pegarlo
        en WhatsApp desde un móvil.
      */}
      {enlace ? (
        <section className="mt-elemento rounded-tarjeta border border-borde-marca bg-superficie-tenue p-interno">
          <Titulo3 como="h2" className="text-titulo-3">
            {t("panel.invitados.enlaceTitulo", { grupo: grupo.nombre })}
          </Titulo3>
          <Cuerpo className="mt-linea text-pequeno">{t("panel.invitados.enlaceAviso")}</Cuerpo>
          <input
            readOnly
            value={enlace}
            aria-label={t("panel.invitados.copiarEnlace")}
            className="mt-pila min-h-campo w-full rounded-campo border border-borde bg-superficie px-interno font-codigo text-pequeno text-tinta"
          />

          {/*
            SIN NADIE DENTRO NO SE MANDA. El aviso de «invitación vacía» estaba
            más abajo, junto a la lista de personas; aquí arriba seguía el botón
            de WhatsApp, y es aquí donde se pulsa. Un enlace de un grupo sin
            personas abre «este enlace no es válido», así que se avisa en el
            sitio y el botón no aparece hasta que haya a quién invitar.
          */}
          {grupo.gente.length === 0 ? (
            <p
              role="status"
              className="mt-pila rounded-campo bg-aviso-fondo p-interno text-pequeno text-aviso-tinta"
            >
              {t("panel.invitados.avisoSinPersonas")}
            </p>
          ) : null}

          {/*
            BODA-110 · Y desde aquí mismo se manda.

            Va DENTRO del bloque del enlace, y no en una sección aparte, porque
            depende de lo mismo: el token en claro sólo existe en esta pantalla
            y sólo ahora. Ponerlo abajo, separado, invitaría a pulsarlo cuando
            ya no hay enlace que mandar.

            El texto es un `<textarea>` y no una cadena fija: el mensaje que se
            le manda a una tía abuela no es el que se le manda a un amigo, y
            retocarlo antes de enviar es el criterio del ticket. Funciona sin
            JavaScript — es un formulario que va a una acción de servidor y de
            ahí a WhatsApp.
          */}
          {puedeEditar && grupo.gente.length > 0 ? (
            <form action={repartirPorWhatsApp} className="mt-elemento grid gap-interno">
              <input type="hidden" name="grupo_id" value={grupo.id} />
              {grupo.invitacionEnviadaEn ? (
                <input type="hidden" name="recordatorio" value="1" />
              ) : null}

              <div className="grid gap-interno-compacto">
                <label
                  htmlFor="mensaje-whatsapp"
                  className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
                >
                  {t("panel.invitados.repartirMensaje")}
                </label>
                <textarea
                  id="mensaje-whatsapp"
                  name="mensaje"
                  rows={3}
                  required
                  defaultValue={t("panel.invitados.repartirPlantilla", { enlace })}
                  className="w-full rounded-campo border border-borde bg-superficie p-interno text-pequeno text-tinta"
                />
                <p className="text-pequeno text-tinta-suave">
                  {t("panel.invitados.repartirAyuda")}
                </p>
              </div>

              <div>
                <BotonEnvio>{t("panel.invitados.repartirBoton")}</BotonEnvio>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {/*
        Y si no hay enlace en claro, se dice por qué no se puede mandar. Un
        hueco donde debería estar el botón se lee como una avería.
      */}
      {!enlace && puedeEditar ? (
        <section className="mt-elemento max-w-texto">
          <Titulo3 como="h2">{t("panel.invitados.repartirTitulo")}</Titulo3>
          <Cuerpo className="mt-pila text-pequeno text-tinta-suave">
            {grupo.invitacionEnviadaEn
              ? t("panel.invitados.repartirEnviadaEn", {
                  fecha: formatoFecha.format(grupo.invitacionEnviadaEn),
                })
              : t("panel.invitados.repartirNunca")}
            {grupo.recordatorioEnviadoEn
              ? ` ${t("panel.invitados.repartirRecordadaEn", {
                  fecha: formatoFecha.format(grupo.recordatorioEnviadoEn),
                })}`
              : ""}
          </Cuerpo>
          <Cuerpo className="mt-pila text-pequeno text-tinta-suave">
            {grupo.invitacionEnviadaEn
              ? t("panel.invitados.repartirYaMandada")
              : t("panel.invitados.repartirSoloConEnlace")}
          </Cuerpo>
        </section>
      ) : null}

      {/*
        EL ENLACE, JUSTO DEBAJO DE «MANDAR LA INVITACIÓN», que es el texto que
        manda emitirlo. Estaba al final de la página: en el móvil, con cuatro
        personas, a 1600 px de la frase que decía que se pulsara.
      */}
      {puedeEditar ? (
        <section className="mt-elemento max-w-texto">
          <Titulo3 como="h2">{t("panel.invitados.columnaEnlace")}</Titulo3>
          <Cuerpo className="mt-pila text-pequeno">
            {grupo.tokenEmitidoEn
              ? t("panel.invitados.enlaceEmitidoEn", {
                  fecha: formatoFecha.format(grupo.tokenEmitidoEn),
                })
              : t("panel.invitados.enlaceNunca")}
          </Cuerpo>
          <form action={emitirEnlace} className="mt-pila grid gap-interno">
            <input type="hidden" name="grupo_id" value={grupo.id} />
            {/*
              SI YA SE MANDÓ, ANULAR EL QUE TIENEN SE CONFIRMA. Un toque de más
              dejaba muerto el enlace del WhatsApp de la familia sin avisar, y
              la lista seguía diciendo «mandada».
            */}
            {grupo.invitacionEnviadaEn ? (
              <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue">
                <input
                  type="checkbox"
                  name="confirmo_anular"
                  required
                  className="casilla-marca transicion-color"
                />
                <span className="text-pequeno text-tinta">
                  {t("panel.invitados.emitirConfirmar")}
                </span>
              </label>
            ) : null}
            <div>
              <BotonEnvio jerarquia="secundario">
                {t("panel.invitados.emitirEnlace")}
              </BotonEnvio>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-bloque">
        <Titulo3 como="h2">{t("panel.invitados.personasTitulo")}</Titulo3>

        {/*
          UNA INVITACIÓN VACÍA TIENE UN ENLACE QUE NO FUNCIONA, y conviene
          decirlo antes de que lo descubra el invitado. El aviso vive ARRIBA,
          junto al enlace y al botón de WhatsApp, que es donde se pulsa; aquí,
          sin nadie dentro, sólo queda el formulario para añadir a la primera
          persona. Durante un tiempo estuvo en los dos sitios, y leer el mismo
          aviso dos veces en una pantalla se parece más a un fallo de la web
          que a un consejo.

          `obtener_invitacion()` devuelve una fila POR PERSONA: sin nadie
          dentro devuelve cero filas, y cero filas es exactamente el contrato
          que la base usa para «este enlace no vale». Desde fuera son
          indistinguibles, así que quien abriera el enlace de un grupo vacío
          leería que su invitación no es válida — y a nadie se le ocurriría
          que lo que falta es meter a la gente.
        */}
        {grupo.gente.length > 0 ? (
          <ul className="mt-pila grid gap-interno-compacto">
            {grupo.gente.map((persona) => (
              <li
                key={persona.id}
                className="rounded-campo border border-borde px-interno py-pila"
              >
                <Persona persona={persona} />
                {puedeEditar ? (
                  <div className="flex flex-wrap items-start gap-x-elemento">
                    <EditarPersona grupoId={grupo.id} persona={persona} token={token} />
                    <ApuntarRespuesta grupoId={grupo.id} persona={persona} token={token} />
                    {persona.estado === "pendiente" ? (
                      <QuitarPersona grupoId={grupo.id} persona={persona} token={token} />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {puedeEditar ? (
          <form
            action={anadirPersona}
            aria-labelledby="anadir-persona"
            className="mt-elemento grid max-w-texto gap-interno"
          >
            {/*
              EL ALTA LLEVA SU RÓTULO. Los campos salían justo debajo de la
              última persona, sin nada encima: «Nombre», vacío, bajo «Pilar
              Peña» se leía como un campo de Pilar y no como alguien nuevo.
            */}
            <Etiqueta id="anadir-persona" como="h3" className="block">
              {t("panel.invitados.anadirPersonaTitulo")}
            </Etiqueta>
            <input type="hidden" name="grupo_id" value={grupo.id} />
            {token ? <input type="hidden" name="token" value={token} /> : null}
            <CamposPersona />
            <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue">
              <input
                type="checkbox"
                name="es_nino"
                className="casilla-marca transicion-color"
              />
              <span className="text-cuerpo text-tinta">{t("panel.invitados.esNino")}</span>
            </label>
            <div>
              <BotonEnvio jerarquia="secundario">
                {t("panel.invitados.anadirPersona")}
              </BotonEnvio>
            </div>
          </form>
        ) : null}
      </section>
    </>
  );
}

const CLASES_DESPLEGABLE =
  "inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-suave underline decoration-borde-fuerte underline-offset-4 transicion-color hover:text-tinta hover:decoration-borde-marca";

function CorregirInvitacion({ grupo, token }: { grupo: DetalleGrupo; token: string }) {
  return (
    <details>
      <summary className={CLASES_DESPLEGABLE}>
        {t("panel.invitados.corregirInvitacion")}
      </summary>
      <form action={editarInvitacion} className="mt-pila grid max-w-texto gap-interno">
        <input type="hidden" name="grupo_id" value={grupo.id} />
        {token ? <input type="hidden" name="token" value={token} /> : null}
        <CampoTexto
          etiqueta={t("panel.invitados.nombreGrupo")}
          name="nombre"
          required
          autoComplete="off"
          maxLength={LARGOS_DE_CAMPO["grupos_invitacion.nombre"]}
          defaultValue={grupo.nombre}
        />
        <CampoSeleccion
          etiqueta={t("panel.invitados.lado")}
          name="lado"
          defaultValue={grupo.lado}
        >
          <option value="novia">{t("panel.invitados.lados.novia")}</option>
          <option value="novio">{t("panel.invitados.lados.novio")}</option>
          <option value="ambos">{t("panel.invitados.lados.ambos")}</option>
        </CampoSeleccion>
        <CampoTexto
          etiqueta={t("panel.invitados.maximoAcompanantes")}
          ayuda={t("panel.invitados.maximoAcompanantesAyuda")}
          name="maximo_acompanantes"
          type="number"
          min={0}
          max={MAXIMO_ACOMPANANTES}
          defaultValue={grupo.maximoAcompanantes}
        />
        <div>
          <BotonEnvio jerarquia="secundario">
            {t("panel.invitados.guardarInvitacion")}
          </BotonEnvio>
        </div>
      </form>
    </details>
  );
}

function BorrarInvitacion({ grupoId }: { grupoId: string }) {
  return (
    <details>
      <summary
        className={`${CLASES_DESPLEGABLE} hover:text-error-tinta hover:decoration-error`}
      >
        {t("panel.invitados.borrarInvitacion")}
      </summary>
      <form action={borrarInvitacion} className="mt-pila grid max-w-texto gap-interno">
        <input type="hidden" name="grupo_id" value={grupoId} />
        <p className="text-pequeno text-tinta-suave">
          {t("panel.invitados.borrarInvitacionAviso")}
        </p>
        <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-error has-checked:bg-error-fondo">
          <input
            type="checkbox"
            name="confirmo_borrar"
            required
            className="casilla-marca transicion-color"
          />
          <span className="text-pequeno text-tinta">
            {t("panel.invitados.borrarInvitacionConfirmar")}
          </span>
        </label>
        <div>
          <BotonEnvio jerarquia="secundario">
            {t("panel.invitados.borrarInvitacionBoton")}
          </BotonEnvio>
        </div>
      </form>
    </details>
  );
}

/**
 * Nombre, apellidos y email, con los topes de la base. Los mismos en el alta y
 * en la corrección, para que no se separen.
 */
function CamposPersona({ persona }: { persona?: PersonaDelGrupo }) {
  return (
    <>
      <CampoTexto
        etiqueta={t("panel.invitados.nombrePersona")}
        name="nombre"
        required
        autoComplete="off"
        maxLength={LARGOS_DE_CAMPO["invitados.nombre"]}
        defaultValue={persona?.nombre}
      />
      <CampoTexto
        etiqueta={t("panel.invitados.apellidosPersona")}
        name="apellidos"
        autoComplete="off"
        maxLength={LARGOS_DE_CAMPO["invitados.apellidos"]}
        defaultValue={persona?.apellidos ?? undefined}
      />
      <CampoTexto
        etiqueta={t("panel.invitados.correoPersona")}
        ayuda={t("panel.invitados.correoPersonaAyuda")}
        name="correo_electronico"
        type="email"
        inputMode="email"
        autoComplete="off"
        defaultValue={persona?.correo ?? undefined}
      />
    </>
  );
}

/**
 * Corregir a alguien ya dado de alta: una errata en el nombre, o el email que
 * faltaba para que le llegue el acuse. Plegado, porque es lo excepcional.
 */
function EditarPersona({
  grupoId,
  persona,
  token,
}: {
  grupoId: string;
  persona: PersonaDelGrupo;
  token: string;
}) {
  const etiqueta = t("panel.invitados.editarPersonaDe", {
    persona: [persona.nombre, persona.apellidos].filter(Boolean).join(" "),
  });
  return (
    <details className="mt-interno-compacto">
      {/*
        El nombre de la persona va en la etiqueta accesible y no en un texto
        oculto: «Corregir datos» repetido en cada fila no dice de quién, y un
        texto oculto con el nombre lo haría salir dos veces al buscarlo.
      */}
      <summary
        aria-label={etiqueta}
        className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-suave underline decoration-borde-fuerte underline-offset-4 transicion-color hover:text-tinta hover:decoration-borde-marca"
      >
        {t("panel.invitados.editarPersona")}
      </summary>
      <form
        action={editarPersona}
        aria-label={etiqueta}
        className="mt-elemento grid max-w-texto gap-interno"
      >
        <input type="hidden" name="grupo_id" value={grupoId} />
        <input type="hidden" name="persona_id" value={persona.id} />
        {token ? <input type="hidden" name="token" value={token} /> : null}
        <CamposPersona persona={persona} />
        <div>
          <BotonEnvio jerarquia="secundario">{t("panel.invitados.guardarPersona")}</BotonEnvio>
        </div>
      </form>
    </details>
  );
}

/**
 * LO QUE HA CONTESTADO POR TELÉFONO, apuntado a mano. Lo que ya tiene —su
 * respuesta, su menú, sus alergias— sale puesto, para corregir sin reescribir.
 * El menú infantil sólo se ofrece a quien es menor, como en su formulario.
 */
function ApuntarRespuesta({
  grupoId,
  persona,
  token,
}: {
  grupoId: string;
  persona: PersonaDelGrupo;
  token: string;
}) {
  const nombre = [persona.nombre, persona.apellidos].filter(Boolean).join(" ");
  const menus = MENUS_RSVP.filter((menu) => menu !== "infantil" || persona.esNino);
  return (
    <details className="mt-interno-compacto">
      <summary
        aria-label={t("panel.invitados.apuntarRespuestaDe", { persona: nombre })}
        className={CLASES_DESPLEGABLE}
      >
        {t("panel.invitados.apuntarRespuesta")}
      </summary>
      <form action={apuntarRespuesta} className="mt-pila grid max-w-texto gap-interno">
        <input type="hidden" name="grupo_id" value={grupoId} />
        <input type="hidden" name="persona_id" value={persona.id} />
        {token ? <input type="hidden" name="token" value={token} /> : null}
        <p className="text-pequeno text-tinta-suave">{t("panel.invitados.apuntarAyuda")}</p>
        <fieldset className="grid gap-interno-compacto">
          <legend className="mb-interno-compacto text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
            {t("panel.invitados.apuntarViene")}
          </legend>
          {(
            [
              ["confirmado", "rsvp.vieneSi"],
              ["rechazado", "rsvp.vieneNo"],
            ] as const
          ).map(([valor, clave]) => (
            <label
              key={valor}
              className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue"
            >
              <input
                type="radio"
                name="estado"
                value={valor}
                required
                defaultChecked={persona.estado === valor}
                className="casilla-marca transicion-color"
              />
              <span className="text-cuerpo text-tinta">{t(clave)}</span>
            </label>
          ))}
        </fieldset>
        <CampoSeleccion
          etiqueta={t("rsvp.menuEtiqueta")}
          name="tipo_menu"
          defaultValue={
            menus.includes(persona.tipoMenu as (typeof menus)[number])
              ? persona.tipoMenu
              : menus[0]
          }
        >
          {menus.map((menu) => (
            <option key={menu} value={menu}>
              {t(`panel.menus.${menu}`)}
            </option>
          ))}
        </CampoSeleccion>
        <CampoTextoLargo
          etiqueta={t("rsvp.alergias")}
          name="alergias"
          rows={2}
          maxLength={LARGOS_DE_CAMPO["invitados.alergias"]}
          defaultValue={persona.alergias ?? undefined}
        />
        <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue">
          <input
            type="checkbox"
            name="necesita_autobus"
            className="casilla-marca transicion-color"
          />
          <span className="text-cuerpo text-tinta">{t("rsvp.autobusPersona")}</span>
        </label>
        <div>
          <BotonEnvio jerarquia="secundario">
            {t("panel.invitados.guardarRespuesta")}
          </BotonEnvio>
        </div>
      </form>
    </details>
  );
}

/**
 * QUITAR A ALGUIEN SE CONFIRMA. El botón estaba pegado a «Corregir datos»: un
 * toque de más borraba a la persona con su correo, sin deshacer. Y se llamaba
 * «Quitar» a secas, así que con dos personas el lector de pantalla decía dos
 * veces lo mismo sin decir de quién. Sin JavaScript, como el resto: un
 * desplegable que, abierto, explica y ofrece el botón que de verdad quita.
 */
function QuitarPersona({
  grupoId,
  persona,
  token,
}: {
  grupoId: string;
  persona: PersonaDelGrupo;
  token: string;
}) {
  const nombre = [persona.nombre, persona.apellidos].filter(Boolean).join(" ");
  return (
    <details className="mt-interno-compacto">
      <summary
        aria-label={t("panel.invitados.quitarDe", { persona: nombre })}
        className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-suave underline decoration-borde-fuerte underline-offset-4 transicion-color hover:text-error-tinta hover:decoration-error"
      >
        {t("panel.invitados.quitar")}
      </summary>
      <form action={quitarPersona} className="mt-pila grid max-w-texto gap-interno">
        <input type="hidden" name="grupo_id" value={grupoId} />
        <input type="hidden" name="persona_id" value={persona.id} />
        {token ? <input type="hidden" name="token" value={token} /> : null}
        <p className="text-pequeno text-tinta-suave">{t("panel.invitados.quitarAviso")}</p>
        <div>
          <BotonEnvio jerarquia="secundario">
            {/* Sin el nombre: va dentro del desplegable de esa persona, que ya lo dice. */}
            {t("panel.invitados.quitarConfirmar")}
          </BotonEnvio>
        </div>
      </form>
    </details>
  );
}

function Persona({ persona }: { persona: PersonaDelGrupo }) {
  const clave = ROTULO_ESTADO[persona.estado];
  /*
    QUIÉN ES MENOR, QUIÉN ES ACOMPAÑANTE Y QUÉ COME. Estaba todo en la base y
    nada en la ficha: si al darlo de alta se olvidó marcar «Es menor», sólo se
    veía descargando el CSV.
  */
  const detalles = [
    clave ? t(clave as "rsvp.vieneSi") : t("panel.invitados.sinContestar"),
    persona.esNino ? t("panel.invitados.menor") : null,
    persona.esAcompanante ? t("panel.invitados.acompanante") : null,
    persona.estado === "confirmado"
      ? t(`panel.menus.${persona.tipoMenu}` as "panel.menus.estandar")
      : null,
    persona.alergias,
  ].filter(Boolean);
  return (
    <div>
      <span className="text-cuerpo text-tinta">
        {[persona.nombre, persona.apellidos].filter(Boolean).join(" ")}
      </span>
      <Etiqueta className="mt-linea">{detalles.join(" · ")}</Etiqueta>
      {persona.correo ? (
        <span className="mt-linea block text-pequeno text-tinta-suave wrap-anywhere">
          {persona.correo}
        </span>
      ) : null}
    </div>
  );
}
