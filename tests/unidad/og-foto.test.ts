// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { fotoParaOg } from "../../src/lib/og";

/**
 * LA FOTO DE LA VISTA PREVIA DE WHATSAPP
 *
 * La imagen de compartir del Save the Date lleva la ilustración si la hay. Lo
 * que se defiende aquí es la otra mitad: que cuando la foto no se puede pintar
 * —no llega, no existe, viene en un formato que el renderizador no entiende—
 * se devuelve `null` y se pinta la tarjeta de siempre, en vez de una vista
 * previa rota que WhatsApp guardaría en caché durante días.
 */

const URL_FOTO = "https://ejemplo.test/storage/v1/object/public/medios/reserva/ilustracion.png";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function responder(cuerpo: BodyInit | null, init: ResponseInit) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(cuerpo, init)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fotoParaOg", () => {
  it("una foto PNG llega en línea, con sus medidas", async () => {
    responder(PNG, { status: 200, headers: { "content-type": "image/png" } });
    const foto = await fotoParaOg(URL_FOTO, 1086, 1448);
    expect(foto).toEqual({
      datos: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`,
      ancho: 1086,
      alto: 1448,
    });
  });

  it("un formato que el renderizador no entiende deja la tarjeta de siempre", async () => {
    responder(PNG, { status: 200, headers: { "content-type": "image/webp" } });
    expect(await fotoParaOg(URL_FOTO, 1086, 1448)).toBeNull();
  });

  it("una foto que no está en el almacén deja la tarjeta de siempre", async () => {
    responder(null, { status: 404 });
    expect(await fotoParaOg(URL_FOTO, 1086, 1448)).toBeNull();
  });

  it("si la descarga falla o no llega a tiempo, tampoco se rompe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Tiempo agotado", "TimeoutError");
      }),
    );
    expect(await fotoParaOg(URL_FOTO, 1086, 1448)).toBeNull();
  });

  it("sin medidas no se pide nada: no se sabría encajarla", async () => {
    const pedir = vi.fn();
    vi.stubGlobal("fetch", pedir);
    expect(await fotoParaOg(URL_FOTO, null, 1448)).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });
});
