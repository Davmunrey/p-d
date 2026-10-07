import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  RUTA_ACCESO,
  RUTA_PLAYLIST_EXPORTAR,
  TOPE_CANCIONES_POR_GRUPO,
} from "@/config/constants";
import { obtenerCancionesTodas, type CancionSugerida } from "@/lib/bbdd/mensajes";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { moderarCancion } from "../acciones";
import { AVISOS_PLAYLIST, AvisoMensajes } from "../aviso";

export const metadata: Metadata = { title: t("panel.mensajes.playlistTitulo") };

/**
 * BODA-113 · LA PLAYLIST: LAS CANCIONES QUE PIDEN LOS INVITADOS
 *
 * Llegan por el mismo formulario que los mensajes y vivían en la misma
 * pantalla, debajo de todos ellos y bajo un menú que decía «Mensajes»: quien
 * buscaba la lista para el DJ no la encontraba. Ahora es la segunda pestaña
 * del módulo, con su título y su dirección.
 *
 * Retirar una canción no la borra: deja de verse en la web y en la lista para
 * el DJ, y se puede devolver. Las acciones vuelven aquí con su aviso.
 *
 * NO SE CACHEA: cambia cada vez que alguien confirma.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

export default async function PaginaPlaylist({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const canciones = await obtenerCancionesTodas();
  const puedeEditar = acceso.rol !== "lector";

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.mensajes.playlistTitulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.mensajes.playlistDescripcion")}</Cuerpo>
      </header>

      <AvisoMensajes avisos={AVISOS_PLAYLIST} estado={soloTexto(consulta.estado)} />

      <section>
        {canciones.length === 0 ? (
          <Cuerpo>{t("panel.mensajes.sinCanciones")}</Cuerpo>
        ) : (
          <>
            {/*
              LA LISTA PARA EL DJ, ARRIBA. Es lo que acaba saliendo de aquí, y
              con cien canciones debajo no se encontraría. Lo ve también un
              lector: exportar es leer.
            */}
            <form method="get" action={RUTA_PLAYLIST_EXPORTAR}>
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
