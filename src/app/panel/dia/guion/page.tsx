import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { LARGOS_DE_CAMPO, ORDEN_MAXIMO, RUTA_ACCESO, RUTA_DIA } from "@/config/constants";
import { avisoDe } from "@/lib/avisos";
import { obtenerGuion, type PuntoDelGuion } from "@/lib/bbdd/dia";
import { t, type ClaveCopy } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { borrarPunto, crearPunto, editarPunto } from "./acciones";
import { type EstadoGuion } from "./estado";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.dia.escribir.titulo") };

/**
 * BODA-100 (#67) · DONDE SE ESCRIBE EL GUION
 *
 * Va en su propia pantalla y no debajo de la lista de control, a propósito.
 * Aquélla se usa de pie, con el móvil en una mano y buscando qué toca ahora;
 * cinco campos por punto delante de cada botón de «Marcar hecho» es justo lo
 * que no tiene que estorbar ese día. Ésta se usa sentado, semanas antes.
 *
 * UN LECTOR VE EL GUION PERO NO EL FORMULARIO. La protección de verdad es RLS;
 * esto es no ofrecer algo que va a fallar al enviarlo.
 */
export const dynamic = "force-dynamic";

const AVISOS: Record<EstadoGuion, { clave: ClaveCopy; error: boolean }> = {
  creado: { clave: "panel.dia.escribir.avisos.creado", error: false },
  editado: { clave: "panel.dia.escribir.avisos.editado", error: false },
  borrado: { clave: "panel.dia.escribir.avisos.borrado", error: false },
  hora: { clave: "panel.dia.escribir.avisos.hora", error: true },
  titulo: { clave: "panel.dia.escribir.avisos.titulo", error: true },
  largo: { clave: "panel.dia.escribir.avisos.largo", error: true },
  orden: { clave: "panel.dia.escribir.avisos.orden", error: true },
  "no-existe": { clave: "panel.dia.escribir.avisos.noExiste", error: true },
  "sin-permiso": { clave: "panel.dia.escribir.avisos.sinPermiso", error: true },
  error: { clave: "panel.dia.escribir.avisos.error", error: true },
};

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

export default async function PaginaEscribirGuion({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const aviso = avisoDe(AVISOS, soloTexto(consulta.estado));
  const abierto = soloTexto(consulta.punto);

  const guion = await obtenerGuion();
  const puedeEditar = acceso.rol !== "lector";

  // El alta propone el siguiente orden: quien escribe el guion de arriba abajo
  // no tiene que ir contando.
  const siguiente = Math.min(
    guion.reduce((mayor, punto) => Math.max(mayor, punto.orden), -1) + 1,
    ORDEN_MAXIMO,
  );

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <EnlaceSuave href={RUTA_DIA} discreto>
          {t("panel.dia.escribir.volver")}
        </EnlaceSuave>
        <Titulo2 como="h1" className="mt-pila">
          {t("panel.dia.escribir.titulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("panel.dia.escribir.entradilla")}</Cuerpo>
      </header>

      {aviso ? (
        <p
          role={aviso.error ? "alert" : "status"}
          className={`max-w-texto rounded-campo p-interno text-pequeno ${
            aviso.error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
          }`}
        >
          {t(aviso.clave)}
        </p>
      ) : null}

      {/*
        PRIMERO EL GUION, Y EL ALTA DEBAJO, como la línea siguiente de una lista:
        el orden propuesto es el siguiente al último, así que lo que se añade
        aparece justo encima de donde se ha escrito. Todo al ancho del texto:
        a lo ancho del escritorio, «Quitar» quedaba lejos del punto que quita.
      */}
      <section className="max-w-texto">
        <Titulo3 como="h2">{t("panel.dia.escribir.listaTitulo")}</Titulo3>
        {guion.length === 0 ? (
          <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-suave">
            {t("panel.dia.escribir.vacio")}
          </Cuerpo>
        ) : (
          <ol className="mt-elemento grid gap-interno">
            {guion.map((punto) => (
              <Punto
                key={punto.id}
                punto={punto}
                puedeEditar={puedeEditar}
                abierto={punto.id === abierto}
              />
            ))}
          </ol>
        )}
      </section>
      {puedeEditar ? (
        <section className="max-w-texto">
          <Titulo3 como="h2">{t("panel.dia.escribir.nuevoTitulo")}</Titulo3>
          <form action={crearPunto} className="mt-elemento grid gap-interno">
            <CamposPunto orden={siguiente} />
            <div>
              <BotonEnvio>{t("panel.dia.escribir.anadir")}</BotonEnvio>
            </div>
          </form>
        </section>
      ) : (
        <Cuerpo className="max-w-texto text-pequeno text-tinta-suave">
          {t("panel.dia.escribir.soloMirar")}
        </Cuerpo>
      )}
    </div>
  );
}

function Punto({
  punto,
  puedeEditar,
  abierto,
}: {
  punto: PuntoDelGuion;
  puedeEditar: boolean;
  abierto: boolean;
}) {
  const corregir = t("panel.dia.escribir.editarEste", { titulo: punto.titulo });
  return (
    <li className="rounded-campo border border-borde p-elemento">
      {/*
        LA HORA ENCIMA DEL TÍTULO, SIEMPRE. En la misma línea, cada punto caía
        como le venía: «15:00 Entrada al banquete» en una fila y, al lado, «al
        acabar la ceremonia» empujando el título a la siguiente. Apiladas, la
        lista se lee igual en todos y como en «El día de la boda».
      */}
      <div className="flex flex-wrap items-start justify-between gap-x-elemento gap-y-linea">
        <div className="min-w-0">
          <span className="block text-cuerpo-grande tabular-nums text-tinta-marca">
            {punto.hora}
          </span>
          <span className="mt-linea block text-cuerpo text-tinta">{punto.titulo}</span>
        </div>
        {punto.hechoEn ? (
          <EtiquetaEstado variante="contorno" tamano="versalita">
            {t("panel.dia.escribir.hecho")}
          </EtiquetaEstado>
        ) : null}
      </div>
      {punto.responsable ? (
        <p className="mt-linea text-pequeno text-tinta-suave">
          {t("panel.dia.guion.responsable", { nombre: punto.responsable })}
        </p>
      ) : null}
      {punto.notas ? (
        <p className="mt-linea max-w-texto text-pequeno text-tinta-suave">{punto.notas}</p>
      ) : null}

      {puedeEditar ? (
        <div className="mt-interno-compacto flex flex-wrap items-start gap-x-elemento">
          <details open={abierto} className="grow">
            <summary
              aria-label={corregir}
              className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-suave underline decoration-borde-fuerte underline-offset-4 transicion-color hover:text-tinta hover:decoration-borde-marca"
            >
              {t("panel.dia.escribir.editar")}
            </summary>
            <form
              action={editarPunto}
              aria-label={corregir}
              className="mt-elemento grid max-w-texto gap-interno"
            >
              <input type="hidden" name="id" value={punto.id} />
              <CamposPunto punto={punto} orden={punto.orden} />
              <div>
                <BotonEnvio jerarquia="secundario">
                  {t("panel.dia.escribir.guardar")}
                </BotonEnvio>
              </div>
            </form>
          </details>
          <form action={borrarPunto}>
            <input type="hidden" name="id" value={punto.id} />
            <BotonEnvio
              jerarquia="terciario"
              aria-label={t("panel.dia.escribir.borrarEste", { titulo: punto.titulo })}
            >
              {t("panel.dia.escribir.borrar")}
            </BotonEnvio>
          </form>
        </div>
      ) : null}
    </li>
  );
}

/** Los mismos campos en el alta y en la corrección, con los topes de la base. */
function CamposPunto({ punto, orden }: { punto?: PuntoDelGuion; orden: number }) {
  return (
    <>
      <CampoTexto
        etiqueta={t("panel.dia.escribir.campoHora")}
        ayuda={t("panel.dia.escribir.campoHoraAyuda")}
        name="hora"
        required
        maxLength={LARGOS_DE_CAMPO["guion_dia.hora"]}
        defaultValue={punto?.hora ?? ""}
      />
      <CampoTexto
        etiqueta={t("panel.dia.escribir.campoTitulo")}
        name="titulo"
        required
        maxLength={LARGOS_DE_CAMPO["guion_dia.titulo"]}
        defaultValue={punto?.titulo ?? ""}
      />
      <CampoTexto
        etiqueta={t("panel.dia.escribir.campoResponsable")}
        ayuda={t("panel.dia.escribir.campoResponsableAyuda")}
        name="responsable"
        maxLength={LARGOS_DE_CAMPO["guion_dia.responsable"]}
        defaultValue={punto?.responsable ?? ""}
      />
      <CampoTextoLargo
        etiqueta={t("panel.dia.escribir.campoNotas")}
        name="notas"
        rows={2}
        maxLength={LARGOS_DE_CAMPO["guion_dia.notas"]}
        defaultValue={punto?.notas ?? ""}
      />
      <CampoTexto
        etiqueta={t("panel.dia.escribir.campoOrden")}
        ayuda={t("panel.dia.escribir.campoOrdenAyuda")}
        name="orden"
        type="number"
        min={0}
        max={ORDEN_MAXIMO}
        step={1}
        defaultValue={String(orden)}
      />
    </>
  );
}
