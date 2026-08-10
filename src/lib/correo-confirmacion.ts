import { IDIOMA, ZONA_HORARIA } from "@/config/constants";
import { t } from "@/lib/copy";

/**
 * BODA-57 · LA CARTA DEL ACUSE DE RECIBO
 *
 * Se compone aquí y no en la acción por una razón práctica: así se puede probar
 * entera —qué pone, que lleva el enlace, que la versión de texto no se olvida
 * nada— sin base de datos, sin navegador y sin mandar un solo correo.
 *
 * LAS DOS VERSIONES SE ESCRIBEN JUNTAS, y por eso no se separan en dos
 * funciones. Un correo con HTML y sin texto plano se pinta mal en los clientes
 * que no lo soportan y tiene bastantes más papeletas de acabar en spam; y dos
 * funciones distintas acaban contando cosas distintas en cuanto una se toque.
 * Aquí las dos salen del mismo dato, en el mismo sitio, o no salen.
 */

export interface DatosConfirmacion {
  vienen: string[];
  noVienen: string[];
  enlace: string;
  fechaLimite: Date | null;
  nombreNovia: string;
  nombreNovio: string;
}

export interface CartaConfirmacion {
  asunto: string;
  html: string;
  texto: string;
}

const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: ZONA_HORARIA,
});

/** Escapa lo que va dentro del HTML: los nombres los escribe cualquiera. */
function seguro(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function componerConfirmacion(datos: DatosConfirmacion): CartaConfirmacion {
  const alguienViene = datos.vienen.length > 0;

  const plazo = datos.fechaLimite
    ? t("correoConfirmacion.plazo", { fecha: formatoFecha.format(datos.fechaLimite) })
    : t("correoConfirmacion.sinPlazo");

  const firma = t("correoConfirmacion.firma", {
    novia: datos.nombreNovia,
    novio: datos.nombreNovio,
  });

  const lineas: string[] = [
    t("correoConfirmacion.saludo"),
    "",
    alguienViene ? t("correoConfirmacion.cuerpoSi") : t("correoConfirmacion.cuerpoNo"),
  ];

  if (datos.vienen.length > 0) {
    lineas.push("", `${t("correoConfirmacion.vienen")}: ${datos.vienen.join(", ")}`);
  }
  if (datos.noVienen.length > 0) {
    lineas.push("", `${t("correoConfirmacion.noVienen")}: ${datos.noVienen.join(", ")}`);
  }

  lineas.push(
    "",
    t("correoConfirmacion.cambiar"),
    datos.enlace,
    "",
    plazo,
    "",
    t("correoConfirmacion.despedida"),
    firma,
  );

  const parrafos: string[] = [
    `<p>${seguro(t("correoConfirmacion.saludo"))}</p>`,
    `<p>${seguro(
      alguienViene ? t("correoConfirmacion.cuerpoSi") : t("correoConfirmacion.cuerpoNo"),
    )}</p>`,
  ];

  if (datos.vienen.length > 0) {
    parrafos.push(
      `<p><strong>${seguro(t("correoConfirmacion.vienen"))}:</strong> ${seguro(datos.vienen.join(", "))}</p>`,
    );
  }
  if (datos.noVienen.length > 0) {
    parrafos.push(
      `<p><strong>${seguro(t("correoConfirmacion.noVienen"))}:</strong> ${seguro(datos.noVienen.join(", "))}</p>`,
    );
  }

  /*
    EL ENLACE VA COMO TEXTO ADEMÁS DE COMO ENLACE.

    Muchos clientes de correo no pintan los `<a>` en la vista previa, y algunos
    los desactivan del todo en remitentes desconocidos. Con la dirección escrita
    entera se puede copiar a mano, que es feo pero funciona — y este enlace es
    justo el que evita el «¿cómo cambio mi respuesta?».
  */
  parrafos.push(
    `<p>${seguro(t("correoConfirmacion.cambiar"))}<br>` +
      `<a href="${seguro(datos.enlace)}">${seguro(datos.enlace)}</a></p>`,
    `<p>${seguro(plazo)}</p>`,
    `<p>${seguro(t("correoConfirmacion.despedida"))}<br>${seguro(firma)}</p>`,
  );

  return {
    asunto: alguienViene ? t("correoConfirmacion.asuntoSi") : t("correoConfirmacion.asuntoNo"),
    texto: lineas.join("\n"),
    html: parrafos.join("\n"),
  };
}
