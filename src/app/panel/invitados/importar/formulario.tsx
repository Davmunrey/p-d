"use client";

import { useActionState } from "react";

import { Boton, BotonEnlace } from "@/components/ui/boton";
import { Cuerpo, Etiqueta, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_INVITADOS } from "@/config/constants";
import { t } from "@/lib/copy";

import { analizarFichero, importar, ESTADO_INICIAL } from "./acciones";

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
/** «1 persona en 1 invitación» y no «1 personas en 1 invitaciones». */
function resumen(filas: { grupo: string }[]): string {
  const grupos = new Set(filas.map((fila) => fila.grupo.toLowerCase())).size;
  return filas.length === 1 && grupos === 1
    ? t("panel.importar.previaResumenUna")
    : t("panel.importar.previaResumen", { personas: filas.length, grupos });
}

export function FormularioImportacion() {
  const [analisis, analizar, analizando] = useActionState(analizarFichero, ESTADO_INICIAL);
  const [envio, enviar, enviando] = useActionState(importar, ESTADO_INICIAL);

  // El resultado de importar manda sobre el del análisis: es el más reciente.
  const estado = envio.fase === "previa" || envio.aviso ? envio : analisis;
  const hayErrores = estado.errores.length > 0;

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
          <p className="text-pequeno text-tinta-tenue">{t("panel.importar.ficheroAyuda")}</p>
        </div>
        <div>
          <Boton type="submit" disabled={analizando}>
            {t("panel.importar.analizar")}
          </Boton>
        </div>
      </form>

      {estado.aviso ? (
        <p
          role="alert"
          className="mt-elemento rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {estado.aviso}
        </p>
      ) : null}

      {estado.columnasIgnoradas.length > 0 ? (
        <Cuerpo className="mt-elemento max-w-texto text-pequeno text-tinta-tenue">
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
          <Titulo3 como="h2">
            {estado.errores.length === 1
              ? t("panel.importar.erroresTituloUna")
              : t("panel.importar.erroresTitulo", { cuantos: estado.errores.length })}
          </Titulo3>
          <Cuerpo className="mt-pila max-w-texto text-pequeno">
            {t("panel.importar.erroresAyuda")}
          </Cuerpo>
          <ul className="mt-elemento grid gap-linea">
            {estado.errores.map((error) => (
              <li key={`${error.linea}-${error.motivo}`} className="text-pequeno text-tinta">
                <span className="text-tinta-tenue tabular-nums">
                  {t("panel.importar.errorLinea", { linea: error.linea })}
                </span>{" "}
                · {error.motivo}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {estado.fase === "previa" && estado.filas.length > 0 ? (
        <section className="mt-bloque">
          <Titulo3 como="h2">{t("panel.importar.previaTitulo")}</Titulo3>
          <Cuerpo className="mt-pila max-w-texto">{resumen(estado.filas)}</Cuerpo>

          <div className="mt-elemento overflow-x-auto">
            <table className="w-full border-collapse text-pequeno">
              <thead>
                <tr className="border-b border-borde text-left">
                  <th className="py-linea pr-interno font-normal text-tinta-tenue">
                    {t("panel.importar.columna.grupo")}
                  </th>
                  <th className="py-linea pr-interno font-normal text-tinta-tenue">
                    {t("panel.importar.columna.nombre")}
                  </th>
                  <th className="py-linea pr-interno font-normal text-tinta-tenue">
                    {t("panel.importar.columna.lado")}
                  </th>
                  <th className="py-linea font-normal text-tinta-tenue">
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
                      {estado.gruposNuevos.includes(fila.grupo) ? (
                        <span className="ml-interno-compacto text-tinta-tenue">
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
            <Etiqueta className="mt-elemento block">
              {t("panel.importar.erroresAyuda")}
            </Etiqueta>
          ) : (
            <form action={enviar} className="mt-elemento flex flex-wrap gap-interno">
              <input type="hidden" name="contenido" value={estado.contenido} />
              <Boton type="submit" disabled={enviando}>
                {t("panel.importar.confirmar")}
              </Boton>
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
