import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AvisoPanel } from "@/components/panel/aviso-panel";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  LARGOS_DE_CAMPO,
  LONGITUD_MINIMA_FRASE_PAISAJE,
  LONGITUD_MINIMA_NOMBRE,
  RUTA_ACCESO,
  RUTA_AJUSTES,
  TOPE_AVISOS_PROGRAMA,
} from "@/config/constants";
import { leerBorradorAjustes, type BorradorAjustes } from "@/lib/ajustes-borrador";
import { avisoDe } from "@/lib/avisos";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { localDesdeInstante } from "@/lib/zona-horaria";

import { guardarAjustes, guardarRegalos } from "./acciones";
import {
  anclaDeCampo,
  esCampoAjustes,
  ESTADOS_DE_EXITO,
  type CampoAjustes,
  type EstadoAjustes,
} from "./estado";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.ajustes.titulo") };

/**
 * BODA-44 · AJUSTES DE LA BODA
 *
 * La pantalla que faltaba. `configuracion_boda` alimenta la portada, la cuenta
 * atrás, las ubicaciones, el `.ics` y la tarjeta de WhatsApp, y hasta ahora la
 * única forma de tocarla era el editor SQL de Supabase — con la web enseñando
 * «Por definir» mientras tanto.
 *
 * Es un `<form>` con Server Action, sin una línea de JavaScript de cliente:
 * los datos más visibles de la boda no dependen de que cargue un bundle.
 *
 * UN LECTOR VE PERO NO TOCA. Los campos se le enseñan deshabilitados y sin
 * botón de guardar. No es la protección —esa es RLS, y la acción comprueba el
 * recuento de filas por si alguien manda el formulario a mano— sino no ofrecer
 * lo que va a fallar.
 */
export const dynamic = "force-dynamic";

const AVISOS: Record<EstadoAjustes, { texto: string; error: boolean }> = {
  guardado: { texto: t("panel.ajustes.guardado"), error: false },
  "regalos-guardado": { texto: t("panel.ajustes.regalosGuardado"), error: false },
  iban: { texto: t("panel.ajustes.errorIban"), error: true },
  "solo-propietario": { texto: t("panel.ajustes.errorSoloPropietario"), error: true },
  nombres: { texto: t("panel.ajustes.errorNombres"), error: true },
  ceremonia: { texto: t("panel.ajustes.errorCeremonia"), error: true },
  limite: { texto: t("panel.ajustes.errorLimite"), error: true },
  "limite-tarde": { texto: t("panel.ajustes.errorLimiteTarde"), error: true },
  banquete: { texto: t("panel.ajustes.errorBanquete"), error: true },
  "banquete-antes": { texto: t("panel.ajustes.errorBanqueteAntes"), error: true },
  coordenadas: { texto: t("panel.ajustes.errorCoordenadas"), error: true },
  hashtag: { texto: t("panel.ajustes.errorHashtag"), error: true },
  correo: { texto: t("panel.ajustes.errorCorreo"), error: true },
  avisos: { texto: t("panel.ajustes.errorAvisos"), error: true },
  largo: { texto: t("panel.ajustes.errorLargo"), error: true },
  "paisaje-corto": { texto: t("panel.ajustes.errorPaisajeCorto"), error: true },
  cambiado: { texto: t("panel.ajustes.errorCambiado"), error: true },
  "sin-permiso": { texto: t("panel.ajustes.errorSinPermiso"), error: true },
  error: { texto: t("panel.ajustes.errorGuardar"), error: true },
};

interface Configuracion {
  nombre_novia: string;
  nombre_novio: string;
  hashtag: string | null;
  correo_contacto: string | null;
  fecha_hora_ceremonia: string;
  fecha_hora_banquete: string | null;
  fecha_limite_rsvp: string;
  zona_horaria: string;
  paisaje_intro: string | null;
  paisaje_titulo: string | null;
  paisaje_cierre: string | null;
  ciudad_ceremonia: string | null;
  avisos_programa: string[] | null;
  lugar_ceremonia: string | null;
  direccion_ceremonia: string | null;
  latitud_ceremonia: number | null;
  longitud_ceremonia: number | null;
  lugar_banquete: string | null;
  direccion_banquete: string | null;
  latitud_banquete: number | null;
  longitud_banquete: number | null;
  actualizado_en: string;
}

interface CuentaRegalos {
  iban_regalos: string | null;
  titular_cuenta: string | null;
}

/** Una coordenada vacía se enseña vacía, no como «null» ni como «0». */
function comoTexto(valor: number | null): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

/**
 * «hora de Europa central» y no «Europe/Madrid»: el identificador de la base
 * está en inglés y no le dice nada a quien escribe la hora de su boda.
 */
function nombreDeLaZona(zona: string): string {
  try {
    return (
      new Intl.DateTimeFormat(IDIOMA, { timeZone: zona, timeZoneName: "longGeneric" })
        .formatToParts(new Date())
        .find((parte) => parte.type === "timeZoneName")?.value ?? zona
    );
  } catch {
    return zona;
  }
}

/**
 * EL BLOQUE DE UN CAMPO, CON SU ANCLA. Cuando el servidor rechaza un campo, la
 * URL lleva `#campo-…` y la página baja hasta él; el margen de la cabecera
 * evita que quede tapado.
 */
function Ancla({ campo, children }: { campo: CampoAjustes; children: React.ReactNode }) {
  return (
    <div id={anclaDeCampo(campo)} className="scroll-mt-cabecera">
      {children}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-elemento border-t border-borde pt-elemento">
      <legend className="sr-only">{titulo}</legend>
      <Titulo3 como="h2">{titulo}</Titulo3>
      {children}
    </fieldset>
  );
}

export default async function PaginaAjustes({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; campo?: string }>;
}) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const { estado, campo } = await searchParams;
  const aviso = avisoDe(AVISOS, estado) ?? null;

  /*
    CON UN ERROR, LO ESCRITO GANA A LA BASE. La acción guarda lo enviado antes
    de volver (`ajustes-borrador.ts`): sin esto, corregir la fecha límite
    deshacía el lugar y el paisaje que se habían cambiado en el mismo envío.
  */
  const conError = Boolean(aviso) && !ESTADOS_DE_EXITO.includes(estado as EstadoAjustes);
  const borrador = conError ? await leerBorradorAjustes() : null;

  // El error de un campo va junto al campo, no arriba del todo.
  const campoConError = aviso?.error && esCampoAjustes(campo) ? campo : null;
  const errorDe = (nombre: CampoAjustes) =>
    campoConError === nombre ? aviso?.texto : undefined;

  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("configuracion_boda")
    .select(
      "nombre_novia, nombre_novio, hashtag, correo_contacto, fecha_hora_ceremonia, " +
        "fecha_hora_banquete, fecha_limite_rsvp, zona_horaria, lugar_ceremonia, " +
        "direccion_ceremonia, latitud_ceremonia, longitud_ceremonia, lugar_banquete, " +
        "direccion_banquete, latitud_banquete, longitud_banquete, " +
        "paisaje_intro, paisaje_titulo, paisaje_cierre, " +
        "ciudad_ceremonia, avisos_programa, actualizado_en",
    )
    .maybeSingle<Configuracion>();

  /*
    SI NO SE PUEDE LEER, SE DICE, en vez de pintar el formulario vacío. Un corte
    de un segundo enseñaba los nombres y las fechas en blanco; quien lo veía
    creía perdidos los datos, rellenaba lo obligatorio, guardaba, y borraba el
    lugar, las coordenadas, el paisaje y los avisos. Así sale la pantalla de
    avería con «Reintentar», como en el resto del panel.
  */
  if (error) throw new Error(`No se pudo leer la configuración de la boda: ${error.message}`);
  if (!data) throw new Error("No hay configuración de la boda que enseñar.");

  /*
    La cuenta se lee aparte porque vive en otra tabla y con otro permiso: leer
    `configuracion_privada` ya exige `puede_editar()`, así que a un lector le
    llegan cero filas. Un error, en cambio, no es «sin cuenta».
  */
  const soloLectura = acceso.rol === "lector";
  let cuenta: CuentaRegalos | null = null;
  if (!soloLectura) {
    const { data: privada, error: errorPrivada } = await supabase
      .from("configuracion_privada")
      .select("iban_regalos, titular_cuenta")
      .maybeSingle<CuentaRegalos>();
    if (errorPrivada) {
      throw new Error(`No se pudo leer la cuenta de los regalos: ${errorPrivada.message}`);
    }
    cuenta = privada ?? null;
  }

  const zona = data.zona_horaria;

  // Las horas viajan a la base como instantes y se enseñan en la zona de la
  // boda. Sin esto, una ceremonia a las 13:00 de junio saldría aquí a las 11:00,
  // que es la misma hora contada desde otro sitio.
  const enLocal = (valor: string | null | undefined) =>
    valor ? localDesdeInstante(new Date(valor), zona) : "";

  /** Lo escrito si se vuelve con un error; si no, lo que hay en la base. */
  const valor = (nombre: CampoAjustes, deLaBase: string) => borrador?.[nombre] ?? deLaBase;

  /** Lo común a todos los campos: nombre, valor, error y si se puede tocar. */
  const comun = (nombre: CampoAjustes, deLaBase: string) => ({
    name: nombre,
    defaultValue: valor(nombre, deLaBase),
    error: errorDe(nombre),
    disabled: soloLectura,
  });

  return (
    <div className="grid max-w-estrecho gap-elemento">
      <div>
        <Titulo2 como="h1">{t("panel.ajustes.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.ajustes.descripcion")}</Cuerpo>
        {/* Una vez y arriba: vale para las tres fechas de la pantalla. */}
        <Cuerpo className="mt-pila text-pequeno text-tinta-suave">
          {t("panel.ajustes.zonaHoraria", { zona: nombreDeLaZona(zona) })}
        </Cuerpo>
      </div>

      {aviso && !campoConError ? (
        <AvisoPanel error={aviso.error}>
          {aviso.texto}
          {estado === "cambiado" ? (
            <>
              {" "}
              <EnlaceSuave href={RUTA_AJUSTES}>{t("panel.ajustes.verLoQueHay")}</EnlaceSuave>
            </>
          ) : null}
        </AvisoPanel>
      ) : null}

      {soloLectura ? (
        <p role="status" className="text-pequeno text-tinta-suave">
          {t("panel.ajustes.soloLectura")}
        </p>
      ) : null}

      {/*
        LA CLAVE CAMBIA CON LO QUE SE PINTA. Los campos no son controlados, y
        React no vuelve a aplicar un `defaultValue` nuevo a un campo que ya
        existe: tras «Ver lo que hay ahora» o tras guardar, el formulario se
        quedaba enseñando lo de antes. Con otra versión o al pasar del borrador
        a la base, se monta de nuevo.
      */}
      <form
        key={`${data.actualizado_en}:${borrador ? "borrador" : "base"}`}
        action={guardarAjustes}
        className="grid gap-bloque"
      >
        {/*
          LA VERSIÓN QUE SE PINTÓ, y siempre la de la base, nunca la del
          borrador: con dos personas guardando, la acción no escribe sobre una
          fila que ya es otra.
        */}
        <input type="hidden" name="actualizado_en" value={data.actualizado_en} />

        <Grupo titulo={t("panel.ajustes.grupoPareja")}>
          <div className="grid gap-elemento sm:grid-cols-2">
            <Ancla campo="nombre_novia">
              <CampoTexto
                {...comun("nombre_novia", data.nombre_novia)}
                etiqueta={t("panel.ajustes.nombreNovia")}
                maxLength={LARGOS_DE_CAMPO["configuracion_boda.nombre_novia"]}
                minLength={LONGITUD_MINIMA_NOMBRE}
                required
              />
            </Ancla>
            <Ancla campo="nombre_novio">
              <CampoTexto
                {...comun("nombre_novio", data.nombre_novio)}
                etiqueta={t("panel.ajustes.nombreNovio")}
                maxLength={LARGOS_DE_CAMPO["configuracion_boda.nombre_novio"]}
                minLength={LONGITUD_MINIMA_NOMBRE}
                required
              />
            </Ancla>
          </div>
          <Ancla campo="hashtag">
            <CampoTexto
              {...comun("hashtag", data.hashtag ?? "")}
              etiqueta={t("panel.ajustes.hashtag")}
              ayuda={t("panel.ajustes.hashtagAyuda")}
              // El navegador lo frena antes de enviar; la acción, si no.
              pattern="#[\p{L}\p{N}_]{1,60}"
            />
          </Ancla>
        </Grupo>

        {/*
          LA CEREMONIA, CON SUS COORDENADAS DETRÁS DE LA DIRECCIÓN, como el
          banquete. Los avisos y el paisaje se metían en medio: para poner el
          punto del mapa había que bajar mil píxeles desde la dirección.
        */}
        <Grupo titulo={t("panel.ajustes.grupoCeremonia")}>
          <Ancla campo="fecha_hora_ceremonia">
            <CampoTexto
              {...comun("fecha_hora_ceremonia", enLocal(data.fecha_hora_ceremonia))}
              type="datetime-local"
              etiqueta={t("panel.ajustes.fechaCeremonia")}
              required
            />
          </Ancla>
          <Ancla campo="lugar_ceremonia">
            <CampoTexto
              {...comun("lugar_ceremonia", data.lugar_ceremonia ?? "")}
              etiqueta={t("panel.ajustes.lugarCeremonia")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.lugar_ceremonia"]}
            />
          </Ancla>
          <Ancla campo="direccion_ceremonia">
            <CampoTexto
              {...comun("direccion_ceremonia", data.direccion_ceremonia ?? "")}
              etiqueta={t("panel.ajustes.direccionCeremonia")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.direccion_ceremonia"]}
            />
          </Ancla>
          {/*
            LA CIUDAD VA APARTE DE LA DIRECCIÓN: la entrega dice «Nos casamos en
            León» en la portada y «tres hoteles de León» en el alojamiento, y de
            una dirección postal no se saca «León» sin adivinar.
          */}
          <Ancla campo="ciudad_ceremonia">
            <CampoTexto
              {...comun("ciudad_ceremonia", data.ciudad_ceremonia ?? "")}
              etiqueta={t("panel.ajustes.ciudad")}
              ayuda={t("panel.ajustes.ciudadAyuda")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.ciudad_ceremonia"]}
            />
          </Ancla>
          <Coordenadas
            latitud={comun("latitud_ceremonia", comoTexto(data.latitud_ceremonia))}
            longitud={comun("longitud_ceremonia", comoTexto(data.longitud_ceremonia))}
          />
        </Grupo>

        <Grupo titulo={t("panel.ajustes.grupoBanquete")}>
          <Ancla campo="fecha_hora_banquete">
            <CampoTexto
              {...comun("fecha_hora_banquete", enLocal(data.fecha_hora_banquete))}
              type="datetime-local"
              etiqueta={t("panel.ajustes.fechaBanquete")}
              ayuda={t("panel.ajustes.fechaBanqueteAyuda")}
            />
          </Ancla>
          <Ancla campo="lugar_banquete">
            <CampoTexto
              {...comun("lugar_banquete", data.lugar_banquete ?? "")}
              etiqueta={t("panel.ajustes.lugarBanquete")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.lugar_banquete"]}
            />
          </Ancla>
          <Ancla campo="direccion_banquete">
            <CampoTexto
              {...comun("direccion_banquete", data.direccion_banquete ?? "")}
              etiqueta={t("panel.ajustes.direccionBanquete")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.direccion_banquete"]}
            />
          </Ancla>
          <Coordenadas
            latitud={comun("latitud_banquete", comoTexto(data.latitud_banquete))}
            longitud={comun("longitud_banquete", comoTexto(data.longitud_banquete))}
          />
        </Grupo>

        {/*
          LOS TEXTOS DE LA PORTADA, EN SU GRUPO. Quien busca la frase del
          paisaje no la espera dentro de «Ceremonia», y metida allí separaba la
          dirección de sus coordenadas.
        */}
        <Grupo titulo={t("panel.ajustes.grupoPortada")}>
          {/*
            LOS AVISOS DEL PROGRAMA SON CONTENIDO DE ESTA BODA —«césped y grava:
            cuidado con los tacones»— y no rótulos de la interfaz: por eso se
            editan aquí y no viven en el fichero de copys. Uno por línea.
          */}
          <Ancla campo="avisos_programa">
            <CampoTextoLargo
              {...comun("avisos_programa", (data.avisos_programa ?? []).join("\n"))}
              etiqueta={t("panel.ajustes.avisosPrograma")}
              ayuda={t("panel.ajustes.avisosProgramaAyuda")}
              rows={TOPE_AVISOS_PROGRAMA}
            />
          </Ancla>
          {/*
            LA FRASE DEL PAISAJE VIVE AQUÍ, entre los datos de la boda, y no en
            un módulo de contenido aparte: nombra tres ciudades concretas, que
            son de esta boda igual que el lugar o la fecha.

            SON TRES CAMPOS Y NO UNO porque la entrega escribe tres líneas con
            tres tipografías distintas, y de un solo texto no hay manera de
            saber dónde corta cada una. El titular es el que manda: vacío, la
            sección no se pinta — y eso se dice en la ayuda, porque si no el
            único modo de averiguarlo es borrarlo y recargar la web.
          */}
          <Ancla campo="paisaje_intro">
            <CampoTexto
              {...comun("paisaje_intro", data.paisaje_intro ?? "")}
              etiqueta={t("panel.ajustes.paisajeIntro")}
              ayuda={t("panel.ajustes.paisajeIntroAyuda")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.paisaje_intro"]}
              minLength={LONGITUD_MINIMA_FRASE_PAISAJE}
            />
          </Ancla>
          <Ancla campo="paisaje_titulo">
            <CampoTexto
              {...comun("paisaje_titulo", data.paisaje_titulo ?? "")}
              etiqueta={t("panel.ajustes.paisajeTitulo")}
              ayuda={t("panel.ajustes.paisajeTituloAyuda")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.paisaje_titulo"]}
              minLength={LONGITUD_MINIMA_FRASE_PAISAJE}
            />
          </Ancla>
          <Ancla campo="paisaje_cierre">
            <CampoTexto
              {...comun("paisaje_cierre", data.paisaje_cierre ?? "")}
              etiqueta={t("panel.ajustes.paisajeCierre")}
              ayuda={t("panel.ajustes.paisajeCierreAyuda")}
              maxLength={LARGOS_DE_CAMPO["configuracion_boda.paisaje_cierre"]}
              minLength={LONGITUD_MINIMA_FRASE_PAISAJE}
            />
          </Ancla>
        </Grupo>

        <Grupo titulo={t("panel.ajustes.grupoContacto")}>
          <Ancla campo="correo_contacto">
            <CampoTexto
              {...comun("correo_contacto", data.correo_contacto ?? "")}
              type="email"
              etiqueta={t("panel.ajustes.correo")}
              ayuda={t("panel.ajustes.correoAyuda")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Ancla>
          <Ancla campo="fecha_limite_rsvp">
            <CampoTexto
              {...comun("fecha_limite_rsvp", enLocal(data.fecha_limite_rsvp))}
              type="datetime-local"
              etiqueta={t("panel.ajustes.limiteRsvp")}
              ayuda={t("panel.ajustes.limiteRsvpAyuda")}
              required
            />
          </Ancla>
        </Grupo>

        {/*
          GUARDAR, SIEMPRE A MANO. Son cinco grupos y un solo botón al final:
          en un móvil, cambiar los nombres de arriba obligaba a bajar tres mil
          píxeles para guardarlos. Se pega al pie mientras el formulario está a
          la vista —encima de la barra del móvil— y al acabar el formulario se
          queda en su sitio, sin tapar la cuenta de los regalos.
        */}
        {soloLectura ? null : (
          <div className="velada sticky pegado-sobre-barra border-t border-borde py-interno md:bottom-0 print:hidden">
            <BotonEnvio>{t("panel.ajustes.guardar")}</BotonEnvio>
          </div>
        )}
      </form>

      {/*
        LA CUENTA VA EN SU PROPIO FORMULARIO, y no es maquetación: escribe en
        OTRA tabla —`configuracion_privada`, la que `anon` no ve— y la escribe
        otra gente, porque `configuracion_privada_propietario_actualizar` pide
        `es_propietario()` y no `puede_editar()`. Un editor cambia la hora de la
        ceremonia y no cambia la cuenta corriente; con un solo botón de guardar,
        o se le niega todo o se le cuela el IBAN.
      */}
      <Regalos
        key={borrador ? "borrador" : "base"}
        cuenta={cuenta}
        lector={soloLectura}
        soloPropietario={acceso.rol !== "propietario"}
        borrador={borrador}
        errorDe={errorDe}
      />
    </div>
  );
}

/** Latitud y longitud, en una fila desde tableta y cada una con su ancla. */
function Coordenadas({
  latitud,
  longitud,
}: {
  latitud: { name: CampoAjustes; defaultValue: string; error?: string; disabled: boolean };
  longitud: { name: CampoAjustes; defaultValue: string; error?: string; disabled: boolean };
}) {
  return (
    <div className="grid gap-elemento sm:grid-cols-2">
      <Ancla campo={latitud.name}>
        <CampoTexto
          {...latitud}
          inputMode="decimal"
          etiqueta={t("panel.ajustes.latitud")}
          ayuda={t("panel.ajustes.coordenadasAyuda")}
          pattern="-?[0-9]+([.,][0-9]+)?"
        />
      </Ancla>
      <Ancla campo={longitud.name}>
        <CampoTexto
          {...longitud}
          inputMode="decimal"
          etiqueta={t("panel.ajustes.longitud")}
          pattern="-?[0-9]+([.,][0-9]+)?"
        />
      </Ancla>
    </div>
  );
}

/**
 * LA CUENTA PARA LOS REGALOS.
 *
 * Es lo único que le falta a la sección de Regalos para poder encenderse:
 * `datos_para_regalos()` devuelve cero filas sin IBAN, y la landing oculta lo
 * vacío. Se dice en la ayuda, porque «he encendido Regalos y no sale» es
 * exactamente la clase de desconcierto que este módulo viene a quitar.
 *
 * Vaciar el campo es una forma legítima de apagar la sección, y por eso el IBAN
 * no es obligatorio.
 */
function Regalos({
  cuenta,
  lector,
  soloPropietario,
  borrador,
  errorDe,
}: {
  cuenta: CuentaRegalos | null;
  lector: boolean;
  soloPropietario: boolean;
  borrador: BorradorAjustes | null;
  errorDe: (campo: CampoAjustes) => string | undefined;
}) {
  /*
    AL LECTOR NO SE LE ENSEÑA EL FORMULARIO. No puede leer la cuenta —la base
    le da cero filas—, así que veía los campos vacíos junto a «Sin cuenta
    escrita, la sección de Regalos no aparece» y «Podéis verla», y deducía que
    no había regalos cuando la sección estaba encendida.
  */
  if (lector) {
    return (
      <section className="grid gap-elemento border-t border-borde pt-elemento">
        <Titulo3 como="h2">{t("panel.ajustes.grupoRegalos")}</Titulo3>
        <Cuerpo className="text-pequeno text-tinta-suave">
          {t("panel.ajustes.regalosSoloEditores")}
        </Cuerpo>
      </section>
    );
  }

  return (
    <form action={guardarRegalos} className="grid gap-bloque">
      <Grupo titulo={t("panel.ajustes.grupoRegalos")}>
        <Cuerpo className="text-pequeno text-tinta-suave">
          {t("panel.ajustes.regalosAyuda")}
        </Cuerpo>

        {soloPropietario ? (
          <p role="status" className="text-pequeno text-tinta-suave">
            {t("panel.ajustes.regalosSoloPropietario")}
          </p>
        ) : null}

        <Ancla campo="iban_regalos">
          <CampoTexto
            name="iban_regalos"
            etiqueta={t("panel.ajustes.iban")}
            ayuda={t("panel.ajustes.ibanAyuda")}
            defaultValue={borrador?.iban_regalos ?? cuenta?.iban_regalos ?? ""}
            error={errorDe("iban_regalos")}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={soloPropietario}
          />
        </Ancla>

        <Ancla campo="titular_cuenta">
          <CampoTexto
            name="titular_cuenta"
            etiqueta={t("panel.ajustes.titularCuenta")}
            ayuda={t("panel.ajustes.titularCuentaAyuda")}
            defaultValue={borrador?.titular_cuenta ?? cuenta?.titular_cuenta ?? ""}
            error={errorDe("titular_cuenta")}
            disabled={soloPropietario}
          />
        </Ancla>

        {soloPropietario ? null : (
          <div>
            <BotonEnvio>{t("panel.ajustes.guardarRegalos")}</BotonEnvio>
          </div>
        )}
      </Grupo>
    </form>
  );
}
