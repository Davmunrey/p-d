import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, RUTA_ACCESO, RUTA_DIA, ZONA_HORARIA } from "@/config/constants";
import {
  obtenerAlergiasPorMesa,
  obtenerCabezas,
  obtenerRecuento,
  type LineaDelRecuento,
} from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { AvisoDia } from "../aviso";
import { corregirRecuento } from "../acciones";

import { CopiarRecuento } from "./copiar";

/**
 * BODA-103 (#70) · EL RECUENTO EN VIVO PARA EL CATERING
 *
 * La cifra que se pide la víspera y que hay que poder rectificar el mismo día
 * cuando alguien falla. Tres cosas que parecen una sola y no lo son:
 *
 *   1. CUÁNTOS MENÚS DE CADA TIPO. Lo suma `v_recuento_catering`, que es la
 *      única definición de ese total en el proyecto.
 *   2. CUÁNTAS CABEZAS, con los niños aparte. No sale del menú: sale de
 *      `es_nino`, porque un menor puede llevar menú sin gluten y contarlo por
 *      «infantil» daría de menos justo en la cifra de las tronas.
 *   3. QUIÉN NO PUEDE COMER QUÉ, y en qué mesa está. «Dos celíacos» no le sirve
 *      a quien reparte platos; «mesa 4, María» sí.
 *
 * LA CORRECCIÓN NO TOCA LA CONFIRMACIÓN DE NADIE, y eso es media razón de ser
 * del módulo. Quien dijo que venía y falla a última hora dijo que venía: ese
 * dato es suyo y no se reescribe. Lo que cambia es lo que se le pide al
 * catering, que vive en otra tabla y se suma en la vista.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

/**
 * Cuándo se generó, en la zona de la boda.
 *
 * NUNCA EN LA DEL SERVIDOR. Esto corre en Vercel, que va en UTC: en verano son
 * dos horas menos que en la finca, y «actualizado a las 12:40» cuando son las
 * 14:40 es peor que no poner la hora.
 */
const formatoMomento = new Intl.DateTimeFormat(IDIOMA, {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: ZONA_HORARIA,
});

const nombreDelMenu = (tipoMenu: string) =>
  t(`rsvp.menus.${tipoMenu}` as "rsvp.menus.estandar");

export default async function PaginaRecuento({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;

  const [lineas, cabezas, alergias] = await Promise.all([
    obtenerRecuento(),
    obtenerCabezas(),
    obtenerAlergiasPorMesa(),
  ]);

  const puedeEditar = acceso.rol !== "lector";
  const totalMenus = lineas.reduce((suma, linea) => suma + linea.total, 0);

  return (
    <>
      <div className="max-w-texto">
        <Link href={RUTA_DIA} className="text-pequeno text-tinta-suave underline">
          {t("panel.dia.volver")}
        </Link>
        <Titulo2 como="h1" className="mt-pila">
          {t("panel.dia.recuento.titulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("panel.dia.recuento.entradilla")}</Cuerpo>
      </div>

      <AvisoDia estado={soloTexto(consulta.estado)} />

      {lineas.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto text-pequeno text-tinta-suave">
          {t("panel.dia.recuento.vacio")}
        </Cuerpo>
      ) : (
        <>
          <TablaDelRecuento lineas={lineas} totalMenus={totalMenus} />
          <Cabezas cabezas={cabezas} />
          <CopiarRecuento texto={mensajeParaElCatering({ lineas, cabezas, totalMenus })} />
        </>
      )}

      {puedeEditar ? <Corregir lineas={lineas} /> : null}

      <Alergias alergias={alergias} />
    </>
  );
}

function TablaDelRecuento({
  lineas,
  totalMenus,
}: {
  lineas: LineaDelRecuento[];
  totalMenus: number;
}) {
  return (
    <div className="mt-bloque overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{t("panel.dia.recuento.titulo")}</caption>
        <thead>
          <tr>
            {[
              t("panel.dia.recuento.columnaMenu"),
              t("panel.dia.recuento.columnaConfirmados"),
              t("panel.dia.recuento.columnaAjuste"),
              t("panel.dia.recuento.columnaTotal"),
            ].map((titulo) => (
              <th
                key={titulo}
                scope="col"
                className="border-b border-borde-fuerte px-interno py-interno-compacto text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
              >
                {titulo}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {lineas.map((linea) => (
            <tr key={linea.tipoMenu}>
              <th
                scope="row"
                className="border-b border-borde px-interno py-interno-compacto text-left align-top text-cuerpo text-tinta"
              >
                {nombreDelMenu(linea.tipoMenu)}
                {linea.conAlergias > 0 ? (
                  <span className="mt-pila block text-pequeno text-tinta-suave">
                    {t("panel.dia.recuento.conAlergias", { numero: linea.conAlergias })}
                  </span>
                ) : null}
              </th>

              <td className="border-b border-borde px-interno py-interno-compacto align-top text-cuerpo tabular-nums text-tinta">
                {linea.confirmados}
              </td>

              <td className="border-b border-borde px-interno py-interno-compacto align-top text-cuerpo tabular-nums text-tinta">
                {/*
                  EL SIGNO SE ESCRIBE SIEMPRE, también el más. «2» y «+2» se
                  leen distinto de un vistazo, y esta columna es exactamente la
                  que alguien mira para saber si ha tocado algo.
                */}
                {linea.ajuste === 0 ? "" : linea.ajuste > 0 ? `+${linea.ajuste}` : linea.ajuste}
                {linea.nota ? (
                  <span className="mt-pila block text-pequeno text-tinta-suave">
                    {linea.nota}
                  </span>
                ) : null}
                {linea.corregidoEn ? (
                  <span className="mt-pila block text-pequeno text-tinta-suave">
                    {t("panel.dia.recuento.corregidoEl", {
                      fecha: formatoMomento.format(new Date(linea.corregidoEn)),
                    })}
                  </span>
                ) : null}
              </td>

              <td className="border-b border-borde px-interno py-interno-compacto align-top text-titulo-3 tabular-nums text-tinta">
                {linea.total}
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <th
              scope="row"
              className="px-interno py-interno-compacto text-left text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
            >
              {t("panel.dia.recuento.total")}
            </th>
            <td />
            <td />
            <td className="px-interno py-interno-compacto text-titulo-3 tabular-nums text-tinta">
              {totalMenus}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Cabezas({
  cabezas,
}: {
  cabezas: { ninos: number; adultos: number; sinContestar: number };
}) {
  return (
    <dl className="mt-bloque grid grid-cols-3 gap-interno">
      {[
        { clave: "panel.dia.recuento.adultos", valor: cabezas.adultos },
        { clave: "panel.dia.recuento.ninos", valor: cabezas.ninos },
        { clave: "panel.dia.recuento.sinContestar", valor: cabezas.sinContestar },
      ].map((dato) => (
        <div key={dato.clave} className="rounded-campo border border-borde p-elemento">
          <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
            {t(dato.clave as "panel.dia.recuento.adultos")}
          </dt>
          <dd className="mt-pila text-titulo-2 tabular-nums text-tinta">{dato.valor}</dd>

          {/*
            EL AVISO QUE EVITA EL ERROR CARO, y va pegado a la cifra que lo
            necesita. Quien no ha contestado no está sumado a ningún menú; sin
            esta línea, alguien suma los tres números de esta fila, se los canta
            al catering y encarga comida de más.
          */}
          {dato.clave === "panel.dia.recuento.sinContestar" && dato.valor > 0 ? (
            <dd className="mt-pila text-pequeno text-tinta-suave">
              {t("panel.dia.recuento.sinContestarAviso")}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

function Corregir({ lineas }: { lineas: LineaDelRecuento[] }) {
  return (
    <section className="mt-bloque max-w-texto" aria-labelledby="corregir-recuento">
      <Titulo3 como="h2" id="corregir-recuento">
        {t("panel.dia.recuento.corregirTitulo")}
      </Titulo3>
      <Cuerpo className="mt-pila text-pequeno text-tinta-suave">
        {t("panel.dia.recuento.corregirAyuda")}
      </Cuerpo>

      <form action={corregirRecuento} className="mt-elemento grid gap-elemento">
        <CampoSeleccion
          etiqueta={t("panel.dia.recuento.campoMenu")}
          name="tipo_menu"
          defaultValue={lineas[0]?.tipoMenu ?? ""}
          required
        >
          {lineas.map((linea) => (
            <option key={linea.tipoMenu} value={linea.tipoMenu}>
              {nombreDelMenu(linea.tipoMenu)}
            </option>
          ))}
        </CampoSeleccion>

        {/*
          `inputMode="numeric"` y no `type="number"`: el menos hay que poder
          escribirlo, y los controles de subir y bajar de un campo numérico son
          justo lo que no se acierta con el pulgar.
        */}
        <CampoTexto
          etiqueta={t("panel.dia.recuento.campoAjuste")}
          name="ajuste"
          inputMode="numeric"
          defaultValue="0"
          required
        />

        <CampoTexto etiqueta={t("panel.dia.recuento.campoNota")} name="nota" />

        <div>
          <Boton type="submit">{t("panel.dia.recuento.guardar")}</Boton>
        </div>
      </form>
    </section>
  );
}

function Alergias({
  alergias,
}: {
  alergias: Awaited<ReturnType<typeof obtenerAlergiasPorMesa>>;
}) {
  return (
    <section className="mt-bloque" aria-labelledby="alergias-por-mesa">
      <Titulo3 como="h2" id="alergias-por-mesa">
        {t("panel.dia.recuento.alergiasTitulo")}
      </Titulo3>

      {alergias.length === 0 ? (
        <Cuerpo className="mt-pila text-pequeno text-tinta-suave">
          {t("panel.dia.recuento.alergiasVacio")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno-compacto">
          {alergias.map((fila, indice) => (
            <li
              key={`${fila.nombre}-${indice}`}
              className="flex flex-wrap items-baseline gap-interno rounded-campo border border-borde p-interno"
            >
              <Etiqueta>{fila.mesa ?? t("panel.dia.buscar.sinMesa")}</Etiqueta>
              <span className="text-cuerpo text-tinta">
                {[fila.nombre, fila.apellidos].filter(Boolean).join(" ")}
              </span>
              <span className="rounded-etiqueta bg-aviso-fondo px-interno-compacto py-linea text-pequeno text-aviso-tinta">
                {fila.alergias}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * El mensaje que se pega en WhatsApp.
 *
 * SE ARMA EN EL SERVIDOR, con los mismos números que pinta la tabla de arriba.
 * Rehacerlo en el navegador sería tener dos versiones del mismo mensaje, y un
 * día dirían cosas distintas.
 *
 * LLEVA LA HORA DENTRO porque el mensaje sobrevive a la pantalla: se reenvía,
 * se cita dos días después y alguien lo lee sin saber de cuándo es. «102 menús»
 * sin fecha no es un dato, es un rumor.
 */
function mensajeParaElCatering({
  lineas,
  cabezas,
  totalMenus,
}: {
  lineas: LineaDelRecuento[];
  cabezas: { ninos: number; adultos: number; sinContestar: number };
  totalMenus: number;
}): string {
  const renglones = [
    `${t("panel.dia.recuento.titulo")} · ${formatoMomento.format(new Date())}`,
    "",
    ...lineas.map((linea) => `${nombreDelMenu(linea.tipoMenu)}: ${linea.total}`),
    "",
    `${t("panel.dia.recuento.total")}: ${totalMenus}`,
    `${t("panel.dia.recuento.adultos")}: ${cabezas.adultos}`,
    `${t("panel.dia.recuento.ninos")}: ${cabezas.ninos}`,
  ];

  if (cabezas.sinContestar > 0) {
    renglones.push(
      `${t("panel.dia.recuento.sinContestar")}: ${cabezas.sinContestar} — ${t(
        "panel.dia.recuento.sinContestarAviso",
      )}`,
    );
  }

  return renglones.join("\n");
}
