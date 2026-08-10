import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_RSVP,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerGrupo, type PersonaDelGrupo } from "@/lib/bbdd/invitados";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { urlDelSitio } from "@/lib/url-sitio";

import { anadirPersona, emitirEnlace, quitarPersona } from "../acciones";
import { AvisoEstado } from "../aviso";

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
      <Link
        href={RUTA_INVITADOS}
        className="text-pequeno text-tinta-tenue transicion-color hover:text-tinta"
      >
        {t("panel.invitados.volver")}
      </Link>

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
        </Cuerpo>
      </header>

      <AvisoEstado estado={soloTexto(consulta.estado)} />

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
        </section>
      ) : null}

      <section className="mt-bloque">
        <Titulo3 como="h2">{t("panel.invitados.personasTitulo")}</Titulo3>

        {grupo.gente.length === 0 ? (
          <Cuerpo className="mt-pila">{t("panel.invitados.sinPersonas")}</Cuerpo>
        ) : (
          <ul className="mt-pila grid gap-interno-compacto">
            {grupo.gente.map((persona) => (
              <li
                key={persona.id}
                className="flex flex-wrap items-center justify-between gap-interno rounded-campo border border-borde px-interno py-pila"
              >
                <Persona persona={persona} />
                {puedeEditar && persona.estado === "pendiente" ? (
                  <form action={quitarPersona}>
                    <input type="hidden" name="grupo_id" value={grupo.id} />
                    <input type="hidden" name="persona_id" value={persona.id} />
                    <Boton type="submit" jerarquia="terciario">
                      {t("panel.invitados.quitar")}
                    </Boton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {puedeEditar ? (
          <form action={anadirPersona} className="mt-elemento grid max-w-texto gap-interno">
            <input type="hidden" name="grupo_id" value={grupo.id} />
            <CampoTexto
              etiqueta={t("panel.invitados.nombrePersona")}
              name="nombre"
              required
              autoComplete="off"
            />
            <CampoTexto
              etiqueta={t("panel.invitados.apellidosPersona")}
              name="apellidos"
              autoComplete="off"
            />
            <label className="flex min-h-control cursor-pointer items-center gap-interno rounded-campo border border-borde px-interno transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue">
              <input type="checkbox" name="es_nino" className="size-casilla accent-marca" />
              <span className="text-cuerpo text-tinta">{t("panel.invitados.esNino")}</span>
            </label>
            <div>
              <Boton type="submit" jerarquia="secundario">
                {t("panel.invitados.anadirPersona")}
              </Boton>
            </div>
          </form>
        ) : null}
      </section>

      {puedeEditar ? (
        <section className="mt-bloque border-t border-borde pt-bloque">
          <Titulo3 como="h2">{t("panel.invitados.columnaEnlace")}</Titulo3>
          <Cuerpo className="mt-pila max-w-texto text-pequeno">
            {grupo.tokenEmitidoEn
              ? t("panel.invitados.enlaceEmitidoEn", {
                  fecha: formatoFecha.format(grupo.tokenEmitidoEn),
                })
              : t("panel.invitados.enlaceNunca")}
          </Cuerpo>
          <form action={emitirEnlace} className="mt-elemento">
            <input type="hidden" name="grupo_id" value={grupo.id} />
            <Boton type="submit" jerarquia="secundario">
              {t("panel.invitados.emitirEnlace")}
            </Boton>
          </form>
        </section>
      ) : null}
    </>
  );
}

function Persona({ persona }: { persona: PersonaDelGrupo }) {
  const clave = ROTULO_ESTADO[persona.estado];
  return (
    <div>
      <span className="text-cuerpo text-tinta">
        {[persona.nombre, persona.apellidos].filter(Boolean).join(" ")}
      </span>
      <Etiqueta className="mt-linea">
        {clave ? t(clave as "rsvp.vieneSi") : t("panel.invitados.sinContestar")}
        {persona.alergias ? ` · ${persona.alergias}` : ""}
      </Etiqueta>
    </div>
  );
}
