import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoTexto } from "@/components/ui/campo";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  RUTA_ACCESO,
  RUTA_INVITADOS,
  RUTA_MENSAJES,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerMensajes, type MensajeInvitado } from "@/lib/bbdd/mensajes";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { normalizar } from "@/lib/texto";

import { destacarMensaje, marcarLeido } from "./acciones";
import { AVISOS_MENSAJES, AvisoMensajes } from "./aviso";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.mensajes.titulo") };

/**
 * BODA-112 · LO QUE ESCRIBEN LOS INVITADOS
 *
 * Los mensajes que dejan al confirmar. Llegan por el mismo formulario que las
 * canciones, y antes se guardaban sin que nadie los leyera — que es tanto como
 * no haberlos pedido.
 *
 * LAS CANCIONES SON LA OTRA PESTAÑA (`playlist/page.tsx`). Vivían aquí debajo,
 * con la idea de que las dos cosas contestan «¿me ha dicho alguien algo?»;
 * pero bajo un menú que dice «Mensajes», quien buscaba la lista para el DJ no
 * la encontraba. Las pestañas las dejan a un toque la una de la otra.
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

  const mensajes = await obtenerMensajes();

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

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.mensajes.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.mensajes.descripcion")}</Cuerpo>
      </header>

      <AvisoMensajes avisos={AVISOS_MENSAJES} estado={soloTexto(consulta.estado)} />

      <section>
        <Etiqueta>
          {sinLeer > 0
            ? t("panel.mensajes.sinLeer", { cuantos: sinLeer })
            : t("panel.mensajes.todoLeido")}
        </Etiqueta>

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
    </div>
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
