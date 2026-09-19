import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Pie } from "@/components/marketing/pie";
import { rutaDe } from "@/config/secciones";

/**
 * EL PIE NO ENLAZA A UNA PÁGINA QUE DEVUELVE 404
 *
 * `/reserva-la-fecha` existe sólo mientras su sección está visible: apagada,
 * la página contesta 404 a propósito y el sitemap deja de anunciarla. El pie,
 * en cambio, tenía la lista de enlaces escrita fija y la seguía enlazando. En
 * producción la sección está apagada, así que cada visitante llevaba en el pie
 * un enlace a un 404.
 *
 * Se prueba aquí, renderizando el componente, y no sólo en el E2E: el E2E
 * necesita apagar la sección en la base y levantar la web entera; esto son
 * milisegundos, y lo que hay que sostener es una sola decisión.
 */

const BASE = {
  nombreNovia: "Paloma",
  nombreNovio: "David",
  fechaCeremonia: new Date("2027-06-26T11:00:00.000Z"),
  lugar: null,
  correoContacto: null,
  hashtag: null,
};

const ENLACE = `href="${rutaDe("reserva_la_fecha")}"`;

describe("el pie y la reserva de fecha", () => {
  it("con la sección apagada no hay enlace", () => {
    const html = renderToStaticMarkup(<Pie {...BASE} secciones={[]} />);
    expect(html).not.toContain(ENLACE);
  });

  it("con la sección visible el enlace está", () => {
    const html = renderToStaticMarkup(<Pie {...BASE} secciones={["reserva_la_fecha"]} />);
    expect(html).toContain(ENLACE);
  });

  it("el resto del pie no depende de esa sección", () => {
    // Que el arreglo no se haya llevado por delante los otros enlaces.
    const html = renderToStaticMarkup(<Pie {...BASE} secciones={[]} />);
    expect(html).toContain('href="#portada"');
  });
});
