import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { LONGITUD_MINIMA_NOMBRE, RUTA_ACCESO, TOPE_AVISOS_PROGRAMA } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { t } from "@/lib/copy";
import { localDesdeInstante } from "@/lib/zona-horaria";

import { guardarAjustes, guardarRegalos } from "./acciones";

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

const AVISOS: Record<string, { texto: string; error: boolean }> = {
  guardado: { texto: t("panel.ajustes.guardado"), error: false },
  "regalos-guardado": { texto: t("panel.ajustes.regalosGuardado"), error: false },
  iban: { texto: t("panel.ajustes.errorIban"), error: true },
  "solo-propietario": { texto: t("panel.ajustes.errorSoloPropietario"), error: true },
  nombres: { texto: t("panel.ajustes.errorNombres"), error: true },
  ceremonia: { texto: t("panel.ajustes.errorCeremonia"), error: true },
  "limite-tarde": { texto: t("panel.ajustes.errorLimiteTarde"), error: true },
  "banquete-antes": { texto: t("panel.ajustes.errorBanqueteAntes"), error: true },
  coordenadas: { texto: t("panel.ajustes.errorCoordenadas"), error: true },
  hashtag: { texto: t("panel.ajustes.errorHashtag"), error: true },
  correo: { texto: t("panel.ajustes.errorCorreo"), error: true },
  avisos: { texto: t("panel.ajustes.errorAvisos"), error: true },
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
}

interface CuentaRegalos {
  iban_regalos: string | null;
  titular_cuenta: string | null;
}

/** Una coordenada vacía se enseña vacía, no como «null» ni como «0». */
function comoTexto(valor: number | null): string {
  return valor === null || valor === undefined ? "" : String(valor);
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
  searchParams: Promise<{ estado?: string }>;
}) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const { estado } = await searchParams;
  const aviso = estado && estado in AVISOS ? AVISOS[estado] : null;

  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("configuracion_boda")
    .select(
      "nombre_novia, nombre_novio, hashtag, correo_contacto, fecha_hora_ceremonia, " +
        "fecha_hora_banquete, fecha_limite_rsvp, zona_horaria, lugar_ceremonia, " +
        "direccion_ceremonia, latitud_ceremonia, longitud_ceremonia, lugar_banquete, " +
        "direccion_banquete, latitud_banquete, longitud_banquete, " +
        "paisaje_intro, paisaje_titulo, paisaje_cierre, " +
        "ciudad_ceremonia, avisos_programa",
    )
    .maybeSingle<Configuracion>();

  /*
    La cuenta se lee aparte porque vive en otra tabla y con otro permiso: leer
    `configuracion_privada` ya exige `puede_editar()`, así que a un lector le
    llegan cero filas y el bloque sale vacío. Es correcto — no tiene por qué ver
    un número de cuenta.
  */
  const { data: privada } = await supabase
    .from("configuracion_privada")
    .select("iban_regalos, titular_cuenta")
    .maybeSingle<CuentaRegalos>();

  const cuenta = privada ?? null;

  const soloLectura = acceso.rol === "lector";
  const zona = data?.zona_horaria ?? "";

  // Las horas viajan a la base como instantes y se enseñan en la zona de la
  // boda. Sin esto, una ceremonia a las 13:00 de junio saldría aquí a las 11:00,
  // que es la misma hora contada desde otro sitio.
  const enLocal = (valor: string | null | undefined) =>
    valor ? localDesdeInstante(new Date(valor), zona) : "";

  return (
    <div className="grid max-w-estrecho gap-elemento">
      <div>
        <Titulo2 como="h1">{t("panel.ajustes.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.ajustes.descripcion")}</Cuerpo>
      </div>

      {aviso ? (
        <p
          role={aviso.error ? "alert" : "status"}
          className={`text-pequeno ${aviso.error ? "text-error-tinta" : "text-tinta-marca"}`}
        >
          {aviso.texto}
        </p>
      ) : null}

      {soloLectura ? (
        <p role="status" className="text-pequeno text-tinta-suave">
          {t("panel.ajustes.soloLectura")}
        </p>
      ) : null}

      <form action={guardarAjustes} className="grid gap-bloque">
        <Grupo titulo={t("panel.ajustes.grupoPareja")}>
          <div className="grid gap-elemento sm:grid-cols-2">
            <CampoTexto
              name="nombre_novia"
              etiqueta={t("panel.ajustes.nombreNovia")}
              defaultValue={data?.nombre_novia ?? ""}
              minLength={LONGITUD_MINIMA_NOMBRE}
              required
              disabled={soloLectura}
            />
            <CampoTexto
              name="nombre_novio"
              etiqueta={t("panel.ajustes.nombreNovio")}
              defaultValue={data?.nombre_novio ?? ""}
              minLength={LONGITUD_MINIMA_NOMBRE}
              required
              disabled={soloLectura}
            />
          </div>
          <CampoTexto
            name="hashtag"
            etiqueta={t("panel.ajustes.hashtag")}
            ayuda={t("panel.ajustes.hashtagAyuda")}
            defaultValue={data?.hashtag ?? ""}
            disabled={soloLectura}
          />
        </Grupo>

        <Grupo titulo={t("panel.ajustes.grupoCeremonia")}>
          <CampoTexto
            name="fecha_hora_ceremonia"
            type="datetime-local"
            etiqueta={t("panel.ajustes.fechaCeremonia")}
            ayuda={`${t("panel.ajustes.zonaHoraria")} ${zona}`}
            defaultValue={enLocal(data?.fecha_hora_ceremonia)}
            required
            disabled={soloLectura}
          />
          <CampoTexto
            name="lugar_ceremonia"
            etiqueta={t("panel.ajustes.lugarCeremonia")}
            defaultValue={data?.lugar_ceremonia ?? ""}
            disabled={soloLectura}
          />
          <CampoTexto
            name="direccion_ceremonia"
            etiqueta={t("panel.ajustes.direccionCeremonia")}
            defaultValue={data?.direccion_ceremonia ?? ""}
            disabled={soloLectura}
          />
          {/*
            LA CIUDAD VA APARTE DE LA DIRECCIÓN: la entrega dice «Nos casamos en
            León» en la portada y «tres hoteles de León» en el alojamiento, y de
            una dirección postal no se saca «León» sin adivinar.
          */}
          <CampoTexto
            name="ciudad_ceremonia"
            etiqueta={t("panel.ajustes.ciudad")}
            ayuda={t("panel.ajustes.ciudadAyuda")}
            defaultValue={data?.ciudad_ceremonia ?? ""}
            maxLength={80}
            disabled={soloLectura}
          />
          {/*
            LOS AVISOS DEL PROGRAMA SON CONTENIDO DE ESTA BODA —«césped y grava:
            cuidado con los tacones»— y no rótulos de la interfaz: por eso se
            editan aquí y no viven en el fichero de copys. Uno por línea.
          */}
          <CampoTextoLargo
            name="avisos_programa"
            etiqueta={t("panel.ajustes.avisosPrograma")}
            ayuda={t("panel.ajustes.avisosProgramaAyuda")}
            defaultValue={(data?.avisos_programa ?? []).join("\n")}
            rows={TOPE_AVISOS_PROGRAMA}
            disabled={soloLectura}
          />
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
          <CampoTexto
            name="paisaje_intro"
            etiqueta={t("panel.ajustes.paisajeIntro")}
            ayuda={t("panel.ajustes.paisajeIntroAyuda")}
            defaultValue={data?.paisaje_intro ?? ""}
            maxLength={60}
            disabled={soloLectura}
          />
          <CampoTexto
            name="paisaje_titulo"
            etiqueta={t("panel.ajustes.paisajeTitulo")}
            ayuda={t("panel.ajustes.paisajeTituloAyuda")}
            defaultValue={data?.paisaje_titulo ?? ""}
            maxLength={200}
            disabled={soloLectura}
          />
          <CampoTexto
            name="paisaje_cierre"
            etiqueta={t("panel.ajustes.paisajeCierre")}
            ayuda={t("panel.ajustes.paisajeCierreAyuda")}
            defaultValue={data?.paisaje_cierre ?? ""}
            maxLength={80}
            disabled={soloLectura}
          />
          <div className="grid gap-elemento sm:grid-cols-2">
            <CampoTexto
              name="latitud_ceremonia"
              inputMode="decimal"
              etiqueta={t("panel.ajustes.latitud")}
              ayuda={t("panel.ajustes.coordenadasAyuda")}
              defaultValue={comoTexto(data?.latitud_ceremonia ?? null)}
              disabled={soloLectura}
            />
            <CampoTexto
              name="longitud_ceremonia"
              inputMode="decimal"
              etiqueta={t("panel.ajustes.longitud")}
              defaultValue={comoTexto(data?.longitud_ceremonia ?? null)}
              disabled={soloLectura}
            />
          </div>
        </Grupo>

        <Grupo titulo={t("panel.ajustes.grupoBanquete")}>
          <CampoTexto
            name="fecha_hora_banquete"
            type="datetime-local"
            etiqueta={t("panel.ajustes.fechaBanquete")}
            ayuda={t("panel.ajustes.fechaBanqueteAyuda")}
            defaultValue={enLocal(data?.fecha_hora_banquete)}
            disabled={soloLectura}
          />
          <CampoTexto
            name="lugar_banquete"
            etiqueta={t("panel.ajustes.lugarBanquete")}
            defaultValue={data?.lugar_banquete ?? ""}
            disabled={soloLectura}
          />
          <CampoTexto
            name="direccion_banquete"
            etiqueta={t("panel.ajustes.direccionBanquete")}
            defaultValue={data?.direccion_banquete ?? ""}
            disabled={soloLectura}
          />
          <div className="grid gap-elemento sm:grid-cols-2">
            <CampoTexto
              name="latitud_banquete"
              inputMode="decimal"
              etiqueta={t("panel.ajustes.latitud")}
              ayuda={t("panel.ajustes.coordenadasAyuda")}
              defaultValue={comoTexto(data?.latitud_banquete ?? null)}
              disabled={soloLectura}
            />
            <CampoTexto
              name="longitud_banquete"
              inputMode="decimal"
              etiqueta={t("panel.ajustes.longitud")}
              defaultValue={comoTexto(data?.longitud_banquete ?? null)}
              disabled={soloLectura}
            />
          </div>
        </Grupo>

        <Grupo titulo={t("panel.ajustes.grupoContacto")}>
          <CampoTexto
            name="correo_contacto"
            type="email"
            etiqueta={t("panel.ajustes.correo")}
            ayuda={t("panel.ajustes.correoAyuda")}
            defaultValue={data?.correo_contacto ?? ""}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={soloLectura}
          />
          <CampoTexto
            name="fecha_limite_rsvp"
            type="datetime-local"
            etiqueta={t("panel.ajustes.limiteRsvp")}
            ayuda={t("panel.ajustes.limiteRsvpAyuda")}
            defaultValue={enLocal(data?.fecha_limite_rsvp)}
            required
            disabled={soloLectura}
          />
        </Grupo>

        {soloLectura ? null : (
          <div>
            <Boton type="submit">{t("panel.ajustes.guardar")}</Boton>
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
      <Regalos cuenta={cuenta} soloPropietario={acceso.rol !== "propietario"} />

      <div>
        <Etiqueta>{t("panel.ajustes.zonaHoraria")}</Etiqueta>
        <Cuerpo className="mt-linea">{zona}</Cuerpo>
      </div>
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
  soloPropietario,
}: {
  cuenta: CuentaRegalos | null;
  soloPropietario: boolean;
}) {
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

        <CampoTexto
          name="iban_regalos"
          etiqueta={t("panel.ajustes.iban")}
          ayuda={t("panel.ajustes.ibanAyuda")}
          defaultValue={cuenta?.iban_regalos ?? ""}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          disabled={soloPropietario}
        />

        <CampoTexto
          name="titular_cuenta"
          etiqueta={t("panel.ajustes.titularCuenta")}
          ayuda={t("panel.ajustes.titularCuentaAyuda")}
          defaultValue={cuenta?.titular_cuenta ?? ""}
          disabled={soloPropietario}
        />

        {soloPropietario ? null : (
          <div>
            <Boton type="submit">{t("panel.ajustes.guardarRegalos")}</Boton>
          </div>
        )}
      </Grupo>
    </form>
  );
}
