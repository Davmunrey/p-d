import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  MAXIMO_ACOMPANANTES,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerGrupos, type GrupoInvitacion } from "@/lib/bbdd/invitados";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { crearInvitacion } from "./acciones";
import { AvisoEstado } from "./aviso";

/**
 * BODA-50 · LAS INVITACIONES
 *
 * Una fila por invitación, no por persona. Es como se organiza una boda de
 * verdad: no se invita a ciento veinte personas sueltas, se invita a treinta
 * familias, y cada una contesta por todos los suyos desde un solo enlace.
 *
 * LA BÚSQUEDA VA POR `GET` Y SIN JAVASCRIPT. Un `<form method="get">` deja el
 * filtro en la URL, así que se puede compartir, marcar y recargar sin perderlo
 * — y funciona antes de que cargue nada. Filtrar en el servidor con ciento
 * veinte filas sería una ida y vuelta por letra tecleada para nada.
 *
 * UN LECTOR VE PERO NO CREA: el formulario de alta no se le enseña. La
 * protección de verdad es RLS y la comprobación de `puede_editar()` dentro de
 * la función; esto es no ofrecer lo que va a fallar.
 */
export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

const ESTADOS_FILTRO = ["todos", "sin-contestar", "contestado"] as const;

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

/** Sin acentos y en minúsculas: «Fernández» tiene que encontrarse por «fernandez». */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function coincide(grupo: GrupoInvitacion, busqueda: string): boolean {
  if (!busqueda) return true;
  const aguja = normalizar(busqueda);
  return (
    normalizar(grupo.nombre).includes(aguja) ||
    grupo.nombresPersonas.some((nombre) => normalizar(nombre).includes(aguja))
  );
}

export default async function PaginaInvitados({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const busqueda = soloTexto(consulta.buscar);
  const filtroBruto = soloTexto(consulta.estado_filtro);
  const filtro = (ESTADOS_FILTRO as readonly string[]).includes(filtroBruto)
    ? filtroBruto
    : "todos";

  const grupos = await obtenerGrupos();
  const puedeEditar = acceso.rol !== "lector";

  const visibles = grupos.filter((grupo) => {
    if (!coincide(grupo, busqueda)) return false;
    if (filtro === "sin-contestar") return grupo.pendientes > 0;
    if (filtro === "contestado") return grupo.pendientes === 0 && grupo.personas > 0;
    return true;
  });

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.invitados.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.invitados.descripcion")}</Cuerpo>
      </header>

      <AvisoEstado estado={soloTexto(consulta.estado)} />

      {/* Filtro por GET: queda en la URL y funciona sin JavaScript. */}
      <form
        method="get"
        className="mt-bloque grid items-end gap-interno sm:grid-cols-[1fr_auto_auto]"
      >
        <CampoTexto
          etiqueta={t("panel.invitados.buscar")}
          ayuda={t("panel.invitados.buscarAyuda")}
          name="buscar"
          type="search"
          defaultValue={busqueda}
        />
        <CampoSeleccion
          etiqueta={t("panel.invitados.filtrarEstado")}
          name="estado_filtro"
          defaultValue={filtro}
        >
          <option value="todos">{t("panel.invitados.todos")}</option>
          <option value="sin-contestar">{t("panel.invitados.sinContestar")}</option>
          <option value="contestado">{t("panel.invitados.contestado")}</option>
        </CampoSeleccion>
        <Boton type="submit" jerarquia="secundario">
          {t("panel.invitados.buscar")}
        </Boton>
      </form>

      {grupos.length === 0 ? (
        <Cuerpo className="mt-bloque">{t("panel.invitados.vacio")}</Cuerpo>
      ) : visibles.length === 0 ? (
        <Cuerpo className="mt-bloque">{t("panel.invitados.sinResultados")}</Cuerpo>
      ) : (
        <ul className="mt-bloque grid gap-interno">
          {visibles.map((grupo) => (
            <li key={grupo.id}>
              <Link
                href={`${RUTA_INVITADOS}/${grupo.id}`}
                className="grid gap-linea rounded-tarjeta border border-borde p-interno transicion-color hover:border-borde-marca hover:bg-superficie-tenue sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <span className="font-titulo text-titulo-3 text-tinta">{grupo.nombre}</span>
                  <span className="mt-linea block text-pequeno text-tinta-tenue">
                    {grupo.personas === 1
                      ? t("panel.invitados.personasUna")
                      : t("panel.invitados.personasCuenta", { personas: grupo.personas })}
                    {grupo.tokenEmitidoEn
                      ? ` · ${t("panel.invitados.enlaceEmitidoEn", {
                          fecha: formatoFecha.format(grupo.tokenEmitidoEn),
                        })}`
                      : ` · ${t("panel.invitados.enlaceNunca")}`}
                  </span>
                </div>
                <span className="text-pequeno text-tinta-suave tabular-nums">
                  {t("panel.invitados.resumenEstado", {
                    confirmados: grupo.confirmados,
                    rechazados: grupo.rechazados,
                    pendientes: grupo.pendientes,
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {puedeEditar ? (
        <section className="mt-bloque border-t border-borde pt-bloque">
          <Titulo3 como="h2">{t("panel.invitados.nuevaTitulo")}</Titulo3>
          <Cuerpo className="mt-pila max-w-texto">{t("panel.invitados.nuevaAyuda")}</Cuerpo>

          <form action={crearInvitacion} className="mt-elemento grid max-w-texto gap-interno">
            <CampoTexto
              etiqueta={t("panel.invitados.nombreGrupo")}
              name="nombre"
              required
              autoComplete="off"
            />
            <CampoSeleccion
              etiqueta={t("panel.invitados.lado")}
              name="lado"
              defaultValue="ambos"
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
              defaultValue={0}
            />
            <div>
              <Boton type="submit">{t("panel.invitados.crear")}</Boton>
            </div>
          </form>
        </section>
      ) : (
        <Etiqueta className="mt-bloque">{t("panel.invitados.errorSinPermiso")}</Etiqueta>
      )}
    </>
  );
}
