import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { LONGITUD_MINIMA_NOMBRE, RUTA_ACCESO } from "@/config/constants";
import { accesoActual } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { t } from "@/lib/copy";
import { localDesdeInstante } from "@/lib/zona-horaria";

import { guardarAjustes } from "./acciones";

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
  nombres: { texto: t("panel.ajustes.errorNombres"), error: true },
  ceremonia: { texto: t("panel.ajustes.errorCeremonia"), error: true },
  "limite-tarde": { texto: t("panel.ajustes.errorLimiteTarde"), error: true },
  "banquete-antes": { texto: t("panel.ajustes.errorBanqueteAntes"), error: true },
  coordenadas: { texto: t("panel.ajustes.errorCoordenadas"), error: true },
  hashtag: { texto: t("panel.ajustes.errorHashtag"), error: true },
  correo: { texto: t("panel.ajustes.errorCorreo"), error: true },
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
  frase_paisaje: string | null;
  lugar_ceremonia: string | null;
  direccion_ceremonia: string | null;
  latitud_ceremonia: number | null;
  longitud_ceremonia: number | null;
  lugar_banquete: string | null;
  direccion_banquete: string | null;
  latitud_banquete: number | null;
  longitud_banquete: number | null;
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
        "direccion_banquete, latitud_banquete, longitud_banquete, frase_paisaje",
    )
    .maybeSingle<Configuracion>();

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
            LA FRASE DEL PAISAJE VIVE AQUÍ, entre los datos de la boda, y no en
            un módulo de contenido aparte: nombra tres ciudades concretas, que
            son de esta boda igual que el lugar o la fecha. Vacía, la sección no
            se pinta — y eso se dice en la ayuda, porque si no el único modo de
            averiguarlo es borrarla y recargar la web.
          */}
          <CampoTexto
            name="frase_paisaje"
            etiqueta={t("panel.ajustes.frasePaisaje")}
            ayuda={t("panel.ajustes.frasePaisajeAyuda")}
            defaultValue={data?.frase_paisaje ?? ""}
            maxLength={200}
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

      <div>
        <Etiqueta>{t("panel.ajustes.zonaHoraria")}</Etiqueta>
        <Cuerpo className="mt-linea">{zona}</Cuerpo>
      </div>
    </div>
  );
}
