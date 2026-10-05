import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import { ESCALA_OG, PALETAS } from "@/config/tokens.generado";

/**
 * IMAGEN PARA COMPARTIR
 *
 * El enlace de la boda se va a pegar en WhatsApp cientos de veces. Lo que se ve
 * en esa tarjeta es la primera impresión, y un enlace sin vista previa parece
 * sospechoso justo cuando más falta hace que no lo parezca.
 *
 * SE PINTA SIN CSS, así que los colores y las fuentes hay que dárselos en
 * crudo. Los colores salen de `tokens.generado.ts`, que los lee del propio
 * sistema de tokens: cambiar la paleta cambia también esta imagen. Las fuentes
 * viajan en el repositorio en lugar de descargarse al vuelo, porque una tarjeta
 * de WhatsApp que depende de que Google conteste es una tarjeta que a veces no
 * sale.
 *
 * EL RECORTE DE WHATSAPP. La tarjeta se enseña casi cuadrada, recortando por
 * los lados. Por eso todo va centrado y con mucho margen: lo que importa tiene
 * que sobrevivir a que le quiten un tercio por cada lado.
 */

export const TAMANO_OG = { width: 1200, height: 630 };
export const TIPO_OG = "image/png";

const paleta = PALETAS.inversa;
const escala = ESCALA_OG;

/**
 * La fecha de las dos tarjetas, con la regla de la marca: «24 de abril de
 * 2027», sin día de la semana ni coma. La de la reserva escribía «sábado, 24
 * de abril de 2027» y la de la portada no: dos fechas distintas para el mismo
 * día según qué enlace se pegara.
 */
export const FORMATO_FECHA_OG = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

/** Los nombres con los que se registran las fuentes en el renderizador. */
const FAMILIA = { serif: "Cormorant Infant", sans: "Jost", conector: "Italianno" } as const;

/**
 * Las tres familias de la entrega, en crudo: aquí no hay CSS que las resuelva,
 * así que se leen del repositorio y se le pasan al renderizador.
 *
 * Italianno entra por el conector. Sin ella, la «y» se pintaba en cursiva de
 * la serif y la tarjeta que sale en WhatsApp no era la misma marca que la web.
 */
async function fuentes() {
  const [serif, sans, conector] = await Promise.all([
    readFile(join(process.cwd(), "assets/fuentes/cormorant-infant-300.ttf")),
    readFile(join(process.cwd(), "assets/fuentes/jost-400.ttf")),
    readFile(join(process.cwd(), "assets/fuentes/italianno-400.ttf")),
  ]);
  return [
    { name: FAMILIA.serif, data: serif, weight: 300 as const, style: "normal" as const },
    { name: FAMILIA.sans, data: sans, weight: 400 as const, style: "normal" as const },
    { name: FAMILIA.conector, data: conector, weight: 400 as const, style: "normal" as const },
  ];
}

export interface ContenidoOg {
  etiqueta: string;
  nombreNovia: string;
  conjuncion: string;
  nombreNovio: string;
  pie: string | null;
}

export async function construirImagenOg(contenido: ContenidoOg) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: paleta.fondo,
        color: paleta.tinta,
        fontFamily: FAMILIA.serif,
        padding: `${escala.margenVertical}px ${escala.margenLateral}px`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: FAMILIA.sans,
          fontSize: escala.textoEtiqueta,
          letterSpacing: escala.espaciadoEtiqueta,
          textTransform: "uppercase",
          color: paleta["tinta-suave"],
        }}
      >
        {contenido.etiqueta}
      </div>

      {/*
        `alignItems` explícito: Satori no propaga el `textAlign` del padre a los
        hijos de un flex, así que sin esto la conjunción se queda pegada a la
        izquierda mientras los nombres van centrados.

        INTERLINEADO 1 Y LA «Y» SOLAPADA, como en la portada: con el
        interlineado de serie la «y» quedaba colgando del segundo nombre (68 px
        por arriba y 30 por abajo) y el bloque no cabía en el margen: el
        contenido se salía por abajo.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: escala.hueco,
          fontSize: escala.textoNombres,
          lineHeight: 1,
        }}
      >
        <span>{contenido.nombreNovia}</span>
        <span
          style={{
            fontFamily: FAMILIA.conector,
            fontSize: escala.textoConector,
            lineHeight: 1,
            marginTop: -escala.solapeConector,
            marginBottom: -escala.solapeConector,
            color: paleta.acento,
          }}
        >
          {contenido.conjuncion}
        </span>
        <span>{contenido.nombreNovio}</span>
      </div>

      {contenido.pie ? (
        <div
          style={{
            marginTop: escala.huecoPie,
            paddingTop: escala.hueco,
            borderTop: `${escala.filete}px solid ${paleta.borde}`,
            fontFamily: FAMILIA.sans,
            fontSize: escala.textoPie,
            color: paleta["tinta-suave"],
          }}
        >
          {contenido.pie}
        </div>
      ) : null}
    </div>,
    { ...TAMANO_OG, fonts: await fuentes() },
  );
}
