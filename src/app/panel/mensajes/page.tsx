import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, RUTA_ACCESO, RUTA_INVITADOS, ZONA_HORARIA } from "@/config/constants";
import {
  obtenerCancionesTodas,
  obtenerMensajes,
  type CancionSugerida,
  type MensajeInvitado,
} from "@/lib/bbdd/mensajes";
import { t, type ClaveCopy } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { marcarLeido, moderarCancion } from "./acciones";

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
  "cancion-ocultada": { clave: "panel.mensajes.cancionOcultada", error: false },
  "cancion-mostrada": { clave: "panel.mensajes.cancionMostrada", error: false },
  "sin-permiso": { clave: "panel.mensajes.errorSinPermiso", error: true },
  error: { clave: "panel.mensajes.errorGuardar", error: true },
};

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

/** Sin acentos y en minúsculas: se busca como se teclea. */
const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export default async function PaginaMensajes({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const busqueda = soloTexto(consulta.buscar);

  const [mensajes, canciones] = await Promise.all([obtenerMensajes(), obtenerCancionesTodas()]);

  const puedeEditar = acceso.rol !== "lector";
  const aguja = normalizar(busqueda);
  const visibles = busqueda
    ? mensajes.filter(
        (mensaje) =>
          normalizar(mensaje.texto).includes(aguja) ||
          normalizar(mensaje.grupoNombre).includes(aguja),
      )
    : mensajes;

  const sinLeer = mensajes.filter((mensaje) => !mensaje.leido).length;
  const aviso = AVISOS[soloTexto(consulta.estado)];

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
              <CampoTexto
                etiqueta={t("panel.mensajes.buscar")}
                ayuda={t("panel.mensajes.buscarAyuda")}
                name="buscar"
                type="search"
                defaultValue={busqueda}
              />
              <Boton type="submit" jerarquia="secundario">
                {t("panel.mensajes.buscar")}
              </Boton>
            </form>

            {visibles.length === 0 ? (
              <Cuerpo className="mt-elemento">{t("panel.mensajes.sinResultados")}</Cuerpo>
            ) : (
              <ul className="mt-elemento grid gap-interno">
                {visibles.map((mensaje) => (
                  <Mensaje key={mensaje.id} mensaje={mensaje} puedeEditar={puedeEditar} />
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
          <ul className="mt-pila grid gap-interno-compacto">
            {canciones.map((cancion) => (
              <Cancion key={cancion.id} cancion={cancion} puedeEditar={puedeEditar} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Mensaje({ mensaje, puedeEditar }: { mensaje: MensajeInvitado; puedeEditar: boolean }) {
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
        {mensaje.leido ? null : (
          <span className="rounded-etiqueta bg-marca px-interno py-linea text-diminuto uppercase tracking-etiqueta text-tinta-sobre-marca">
            {t("panel.mensajes.nuevo")}
          </span>
        )}
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
            <Boton type="submit" jerarquia="terciario">
              {mensaje.leido
                ? t("panel.mensajes.marcarNoLeido")
                : t("panel.mensajes.marcarLeido")}
            </Boton>
          </form>
        ) : null}

        {mensaje.grupoId ? (
          <Link
            href={`${RUTA_INVITADOS}/${mensaje.grupoId}`}
            className="text-pequeno text-tinta-tenue transicion-color hover:text-tinta"
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
        <span className={`text-cuerpo ${cancion.aprobada ? "text-tinta" : "text-tinta-tenue"}`}>
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
          <Boton type="submit" jerarquia="terciario">
            {cancion.aprobada ? t("panel.mensajes.ocultar") : t("panel.mensajes.mostrar")}
          </Boton>
        </form>
      ) : null}
    </li>
  );
}
