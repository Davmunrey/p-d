import Link from "next/link";
import { redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoTexto } from "@/components/ui/campo";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_MENSAJES,
  RUTA_PLAYLIST_EXPORTAR,
  TOPE_CANCIONES_POR_GRUPO,
  ZONA_HORARIA,
} from "@/config/constants";
import {
  obtenerCancionesTodas,
  obtenerMensajes,
  type CancionSugerida,
  type MensajeInvitado,
} from "@/lib/bbdd/mensajes";
import { t, type ClaveCopy } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { normalizar } from "@/lib/texto";
import { avisoDe } from "@/lib/avisos";

import { destacarMensaje, marcarLeido, moderarCancion } from "./acciones";

/**
 * BODA-112/113 · LO QUE ESCRIBEN LOS INVITADOS
 *
 * Los mensajes que dejan al confirmar y las canciones que piden. Las dos cosas
 * llegan por el mismo formulario y hasta ahora se guardaban sin que nadie las
 * leyera — que es tanto como no haberlas pedido.
 *
 * VAN JUNTAS Y NO EN DOS PANTALLAS porque son la misma pregunta desde el punto
 * de vista de quien organiza: «¿me ha dicho alguien algo?». Separarlas
 * obligaría a mirar en dos sitios lo que llega de una vez.
 *
 * NO SE CACHEA: cambia cada vez que alguien confirma.
 */
export const dynamic = "force-dynamic";

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_HORARIA,
});

const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  marcado: { clave: "panel.mensajes.marcado", error: false },
  destacado: { clave: "panel.mensajes.avisoDestacado", error: false },
  "sin-destacar": { clave: "panel.mensajes.avisoSinDestacar", error: false },
  "cancion-ocultada": { clave: "panel.mensajes.cancionOcultada", error: false },
  "cancion-mostrada": { clave: "panel.mensajes.cancionMostrada", error: false },
  "no-existe": { clave: "panel.mensajes.errorNoExiste", error: true },
  "mensaje-cambiado": { clave: "panel.mensajes.errorMensajeCambiado", error: true },
  "mensaje-no-existe": { clave: "panel.mensajes.errorMensajeNoExiste", error: true },
  "sin-permiso": { clave: "panel.mensajes.errorSinPermiso", error: true },
  error: { clave: "panel.mensajes.errorGuardar", error: true },
};

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

export default async function PaginaMensajes({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const busqueda = soloTexto(consulta.buscar);
  const soloDestacados = soloTexto(consulta.destacados) === "1";

  const [mensajes, canciones] = await Promise.all([obtenerMensajes(), obtenerCancionesTodas()]);

  const puedeEditar = acceso.rol !== "lector";
  const aguja = normalizar(busqueda);
  const visibles = mensajes
    .filter((mensaje) => !soloDestacados || mensaje.destacado)
    .filter(
      (mensaje) =>
        !busqueda ||
        normalizar(mensaje.texto).includes(aguja) ||
        normalizar(mensaje.grupoNombre).includes(aguja),
    );

  const sinLeer = mensajes.filter((mensaje) => !mensaje.leido).length;

  /*
    El filtro de destacados es un enlace y no una casilla: la casilla no hacía
    nada al marcarla —había que subir y pulsar «Buscar» sin buscar nada—. Un
    toque, y la búsqueda escrita se conserva.
  */
  const conDestacados = new URLSearchParams();
  if (busqueda) conDestacados.set("buscar", busqueda);
  if (!soloDestacados) conDestacados.set("destacados", "1");
  const alternarDestacados = `${RUTA_MENSAJES}${conDestacados.size ? `?${conDestacados}` : ""}`;
  const aviso = avisoDe(AVISOS, soloTexto(consulta.estado));

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.mensajes.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.mensajes.descripcion")}</Cuerpo>
      </header>

      {aviso ? (
        <p
          role={aviso.error ? "alert" : "status"}
          className={`rounded-campo p-interno text-pequeno ${
            aviso.error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
          }`}
        >
          {t(aviso.clave)}
        </p>
      ) : null}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-interno">
          <Titulo3 como="h2">{t("panel.mensajes.bloqueMensajes")}</Titulo3>
          <Etiqueta>
            {sinLeer > 0
              ? t("panel.mensajes.sinLeer", { cuantos: sinLeer })
              : t("panel.mensajes.todoLeido")}
          </Etiqueta>
        </div>

        {mensajes.length === 0 ? (
          <Cuerpo className="mt-pila">{t("panel.mensajes.sinMensajes")}</Cuerpo>
        ) : (
          <>
            {/* Búsqueda por GET: queda en la URL y funciona sin JavaScript. */}
            <form
              method="get"
              className="mt-pila grid items-end gap-interno sm:grid-cols-[1fr_auto]"
            >
              {/* La ayuda bajo la fila y no bajo el campo, para que no lo
                  suba por encima del botón (ver el buscador de invitados). */}
              <CampoTexto
                etiqueta={t("panel.mensajes.buscar")}
                aria-describedby="ayuda-buscar-mensajes"
                name="buscar"
                type="search"
                defaultValue={busqueda}
              />
              <BotonEnvio jerarquia="secundario">{t("panel.mensajes.buscar")}</BotonEnvio>
              <p
                id="ayuda-buscar-mensajes"
                className="text-pequeno text-tinta-suave sm:col-span-2"
              >
                {t("panel.mensajes.buscarAyuda")}
              </p>
              {/* Buscar no puede quitar el filtro que ya está puesto. */}
              {soloDestacados ? <input type="hidden" name="destacados" value="1" /> : null}
            </form>

            {/*
              LOS DESTACADOS, DE UN TOQUE: es lo que se busca la semana antes de
              la boda —«¿quién dijo que llegaba tarde?»— y no se recuerda con qué
              palabras lo escribió.
            */}
            <Link
              href={alternarDestacados}
              prefetch={false}
              className="mt-interno inline-flex min-h-control-compacto items-center text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
            >
              {soloDestacados
                ? t("panel.mensajes.verTodos")
                : t("panel.mensajes.verSoloDestacados")}
            </Link>

            {visibles.length === 0 ? (
              <Cuerpo className="mt-elemento">
                {soloDestacados && !busqueda
                  ? t("panel.mensajes.sinDestacados")
                  : t("panel.mensajes.sinResultados")}
              </Cuerpo>
            ) : (
              <ul className="mt-elemento grid gap-interno">
                {visibles.map((mensaje) => (
                  <Mensaje
                    key={mensaje.id}
                    mensaje={mensaje}
                    puedeEditar={puedeEditar}
                    filtro={<Filtro busqueda={busqueda} soloDestacados={soloDestacados} />}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="border-t border-borde pt-bloque">
        <Titulo3 como="h2">{t("panel.mensajes.bloquePlaylist")}</Titulo3>

        {canciones.length === 0 ? (
          <Cuerpo className="mt-pila">{t("panel.mensajes.sinCanciones")}</Cuerpo>
        ) : (
          <>
            {/*
              LA LISTA PARA EL DJ, ARRIBA. Es lo que acaba saliendo de aquí, y
              con cien canciones debajo no se encontraría. Lo ve también un
              lector: exportar es leer.
            */}
            <form method="get" action={RUTA_PLAYLIST_EXPORTAR} className="mt-pila">
              <BotonEnvio jerarquia="secundario">
                {t("panel.mensajes.exportarPlaylist")}
              </BotonEnvio>
              <Cuerpo className="mt-linea text-pequeno text-tinta-suave">
                {t("panel.mensajes.exportarPlaylistAyuda")}
              </Cuerpo>
            </form>

            <PorGrupo canciones={canciones} />

            <ul className="mt-elemento grid gap-interno-compacto">
              {canciones.map((cancion) => (
                <Cancion key={cancion.id} cancion={cancion} puedeEditar={puedeEditar} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * CUÁNTAS HA PEDIDO CADA GRUPO, CONTRA EL TOPE. El tope lo pone la base; esto
 * sirve para ver quién ha llegado —y por qué una familia dice que ya no le deja
 * pedir más— y quién está llenando la lista. Cuentan también las ocultas,
 * porque la base las cuenta: ocultar no devuelve la plaza.
 *
 * Plegado: es una consulta de vez en cuando, no lo que se viene a mirar.
 */
function PorGrupo({ canciones }: { canciones: CancionSugerida[] }) {
  const porGrupo = new Map<string, { id: string; nombre: string; cuantas: number }>();
  for (const cancion of canciones) {
    if (!cancion.grupoId) continue;
    const actual = porGrupo.get(cancion.grupoId);
    porGrupo.set(cancion.grupoId, {
      id: cancion.grupoId,
      nombre: cancion.grupoNombre ?? t("panel.mensajes.cancionSinGrupo"),
      cuantas: (actual?.cuantas ?? 0) + 1,
    });
  }
  const grupos = [...porGrupo.values()].sort(
    (a, b) => b.cuantas - a.cuantas || a.nombre.localeCompare(b.nombre, IDIOMA),
  );
  if (grupos.length === 0) return null;

  return (
    <details className="mt-elemento">
      <summary className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca">
        {t("panel.mensajes.porGrupoTitulo")}
      </summary>
      <ul className="mt-pila grid max-w-texto gap-linea">
        {grupos.map((grupo) => (
          <li
            key={grupo.id}
            className="flex flex-wrap items-baseline justify-between gap-interno-compacto text-pequeno"
          >
            <span className="text-tinta">{grupo.nombre}</span>
            <span className="flex items-baseline gap-interno-compacto tabular-nums text-tinta-suave">
              {t("panel.mensajes.porGrupoFila", {
                cuantas: grupo.cuantas,
                tope: TOPE_CANCIONES_POR_GRUPO,
              })}
              {grupo.cuantas >= TOPE_CANCIONES_POR_GRUPO ? (
                <EtiquetaEstado variante="aviso-marcada" tamano="versalita-compacta">
                  {t("panel.mensajes.enElTope")}
                </EtiquetaEstado>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** La búsqueda y el filtro de ahora, para que vuelvan con el acuse de cada acción. */
function Filtro({ busqueda, soloDestacados }: { busqueda: string; soloDestacados: boolean }) {
  return (
    <>
      {busqueda ? <input type="hidden" name="buscar" value={busqueda} /> : null}
      {soloDestacados ? <input type="hidden" name="destacados" value="1" /> : null}
    </>
  );
}

function Mensaje({
  mensaje,
  puedeEditar,
  filtro,
}: {
  mensaje: MensajeInvitado;
  puedeEditar: boolean;
  filtro: React.ReactNode;
}) {
  return (
    <li
      className={`grid gap-pila rounded-tarjeta border p-interno ${
        mensaje.leido ? "border-borde" : "border-borde-marca bg-superficie-tenue"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <Etiqueta>
          {t("panel.mensajes.escritoPor", {
            grupo: mensaje.grupoNombre,
            fecha: formatoFecha.format(mensaje.escritoEn),
          })}
        </Etiqueta>
        <span className="flex flex-wrap gap-interno-compacto">
          {mensaje.destacado ? (
            <EtiquetaEstado variante="aviso-marcada" tamano="versalita">
              {t("panel.mensajes.destacado")}
            </EtiquetaEstado>
          ) : null}
          {mensaje.leido ? null : (
            <EtiquetaEstado variante="marca" tamano="versalita">
              {t("panel.mensajes.nuevo")}
            </EtiquetaEstado>
          )}
        </span>
      </div>

      {/*
        `whitespace-pre-line`: el invitado escribe en un `textarea` y sus saltos
        de línea son parte de lo que quiso decir. Sin esto, tres líneas se
        pegan en un párrafo y una despedida acaba dentro de una frase.
      */}
      <p className="max-w-texto whitespace-pre-line text-cuerpo leading-cuerpo text-tinta">
        {mensaje.texto}
      </p>

      <div className="flex flex-wrap items-center gap-interno">
        {puedeEditar ? (
          <form action={marcarLeido}>
            <input type="hidden" name="confirmacion_id" value={mensaje.id} />
            <input type="hidden" name="leido" value={mensaje.leido ? "1" : "0"} />
            {filtro}
            <BotonEnvio jerarquia="terciario">
              {mensaje.leido
                ? t("panel.mensajes.marcarNoLeido")
                : t("panel.mensajes.marcarLeido")}
            </BotonEnvio>
          </form>
        ) : null}

        {puedeEditar ? (
          <form action={destacarMensaje}>
            <input type="hidden" name="confirmacion_id" value={mensaje.id} />
            <input type="hidden" name="destacado" value={mensaje.destacado ? "1" : "0"} />
            {filtro}
            <BotonEnvio jerarquia="terciario">
              {mensaje.destacado
                ? t("panel.mensajes.quitarDestacado")
                : t("panel.mensajes.destacar")}
            </BotonEnvio>
          </form>
        ) : null}

        {mensaje.grupoId ? (
          <Link
            href={`${RUTA_INVITADOS}/${mensaje.grupoId}`}
            className="inline-flex min-h-control-compacto items-center text-pequeno text-tinta-suave transicion-color hover:text-tinta"
          >
            {t("panel.mensajes.verGrupo")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function Cancion({ cancion, puedeEditar }: { cancion: CancionSugerida; puedeEditar: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-interno rounded-campo border border-borde px-interno py-pila">
      <div>
        <span className={`text-cuerpo ${cancion.aprobada ? "text-tinta" : "text-tinta-suave"}`}>
          {cancion.texto}
        </span>
        <Etiqueta className="mt-linea">
          {cancion.grupoNombre
            ? t("panel.mensajes.cancionDe", { grupo: cancion.grupoNombre })
            : t("panel.mensajes.cancionSinGrupo")}
          {cancion.aprobada ? "" : ` · ${t("panel.mensajes.oculta")}`}
        </Etiqueta>
      </div>

      {puedeEditar ? (
        <form action={moderarCancion}>
          <input type="hidden" name="cancion_id" value={cancion.id} />
          <input type="hidden" name="aprobar" value={cancion.aprobada ? "0" : "1"} />
          <BotonEnvio jerarquia="terciario">
            {cancion.aprobada ? t("panel.mensajes.ocultar") : t("panel.mensajes.mostrar")}
          </BotonEnvio>
        </form>
      ) : null}
    </li>
  );
}
