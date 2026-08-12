import { NextResponse, type NextRequest } from "next/server";

import { RUTA_ACCESO, ZONA_HORARIA } from "@/config/constants";
import {
  agruparPorMesa,
  ESTADO_CONFIRMADO,
  obtenerComensales,
  obtenerMesas,
  type Comensal,
  type FormaMesa,
  type Mesa,
} from "@/lib/bbdd/mesas";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

/**
 * BODA-84 (#60) · EL REPARTO, EN UN FICHERO
 *
 * Lo piden la finca —que monta las mesas— y el catering —que reparte los
 * menús—, y los dos lo abren con Excel. Así que sale en CSV y con las mismas
 * dos decisiones que la exportación de invitados, por las mismas razones:
 * separador `;` y BOM delante.
 *
 * VA COMO RUTA Y NO COMO ACCIÓN DE SERVIDOR porque el resultado es un fichero,
 * no una pantalla: hace falta controlar las cabeceras para que el navegador lo
 * descargue con su nombre en lugar de pintarlo.
 *
 * SALE TAMBIÉN QUIEN NO TIENE MESA, en un bloque al final. Es la mitad del
 * fichero que de verdad hace falta mirar cuando el reparto está a medias, y un
 * listado que sólo enseñe lo colocado da la impresión de estar terminado.
 *
 * NO SE FILTRA A LOS QUE NO VIENEN: van con su respuesta escrita al lado. Quien
 * monta la sala necesita saber que esa silla se puede quitar, y borrarlos del
 * fichero le obligaría a cruzarlo con otra lista para averiguarlo.
 */
export const dynamic = "force-dynamic";

const formatoFechaFichero = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ZONA_HORARIA,
});

/**
 * Una celda de CSV.
 *
 * Se entrecomilla SIEMPRE, no sólo cuando hay comas. Un campo de alergias lleva
 * comas, saltos de línea y comillas con total naturalidad —«Celíaca, y alérgica
 * a los frutos secos»— y decidir campo a campo es justo donde se cuela el
 * fichero que Excel abre partido por la mitad.
 */
function celda(valor: string | number | null | undefined): string {
  return `"${String(valor ?? "").replaceAll('"', '""')}"`;
}

function respuestaDe(persona: Comensal): string {
  if (persona.estado === ESTADO_CONFIRMADO) return t("rsvp.vieneSi");
  if (persona.estado === "rechazado") return t("rsvp.vieneNo");
  return t("panel.invitados.pendienteRespuesta");
}

/** Una persona, con la mesa que le toque delante. */
function filaDe(persona: Comensal, mesa: Mesa | null): (string | number)[] {
  return [
    mesa ? mesa.nombre : t("panel.mesas.sinMesaEnFichero"),
    mesa ? mesa.capacidad : "",
    mesa ? t(`panel.mesas.formas.${mesa.forma}` as "panel.mesas.formas.redonda") : "",
    persona.nombre,
    persona.apellidos ?? "",
    persona.esNino ? t("comun.si") : t("comun.no"),
    respuestaDe(persona),
    /*
      El menú sólo de quien viene. El de quien ha dicho que no es ruido que el
      catering acabaría contando, y el de quien no ha contestado todavía no
      significa nada: es el valor por defecto de la tabla, no una elección.
    */
    persona.estado === ESTADO_CONFIRMADO
      ? t(`rsvp.menus.${persona.tipoMenu}` as "rsvp.menus.estandar")
      : "",
    persona.alergias ?? "",
  ];
}

export async function GET(peticion: NextRequest) {
  const acceso = await accesoActual();
  // Un fichero con los datos de ciento veinte personas no se sirve a quien
  // acierte la URL. La protección de verdad es RLS —sin sesión las consultas
  // devuelven cero filas— pero aquí se corta antes y sin dar detalles.
  if (!acceso) return NextResponse.redirect(new URL(RUTA_ACCESO, peticion.url));

  const [mesas, comensales] = await Promise.all([obtenerMesas(), obtenerComensales()]);
  const sentadosPorMesa = agruparPorMesa(comensales);

  const filas: (string | number)[][] = [
    [
      t("panel.mesas.columnaMesa"),
      t("panel.mesas.columnaCapacidad"),
      t("panel.mesas.columnaForma"),
      t("panel.mesas.columnaNombre"),
      t("panel.mesas.columnaApellidos"),
      t("panel.mesas.columnaEsNino"),
      t("panel.mesas.columnaRespuesta"),
      t("panel.mesas.columnaMenu"),
      t("panel.mesas.columnaAlergias"),
    ],
  ];

  /*
    MESA A MESA Y EN EL ORDEN DE LA PANTALLA, no una lista plana de personas.
    Quien recibe esto lo imprime y lo va leyendo mesa por mesa mientras coloca
    las tarjetas; ordenado por apellido obligaría a buscar cada nombre.

    Una mesa vacía sale igual, con su fila y sin nadie: es la mesa que hay que
    montar y que todavía no tiene a quién sentar.
  */
  for (const mesa of mesas) {
    const gente = sentadosPorMesa.get(mesa.id) ?? [];
    if (gente.length === 0) {
      filas.push([
        mesa.nombre,
        mesa.capacidad,
        t(`panel.mesas.formas.${mesa.forma as FormaMesa}` as "panel.mesas.formas.redonda"),
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      continue;
    }
    for (const persona of gente) filas.push(filaDe(persona, mesa));
  }

  for (const persona of comensales) {
    if (!persona.mesaId) filas.push(filaDe(persona, null));
  }

  const csv = filas.map((fila) => fila.map(celda).join(";")).join("\r\n");

  const fecha = formatoFechaFichero.format(new Date());
  const nombre = t("panel.mesas.nombreFichero", { fecha });

  /*
    EL BOM, Y NO ES OPCIONAL.

    Excel en Windows abre un CSV sin BOM como si fuera de su página de códigos
    local, y «Zubeldía» se convierte en «ZubeldÃ­a». Quien recibe el fichero es
    la finca, y va a abrirlo con Excel: sin estos tres bytes, la mitad de los
    apellidos españoles llegan rotos.

    El separador es `;` por lo mismo: es el que espera Excel en configuración
    regional española, donde la coma es el separador decimal.
  */
  const cuerpo = `﻿${csv}`;

  return new NextResponse(cuerpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre}"`,
      // Los datos de los invitados no se guardan en ninguna caché intermedia.
      "cache-control": "no-store",
    },
  });
}
