import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { PALETAS } from "@/config/tokens.generado";

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
    { name: "Cormorant Infant", data: serif, weight: 300 as const, style: "normal" as const },
    { name: "Jost", data: sans, weight: 400 as const, style: "normal" as const },
    { name: "Italianno", data: conector, weight: 400 as const, style: "normal" as const },
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
        fontFamily: "Cormorant Infant",
        padding: "80px 140px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "Jost",
          fontSize: 26,
          letterSpacing: 8,
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
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 40,
          fontSize: 104,
        }}
      >
        <span>{contenido.nombreNovia}</span>
        <span style={{ fontFamily: "Italianno", fontSize: 96, color: paleta.acento }}>
          {contenido.conjuncion}
        </span>
        <span>{contenido.nombreNovio}</span>
      </div>

      {contenido.pie ? (
        <div
          style={{
            marginTop: 48,
            paddingTop: 32,
            borderTop: `2px solid ${paleta.borde}`,
            fontFamily: "Jost",
            fontSize: 30,
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
