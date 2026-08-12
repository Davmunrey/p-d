import Link from "next/link";
import { redirect } from "next/navigation";

import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  RUTA_ACCESO,
  RUTA_DIA,
  RUTA_MESAS_EXPORTAR,
  ZONA_HORARIA,
} from "@/config/constants";
import {
  obtenerAgendaDelDia,
  obtenerInvitadosDelDia,
  type InvitadoDelDia,
} from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

/**
 * BODA-104 (#71) · LLEVÁRSELO EN PAPEL
 *
 * El plan B de todo lo demás. En una finca sin cobertura lo único que funciona
 * seguro es una hoja impresa, y esta pantalla es esa hoja.
 *
 * SON DOS COSAS DISTINTAS Y AQUÍ SE OFRECEN LAS DOS:
 *
 *   · La HOJA DE CÁLCULO, para mandársela a la finca o al catering. No se
 *     escribe otra vez: es la misma exportación de mesas (BODA-84), que ya sale
 *     con `;` y con BOM para que Excel abra «Zubeldía» sin romperlo. Escribir un
 *     segundo CSV con las mismas columnas sería tener dos ficheros que un día se
 *     contradicen.
 *   · El PAPEL, que es esta pantalla. Ordenada por mesa, con el menú y las
 *     alergias de cada uno, y con la agenda de teléfonos detrás — porque quien
 *     se lleva esto en el bolsillo también necesita a quién llamar.
 *
 * LA FECHA Y LA HORA, ARRIBA Y GRANDES. Es un criterio del ticket y tiene su
 * razón: esto es una foto fija. Una hoja impresa a las once no sabe que a las
 * doce cambiaron a tres personas de mesa, y quien la lee tiene que poder saber
 * de cuándo es sin preguntarle a nadie.
 */
export const dynamic = "force-dynamic";

const formatoMomento = new Intl.DateTimeFormat(IDIOMA, {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: ZONA_HORARIA,
});

export default async function PaginaExportarDelDia() {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const [invitados, proveedores] = await Promise.all([
    obtenerInvitadosDelDia(),
    obtenerAgendaDelDia(),
  ]);

  const porMesa = agruparPorMesa(invitados);
  const generado = formatoMomento.format(new Date());

  return (
    <>
      {/*
        LOS CONTROLES NO SE IMPRIMEN. `print:hidden` es el mismo mecanismo que
        usa el plano de mesas: la hoja que sale de la impresora es la lista, no
        los botones para llegar a ella.
      */}
      <div className="max-w-texto print:hidden">
        <Link href={RUTA_DIA} className="text-pequeno text-tinta-suave underline">
          {t("panel.dia.volver")}
        </Link>
        <Titulo2 como="h1" className="mt-pila">
          {t("panel.dia.exportar.titulo")}
        </Titulo2>
        <Cuerpo className="mt-pila">{t("panel.dia.exportar.entradilla")}</Cuerpo>

        <div className="mt-bloque grid gap-elemento sm:grid-cols-2">
          <div>
            <a
              href={RUTA_MESAS_EXPORTAR}
              className="inline-flex min-h-control items-center rounded-boton bg-accion px-elemento text-etiqueta uppercase tracking-boton text-tinta-sobre-accion transicion-color hover:bg-accion-hover"
            >
              {t("panel.dia.exportar.descargar")}
            </a>
            <p className="mt-pila text-pequeno text-tinta-suave">
              {t("panel.dia.exportar.descargarAyuda")}
            </p>
          </div>

          <div>
            <Etiqueta>{t("panel.dia.exportar.imprimir")}</Etiqueta>
            <p className="mt-pila text-pequeno text-tinta-suave">
              {t("panel.dia.exportar.imprimirAyuda")}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-bloque text-cuerpo text-tinta">
        <strong>{t("panel.dia.exportar.generadoEl", { fecha: generado })}</strong>{" "}
        <span className="text-tinta-suave">{t("panel.dia.exportar.esUnaFotoFija")}</span>
      </p>

      {porMesa.map(([mesa, gente]) => (
        <section key={mesa} className="mt-bloque break-inside-avoid">
          <Titulo3 como="h2">{mesa}</Titulo3>

          <table className="mt-elemento w-full border-collapse text-left">
            <thead>
              <tr>
                {[
                  t("panel.dia.buscar.campo"),
                  t("panel.dia.buscar.menu"),
                  t("panel.dia.buscar.alergias"),
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
              {gente.map((invitado) => (
                <tr key={invitado.id}>
                  <td className="border-b border-borde px-interno py-interno-compacto align-top text-cuerpo text-tinta">
                    {[invitado.nombre, invitado.apellidos].filter(Boolean).join(" ")}
                    {invitado.esNino ? (
                      <span className="text-tinta-suave"> · {t("panel.dia.buscar.nino")}</span>
                    ) : null}
                    {!invitado.confirmado ? (
                      <span className="block text-pequeno text-tinta-suave">
                        {t("panel.dia.buscar.sinConfirmar")}
                      </span>
                    ) : null}
                  </td>
                  <td className="border-b border-borde px-interno py-interno-compacto align-top text-cuerpo text-tinta">
                    {t(`rsvp.menus.${invitado.tipoMenu}` as "rsvp.menus.estandar")}
                  </td>
                  <td className="border-b border-borde px-interno py-interno-compacto align-top text-cuerpo text-tinta">
                    {invitado.alergias ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {proveedores.length > 0 ? (
        <section className="mt-bloque break-inside-avoid">
          <Titulo3 como="h2">{t("panel.dia.exportar.contactos")}</Titulo3>
          <ul className="mt-elemento grid gap-interno-compacto">
            {proveedores.map((proveedor) => (
              <li key={proveedor.id} className="text-cuerpo text-tinta">
                <strong>{proveedor.nombre}</strong>
                {proveedor.categoria ? (
                  <span className="text-tinta-suave"> · {proveedor.categoria}</span>
                ) : null}
                {/*
                  EN PAPEL LOS NÚMEROS SE ESCRIBEN, no se enlazan: aquí no hay
                  nada que pulsar. Van todos seguidos y separados por punto y
                  coma, que es como se leen en voz alta cuando alguien los dicta.
                */}
                {telefonosDe(proveedor).length > 0 ? (
                  <span className="block tabular-nums text-tinta-suave">
                    {telefonosDe(proveedor).join(" · ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/**
 * Los invitados repartidos por mesa, en el orden en que se montan las mesas.
 *
 * QUIEN NO TIENE MESA VA AL FINAL Y NO DESAPARECE. Es la mitad del listado que
 * de verdad hay que mirar cuando el reparto está a medias, y una hoja que sólo
 * enseñe lo colocado da la impresión de estar terminada.
 */
function agruparPorMesa(invitados: InvitadoDelDia[]): [string, InvitadoDelDia[]][] {
  const sinMesa = t("panel.dia.exportar.mesaSinNombre");
  const mesas = new Map<string, InvitadoDelDia[]>();

  for (const invitado of invitados) {
    const clave = invitado.mesa ?? sinMesa;
    mesas.set(clave, [...(mesas.get(clave) ?? []), invitado]);
  }

  return [...mesas.entries()].sort(([a], [b]) => {
    if (a === sinMesa) return 1;
    if (b === sinMesa) return -1;
    return a.localeCompare(b, IDIOMA);
  });
}

function telefonosDe(proveedor: Awaited<ReturnType<typeof obtenerAgendaDelDia>>[number]) {
  return [proveedor.telefono, ...proveedor.contactos.map((contacto) => contacto.telefono)]
    .filter((telefono): telefono is string => Boolean(telefono))
    .filter((telefono, indice, todos) => todos.indexOf(telefono) === indice);
}
