import "server-only";

import { URL_RESEND } from "@/config/constants";

/**
 * MANDAR UN CORREO
 *
 * El transporte, y nada más: quién escribe y qué pone lo deciden otros. Aquí
 * sólo se hace la petición y se cuenta si salió.
 *
 * NUNCA LANZA. Es la regla de este módulo y viene del criterio del ticket: «si
 * el envío falla, la respuesta ya está guardada». Un correo es un acuse de
 * recibo, no la respuesta — que una caída de Resend tumbara una confirmación
 * sería perder el dato que importa por no poder mandar el que no.
 *
 * LA URL SALE DE LA CONFIGURACIÓN, y no es un capricho de arquitectura: es lo
 * que permite que el test del camino feliz apunte a un buzón de pruebas y lea
 * lo que se mandó de verdad. Sin eso, comprobar el envío exigiría o una clave
 * real en CI o un mock de nuestro propio código —que probaría que sabemos
 * llamar a nuestra función, no que el correo sale—.
 */

const CLAVE = process.env.RESEND_API_KEY;
const REMITENTE = process.env.CORREO_REMITENTE;

/** `false` si falta configuración: entonces no se intenta, y no es un error. */
export const hayCorreo = Boolean(CLAVE && REMITENTE);

export interface Correo {
  para: string[];
  asunto: string;
  html: string;
  /**
   * La misma carta en texto plano. No es un extra: hay clientes que no pintan
   * HTML, y un correo sin alternativa de texto tiene bastantes más papeletas de
   * acabar en la carpeta de spam.
   */
  texto: string;
}

export type ResultadoCorreo =
  | { estado: "enviado"; id: string }
  | { estado: "sin-configurar" }
  | { estado: "sin-destinatario" }
  | { estado: "fallo"; motivo: string };

export async function enviarCorreo(correo: Correo): Promise<ResultadoCorreo> {
  if (!hayCorreo) return { estado: "sin-configurar" };
  if (correo.para.length === 0) return { estado: "sin-destinatario" };

  try {
    const respuesta = await fetch(`${URL_RESEND}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${CLAVE}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: correo.para,
        subject: correo.asunto,
        html: correo.html,
        text: correo.texto,
      }),
    });

    if (!respuesta.ok) {
      // El cuerpo del error entero: el motivo que da Resend —dominio sin
      // verificar, clave caducada— es lo único que dice qué hay que arreglar.
      const detalle = await respuesta.text().catch(() => "");
      return { estado: "fallo", motivo: `${respuesta.status} ${detalle}`.trim() };
    }

    const datos = (await respuesta.json().catch(() => ({}))) as { id?: string };
    return { estado: "enviado", id: datos.id ?? "" };
  } catch (error) {
    // Aquí caen las caídas de red y los tiempos de espera. Se convierte en
    // resultado, no en excepción: quien llama está a medio guardar un RSVP.
    return { estado: "fallo", motivo: error instanceof Error ? error.message : String(error) };
  }
}
