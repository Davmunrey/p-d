import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccionArriba } from "@/components/panel/accion-arriba";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  LARGOS_DE_CAMPO,
  MAXIMO_ACOMPANANTES,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerGrupos } from "@/lib/bbdd/invitados";
import { filtrarGrupos, leerFiltros, ordenarGrupos } from "@/lib/filtro-invitados";
import { t, type ClaveCopy } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { crearInvitacion } from "./acciones";
import { AvisoEstado } from "./aviso";

/** El alta, al final de la lista: el botón de debajo del título salta aquí. */
const ANCLA_NUEVA_INVITACION = "nueva-invitacion";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.invitados.titulo") };

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
  // Los MISMOS filtros y el mismo orden que la exportación. Ver
  // `lib/filtro-invitados.ts`.
  const filtros = leerFiltros((clave) => soloTexto(consulta[clave]) || null);
  const { busqueda } = filtros;

  const grupos = await obtenerGrupos();
  const puedeEditar = acceso.rol !== "lector";

  const visibles = ordenarGrupos(filtrarGrupos(grupos, filtros), filtros.orden);

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.invitados.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.invitados.descripcion")}</Cuerpo>
      </header>
      {/*
        LA ACCIÓN, ARRIBA. Estaba al final, debajo de la lista y de la
        exportación: con cuarenta invitaciones, crear la siguiente exigía bajar
        seis mil píxeles para encontrar el botón. Importar la hoja y ver quién
        no ha contestado son pestañas del módulo, encima del título.
      */}
      {puedeEditar ? (
        <AccionArriba ancla={ANCLA_NUEVA_INVITACION}>
          {t("panel.invitados.accionNueva")}
        </AccionArriba>
      ) : null}

      <AvisoEstado estado={soloTexto(consulta.estado)} />

      {/* Filtro por GET: queda en la URL y funciona sin JavaScript. */}
      {/*
        LA AYUDA DEL BUSCADOR VA DEBAJO DE LA FILA, no del campo: colgada del
        campo lo subía por encima del desplegable y del botón, y la fila salía
        torcida. Sigue unida al campo por `aria-describedby`. Hasta escritorio,
        donde no hay fila, los desplegables y el botón bajan tras ella para que
        quede pegada al buscador; y van de dos en dos, que cinco campos uno
        debajo de otro empujaban la lista una pantalla entera.
      */}
      <form
        method="get"
        className="mt-bloque grid grid-cols-2 items-end gap-interno lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]"
      >
        <CampoTexto
          etiqueta={t("panel.invitados.buscar")}
          aria-describedby="ayuda-buscar-invitados"
          className="col-span-2 lg:col-span-1"
          name="buscar"
          type="search"
          defaultValue={busqueda}
        />
        <CampoSeleccion
          etiqueta={t("panel.invitados.filtrarEstado")}
          className="max-lg:order-1"
          name="estado_filtro"
          defaultValue={filtros.estado}
        >
          <option value="todos">{t("panel.invitados.todos")}</option>
          <option value="sin-contestar">{t("panel.invitados.sinContestar")}</option>
          <option value="contestado">{t("panel.invitados.contestado")}</option>
        </CampoSeleccion>
        <CampoSeleccion
          etiqueta={t("panel.invitados.lado")}
          className="max-lg:order-1"
          name="lado_filtro"
          defaultValue={filtros.lado}
        >
          <option value="todos">{t("panel.invitados.todos")}</option>
          <option value="novia">{t("panel.invitados.lados.novia")}</option>
          <option value="novio">{t("panel.invitados.lados.novio")}</option>
          <option value="ambos">{t("panel.invitados.lados.ambos")}</option>
        </CampoSeleccion>
        <CampoSeleccion
          etiqueta={t("panel.invitados.filtrarAcompanantes")}
          className="max-lg:order-1"
          name="acompanantes"
          defaultValue={filtros.acompanantes}
        >
          <option value="todas">{t("panel.invitados.acompanantesTodas")}</option>
          <option value="con">{t("panel.invitados.acompanantesCon")}</option>
          <option value="sin">{t("panel.invitados.acompanantesSin")}</option>
        </CampoSeleccion>
        <CampoSeleccion
          etiqueta={t("panel.invitados.ordenar")}
          className="max-lg:order-1"
          name="orden"
          defaultValue={filtros.orden}
        >
          <option value="nombre">{t("panel.invitados.ordenes.nombre")}</option>
          <option value="sin-contestar">{t("panel.invitados.ordenes.sinContestar")}</option>
          <option value="personas">{t("panel.invitados.ordenes.personas")}</option>
          <option value="envio">{t("panel.invitados.ordenes.envio")}</option>
        </CampoSeleccion>
        <BotonEnvio jerarquia="secundario" className="col-span-2 max-lg:order-1 lg:col-span-1">
          {t("panel.invitados.buscar")}
        </BotonEnvio>
        <p id="ayuda-buscar-invitados" className="col-span-full text-pequeno text-tinta-suave">
          {t("panel.invitados.buscarAyuda")}
        </p>
      </form>

      {grupos.length === 0 ? (
        <Cuerpo className="mt-bloque">{t("panel.invitados.vacio")}</Cuerpo>
      ) : visibles.length === 0 ? (
        <Cuerpo className="mt-bloque">{t("panel.invitados.sinResultados")}</Cuerpo>
      ) : (
        <ul className="mt-bloque grid gap-interno-compacto">
          {visibles.map((grupo) => (
            <li key={grupo.id}>
              {/*
                UNA FILA POR INVITACIÓN, no una tarjeta. El nombre iba a tamaño
                de título y cada invitación ocupaba cien píxeles: la lista de
                una boda mediana no cabía en cuatro pantallas.
              */}
              <Link
                href={`${RUTA_INVITADOS}/${grupo.id}`}
                className="grid gap-linea rounded-tarjeta border border-borde px-interno py-interno-compacto transicion-color hover:border-borde-marca hover:bg-superficie-tenue sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <span className="font-titulo text-cuerpo-grande text-tinta">
                    {grupo.nombre}
                  </span>
                  <span className="mt-linea block text-pequeno text-tinta-suave">
                    {grupo.personas === 1
                      ? t("panel.invitados.personasUna")
                      : t("panel.invitados.personasCuenta", { personas: grupo.personas })}
                    {/*
                      LO QUE SE MIRA ES SI SE HA MANDADO, no si hay enlace:
                      «emitido el 3» no dice si la familia lo tiene. Y con el
                      orden «sin enviar primero», es lo que explica la lista.
                    */}
                    {grupo.invitacionEnviadaEn
                      ? ` · ${t("panel.invitados.listaMandadaEn", {
                          fecha: formatoFecha.format(grupo.invitacionEnviadaEn),
                        })}`
                      : grupo.tokenEmitidoEn
                        ? ` · ${t("panel.invitados.listaSinMandar")}`
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

        Los filtros y el orden viajan como campos ocultos, así que el fichero
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
            <input type="hidden" name="estado_filtro" value={filtros.estado} />
            <input type="hidden" name="lado_filtro" value={filtros.lado} />
            <input type="hidden" name="acompanantes" value={filtros.acompanantes} />
            <input type="hidden" name="orden" value={filtros.orden} />

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
                      className="casilla-marca transicion-color"
                    />
                    <span className="text-pequeno text-tinta">{t(columna.clave)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <BotonEnvio jerarquia="secundario" className="mt-elemento">
              {t("panel.invitados.exportar")}
            </BotonEnvio>
          </form>
        </section>
      ) : null}

      {puedeEditar ? (
        <section
          id={ANCLA_NUEVA_INVITACION}
          className="mt-bloque scroll-mt-bloque border-t border-borde pt-bloque"
        >
          <Titulo3 como="h2">{t("panel.invitados.nuevaTitulo")}</Titulo3>
          <Cuerpo className="mt-pila max-w-texto">{t("panel.invitados.nuevaAyuda")}</Cuerpo>

          <form action={crearInvitacion} className="mt-elemento grid max-w-texto gap-interno">
            <CampoTexto
              etiqueta={t("panel.invitados.nombreGrupo")}
              name="nombre"
              required
              autoComplete="off"
              maxLength={LARGOS_DE_CAMPO["grupos_invitacion.nombre"]}
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
              <BotonEnvio>{t("panel.invitados.crear")}</BotonEnvio>
            </div>
          </form>
        </section>
      ) : (
        <Etiqueta className="mt-bloque">{t("panel.invitados.errorSinPermiso")}</Etiqueta>
      )}
    </>
  );
}
