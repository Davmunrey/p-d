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
  RUTA_PENDIENTES,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerGrupos } from "@/lib/bbdd/invitados";
import { esEstadoFiltro, filtrarGrupos, type EstadoFiltro } from "@/lib/filtro-invitados";
import { t, type ClaveCopy } from "@/lib/copy";
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

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

/**
 * Las columnas que se pueden llevar al fichero. El orden es el de la tabla que
 * espera quien la recibe: primero de quién es la invitación, luego quién es la
 * persona, y al final lo que come.
 */
const COLUMNAS_EXPORTABLES: readonly { id: string; clave: ClaveCopy }[] = [
  { id: "grupo", clave: "panel.invitados.columnaNombreGrupo" },
  { id: "lado", clave: "panel.invitados.columnaLado" },
  { id: "nombre", clave: "panel.invitados.columnaNombre" },
  { id: "apellidos", clave: "panel.invitados.columnaApellidos" },
  { id: "nino", clave: "panel.invitados.columnaEsNino" },
  { id: "respuesta", clave: "panel.invitados.columnaRespuesta" },
  { id: "menu", clave: "panel.invitados.columnaMenu" },
  { id: "alergias", clave: "panel.invitados.columnaAlergias" },
];

export default async function PaginaInvitados({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const busqueda = soloTexto(consulta.buscar);
  const filtroBruto = soloTexto(consulta.estado_filtro);
  const filtro: EstadoFiltro = esEstadoFiltro(filtroBruto) ? filtroBruto : "todos";

  const grupos = await obtenerGrupos();
  const puedeEditar = acceso.rol !== "lector";

  // El MISMO filtro que usa la exportación. Ver `lib/filtro-invitados.ts`.
  const visibles = filtrarGrupos(grupos, { busqueda, estado: filtro });

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

      {/*
        LA DESCARGA SE LLEVA EL FILTRO PUESTO.

        Los tres valores viajan como campos ocultos, así que el fichero
        contiene exactamente las filas que se están viendo. Es un `GET` a una
        ruta y no una acción de servidor porque el resultado es un fichero: hay
        que poner cabeceras para que el navegador lo descargue en vez de
        pintarlo.

        Lo ve también un lector: exportar es leer, y quien puede mirar la lista
        puede llevársela.
      */}
      {visibles.length > 0 ? (
        <section className="mt-bloque border-t border-borde pt-bloque">
          <Titulo3 como="h2">{t("panel.invitados.exportarTitulo")}</Titulo3>
          <Cuerpo className="mt-pila max-w-texto">{t("panel.invitados.exportarAyuda")}</Cuerpo>

          <form method="get" action={`${RUTA_INVITADOS}/exportar`} className="mt-elemento">
            <input type="hidden" name="buscar" value={busqueda} />
            <input type="hidden" name="estado_filtro" value={filtro} />

            <fieldset className="border-0 p-0">
              <legend className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
                {t("panel.invitados.columnas")}
              </legend>
              <div className="mt-pila flex flex-wrap gap-interno-compacto">
                {COLUMNAS_EXPORTABLES.map((columna) => (
                  <label
                    key={columna.id}
                    className="flex min-h-control-compacto cursor-pointer items-center gap-interno-compacto rounded-etiqueta border border-borde px-interno py-linea transicion-color has-checked:border-borde-marca has-checked:bg-superficie-tenue"
                  >
                    <input
                      type="checkbox"
                      name="columna"
                      value={columna.id}
                      defaultChecked
                      className="size-casilla accent-marca"
                    />
                    <span className="text-pequeno text-tinta">{t(columna.clave)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Boton type="submit" jerarquia="secundario" className="mt-elemento">
              {t("panel.invitados.exportar")}
            </Boton>
          </form>
        </section>
      ) : null}

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

          {/*
            Y la otra vía, para cuando la lista ya existe en una hoja: teclear
            doscientos nombres de uno en uno en el formulario de arriba no es
            una opción, y el resultado de intentarlo es que falte gente.
          */}
          <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-tenue">
            <Link
              href={`${RUTA_INVITADOS}/importar`}
              className="text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
            >
              {t("panel.importar.enlaceDesdeLista")}
            </Link>
            {" · "}
            <Link
              href={RUTA_PENDIENTES}
              className="text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
            >
              {t("panel.pendientes.enlaceDesdeLista")}
            </Link>
          </Cuerpo>
        </section>
      ) : (
        <Etiqueta className="mt-bloque">{t("panel.invitados.errorSinPermiso")}</Etiqueta>
      )}
    </>
  );
}
