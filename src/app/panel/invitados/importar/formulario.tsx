"use client";

import { useActionState } from "react";

import { BotonEnlace } from "@/components/ui/boton";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { Cuerpo, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_INVITADOS } from "@/config/constants";
import { t } from "@/lib/copy";

import { analizarFichero, importar } from "./acciones";
import { ESTADO_INICIAL, estadoVigente } from "./estado";

/**
 * BODA-53 · SUBIR, MIRAR, IMPORTAR
 *
 * Dos pasos con el mismo estado: se sube un fichero, se enseña qué saldría de
 * él, y sólo entonces aparece el botón de dar de alta. El botón NO aparece si
 * hay una sola fila con problemas — que es el criterio del ticket hecho
 * interfaz: no hay forma de importar media lista aunque se quiera.
 *
 * POR QUÉ ESTA PANTALLA SÍ NECESITA JAVASCRIPT, Y EL RSVP NO.
 *
 * La vista previa es una respuesta del servidor que hay que enseñar sin haber
 * escrito nada todavía, y eso son dos pasos que comparten un estado que no
 * cabe en una URL. El RSVP no puede permitírselo: lo abre un invitado desde
 * WhatsApp, en un móvil prestado, y por eso allí cada paso es una navegación
 * completa. Aquí entran dos personas desde su portátil, con sesión iniciada.
 *
 * Aun así no se deja a nadie mirando una pantalla muerta: sin JavaScript, el
 * `<noscript>` dice qué pasa y ofrece la otra vía, que existe y funciona.
 */
/**
 * «1 persona en 1 invitación», «3 personas en 1 invitación» y no «3 personas en
 * 1 invitaciones». Las invitaciones las cuenta el servidor con el criterio de
 * la base: contarlas aquí por el nombre en minúsculas daba dos para «Familia
 * Pérez» y «Familia Perez», que la base junta en una.
 */
function resumen(personas: number, invitaciones: number): string {
  if (invitaciones === 1) {
    return personas === 1
      ? t("panel.importar.previaResumenUna")
      : t("panel.importar.previaResumenUnaInvitacion", { personas });
  }
  return t("panel.importar.previaResumen", { personas, grupos: invitaciones });
}

export function FormularioImportacion() {
  const [analisis, analizar, analizando] = useActionState(analizarFichero, ESTADO_INICIAL);
  const [envio, enviar, enviando] = useActionState(importar, ESTADO_INICIAL);

  // El más reciente de los dos, decidido por serie y no por contenido: ver
  // `estadoVigente`, que es donde está explicado y probado.
  const estado = estadoVigente(analisis, envio);
  const hayErrores = estado.errores.length > 0;
  const tituloErrores =
    estado.errores.length === 1
      ? t("panel.importar.erroresTituloUna")
      : t("panel.importar.erroresTitulo", { cuantos: estado.errores.length });
  const hayPrevia = estado.fase === "previa" && estado.filas.length > 0;
  const resumenPrevia = resumen(estado.filas.length, estado.invitaciones);

  return (
    <>
      <noscript>
        <p className="mt-elemento rounded-tarjeta border border-borde-marca bg-superficie-tenue p-interno text-pequeno text-tinta">
          {t("panel.importar.sinJavascript")}
        </p>
      </noscript>

      <form action={analizar} className="mt-bloque grid max-w-texto gap-interno">
        <div className="grid gap-interno-compacto">
          <label
            htmlFor="fichero"
            className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
          >
            {t("panel.importar.fichero")}
          </label>
          <input
            id="fichero"
            name="fichero"
            type="file"
            accept=".csv,text/csv,text/plain"
            required
            className="min-h-campo w-full rounded-campo border border-borde bg-superficie px-interno py-linea text-pequeno text-tinta file:mr-interno file:rounded-boton file:border-0 file:bg-superficie-hundida file:px-interno file:py-linea file:text-etiqueta file:uppercase file:tracking-boton file:text-tinta-marca"
          />
          <p className="text-pequeno text-tinta-suave">{t("panel.importar.ficheroAyuda")}</p>
        </div>
        <div>
          <BotonEnvio disabled={analizando}>{t("panel.importar.analizar")}</BotonEnvio>
        </div>
      </form>

      {/*
        LO QUE HA SALIDO DEL ANÁLISIS, DICHO EN ALTO. Los errores y la vista
        previa aparecen debajo sin mover el foco, y quien no ve la pantalla no
        sabía si el análisis había terminado, ni si había algo que arreglar o un
        botón de importar más abajo. El aviso suelto ya va en `role="alert"`.
        La región existe siempre, vacía o no: un lector sólo anuncia los
        cambios de una región que ya estaba.
      */}
      <p role="status" className="sr-only">
        {hayErrores ? tituloErrores : hayPrevia ? resumenPrevia : ""}
      </p>

      {estado.aviso ? (
        <p
          role="alert"
          className="mt-elemento rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {estado.aviso}
        </p>
      ) : null}

      {estado.columnasIgnoradas.length > 0 ? (
        <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-suave">
          {t("panel.importar.ignoradas", { columnas: estado.columnasIgnoradas.join(", ") })}
        </Cuerpo>
      ) : null}

      {/*
        LOS ERRORES VAN PRIMERO Y CON SU NÚMERO DE FILA.

        El número es el de la hoja de cálculo —la cabecera es la 1— para poder
        abrirla, ir a esa fila y arreglarla sin contar líneas a mano.
      */}
      {hayErrores ? (
        <section className="mt-bloque rounded-tarjeta border border-borde bg-error-fondo p-interno">
          <Titulo3 como="h2">{tituloErrores}</Titulo3>
          <Cuerpo className="mt-pila max-w-texto text-pequeno">
            {t("panel.importar.erroresAyuda")}
          </Cuerpo>
          <ul className="mt-elemento grid gap-linea">
            {estado.errores.map((error) => (
              <li key={`${error.linea}-${error.motivo}`} className="text-pequeno text-tinta">
                <span className="text-tinta-suave tabular-nums">
                  {t("panel.importar.errorLinea", { linea: error.linea })}
                </span>{" "}
                · {error.motivo}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hayPrevia ? (
        <section className="mt-bloque">
          <Titulo3 como="h2">{t("panel.importar.previaTitulo")}</Titulo3>
          <Cuerpo className="mt-pila max-w-texto">{resumenPrevia}</Cuerpo>

          <div className="mt-elemento overflow-x-auto">
            <table className="w-full border-collapse text-pequeno">
              <thead>
                <tr className="border-b border-borde text-left">
                  <th className="py-linea pr-interno font-normal text-tinta-suave">
                    {t("panel.importar.columna.grupo")}
                  </th>
                  <th className="py-linea pr-interno font-normal text-tinta-suave">
                    {t("panel.importar.columna.nombre")}
                  </th>
                  <th className="py-linea pr-interno font-normal text-tinta-suave">
                    {t("panel.importar.columna.lado")}
                  </th>
                  <th className="py-linea font-normal text-tinta-suave">
                    {t("panel.importar.columna.nino")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {estado.filas.map((fila, indice) => (
                  <tr
                    key={`${fila.grupo}-${fila.nombre}-${indice}`}
                    className="border-b border-borde"
                  >
                    <td className="py-linea pr-interno text-tinta">
                      {fila.grupo}
                      {/* Lo decide el servidor con el criterio de la base:
                          «Familia Perez» y «familia pérez» son la misma. */}
                      {estado.nuevas[indice] ? (
                        <span className="ml-interno-compacto text-tinta-suave">
                          {t("panel.importar.grupoNuevo")}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-linea pr-interno text-tinta">
                      {[fila.nombre, fila.apellidos].filter(Boolean).join(" ")}
                    </td>
                    <td className="py-linea pr-interno text-tinta-suave">
                      {t(`panel.invitados.lados.${fila.lado}` as "panel.invitados.lados.ambos")}
                    </td>
                    <td className="py-linea text-tinta-suave">
                      {fila.nino ? t("panel.invitados.si") : t("panel.invitados.no")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/*
            El botón sólo existe si no hay ni un error. No se deshabilita: se
            quita. Un botón gris que no se sabe por qué no responde es peor que
            no tenerlo, y la lista de arriba ya dice exactamente qué arreglar.
          */}
          {hayErrores ? (
            <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-suave">
              {t("panel.importar.previaSinBoton")}
            </Cuerpo>
          ) : (
            <form action={enviar} className="mt-elemento flex flex-wrap gap-interno">
              <input type="hidden" name="contenido" value={estado.contenido} />
              <input type="hidden" name="serie" value={estado.serie} />
              <BotonEnvio disabled={enviando}>{t("panel.importar.confirmar")}</BotonEnvio>
              <BotonEnlace href={RUTA_INVITADOS} jerarquia="terciario">
                {t("panel.importar.cancelar")}
              </BotonEnlace>
            </form>
          )}
        </section>
      ) : null}
    </>
  );
}
