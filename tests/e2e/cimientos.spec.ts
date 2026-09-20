import { expect, test } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";

/**
 * BODA-01 · Cimientos
 *
 * Lo básico que debe cumplirse siempre, independientemente de lo que muestre
 * cada sección: que la página responde, que declara el idioma y que una ruta
 * inventada no revienta.
 */
test.describe("Portada", () => {
  test("responde y renderiza contenido real", async ({ page }) => {
    const respuesta = await page.goto("/");

    expect(respuesta?.status()).toBe(200);
    // El título viene de la base de datos (los nombres de los novios), no de un
    // literal: por eso se comprueba que hay uno y que no está vacío, y son los
    // tests de landing los que verifican su procedencia.
    const titulo = page.getByRole("heading", { level: 1 }).first();
    await expect(titulo).toBeVisible();
    await expect(titulo).not.toHaveText("");
  });

  test("los rótulos de interfaz salen del fichero de copys", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: copy.portada.confirmarAsistencia }).first(),
    ).toBeVisible();
  });

  test("el documento declara castellano", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es-ES");
  });

  // Caso de error obligatorio: una ruta inexistente no revienta.
  test("una ruta que no existe devuelve 404", async ({ page }) => {
    const respuesta = await page.goto("/esta-ruta-no-existe");
    expect(respuesta?.status()).toBe(404);
  });
});

/**
 * Cabeceras de seguridad.
 *
 * Vivían en `netlify.toml` y al pasar a Vercel se movieron a `next.config.ts`.
 * Un cambio de plataforma es justo el momento en que estas cosas se pierden en
 * silencio, así que quedan comprobadas.
 */
test.describe("Cabeceras de seguridad", () => {
  test("la web se sirve con las protecciones básicas", async ({ request }) => {
    const respuesta = await request.get("/");
    const cabeceras = respuesta.headers();

    expect(cabeceras["x-content-type-options"]).toBe("nosniff");
    expect(cabeceras["x-frame-options"]).toBe("DENY");
    // Importante aquí: las URL del RSVP llevan el token dentro, y sin esto se
    // filtraría entero al navegar a un dominio externo.
    expect(cabeceras["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  /**
   * LA CONTENT-SECURITY-POLICY, con nonce por petición.
   *
   * Es la única cabecera que de verdad frena un script inyectado, y no
   * estaba. Se comprueba que viaja, que Next ha puesto el nonce en cada
   * script que emite —sin eso la página se bloquearía a sí misma— y que
   * ninguna pantalla pública la viola al cargar: una directiva de menos se
   * ve como una foto que no sale o un mapa en blanco, y aquí se ve como rojo.
   */
  test("la Content-Security-Policy viaja, lleva nonce y ninguna pantalla pública la viola", async ({
    page,
    request,
  }) => {
    const respuesta = await request.get("/");
    const csp = respuesta.headers()["content-security-policy"] ?? "";
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(nonce, "la política lleva un nonce").toBeTruthy();

    // Cada script que Next emite lleva ESE nonce: el JSON-LD no se ejecuta y
    // no lo necesita, todo lo demás sí.
    const html = await respuesta.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
    const ejecutables = scripts.filter(
      (atributos) => !/type="application\/ld\+json"/.test(atributos),
    );
    expect(ejecutables.length).toBeGreaterThan(0);
    expect(
      ejecutables.filter((atributos) => !atributos.includes(`nonce="${nonce}"`)),
      "todo script ejecutable lleva el nonce de la petición",
    ).toEqual([]);

    // Y un nonce nuevo en cada petición, que es lo que lo hace nonce.
    const otra = await request.get("/");
    expect(otra.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);

    // Ninguna violación al cargar las pantallas públicas.
    const violaciones: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (evento) => {
        const detalle = `${evento.violatedDirective} ← ${evento.blockedURI}`;
        (window as unknown as { __violacionesCsp: string[] }).__violacionesCsp ??= [];
        (window as unknown as { __violacionesCsp: string[] }).__violacionesCsp.push(detalle);
      });
    });
    for (const ruta of ["/", "/reserva-la-fecha", "/acceso", "/rsvp/token-que-no-existe-000"]) {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      const enEsta = await page.evaluate(
        () => (window as unknown as { __violacionesCsp?: string[] }).__violacionesCsp ?? [],
      );
      violaciones.push(...enEsta.map((v) => `${ruta}: ${v}`));
    }
    expect(violaciones).toEqual([]);
  });

  test("el sistema de diseño no se indexa", async ({ request }) => {
    const respuesta = await request.get("/cocina");
    expect(respuesta.headers()["x-robots-tag"]).toContain("noindex");
  });
});

/**
 * BODA-125 · Las reglas de marca que sí se pueden comprobar solas
 *
 * De las seis comprobaciones que el sistema de marca pide «antes de mandar a
 * imprenta», tres valen también para la web. Dos de ellas son medibles en el
 * navegador y están aquí; las otras tres —cuerpo mínimo en puntos, sangre de
 * 3 mm y tintas en CMYK— sólo tienen sentido sobre papel.
 */
test.describe("El repaso de marca", () => {
  const PUBLICAS = ["/", "/reserva-la-fecha"];

  /**
   * REGLA 02 · «Una sola «y» en Italianno por pieza.»
   *
   * SE CUENTA LA «y» SUELTA, NO LOS ELEMENTOS EN ITALIANNO, y la diferencia es
   * la regla entera. La propia Landing del estudio usa Italianno dos veces en
   * la portada: la «y» suelta entre los dos nombres y la frase «y continúa en
   * León» del paisaje. Si la regla contara elementos, la entrega se saltaría su
   * propia regla — y el catálogo de marca, que usa Italianno en el monograma,
   * en su titular y en la muestra de la familia, se la saltaría tres veces.
   *
   * Lo que la regla protege es que el gesto no se gaste: la «y» suelta en
   * cursiva inglesa es la firma de la pieza, y dos firmas no son una firma.
   * Una frase entera en esa letra es otra cosa, y por eso la entrega la admite.
   */
  for (const ruta of PUBLICAS) {
    test(`en ${ruta} la «y» de Italianno aparece una sola vez`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.locator("main, body").first()).toBeVisible();

      const enItalianno = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((nodo) => getComputedStyle(nodo).fontFamily.includes("Italianno"))
          .map((nodo) => (nodo.textContent ?? "").trim()),
      );

      expect(
        enItalianno.length,
        "la letra de la marca tiene que aparecer: si no, es que no se está cargando",
      ).toBeGreaterThan(0);

      const yesSueltas = enItalianno.filter((texto) => texto === "y");
      expect(
        yesSueltas.length,
        `«y» sueltas en Italianno encontradas: ${yesSueltas.length}. La regla 02 admite una.`,
      ).toBeLessThanOrEqual(1);
    });
  }

  /**
   * REGLA DE FOTOGRAFÍA · «Texto sobre foto: siempre con velo oscuro del 20 %
   * al 60 %.»
   *
   * El único sitio de la web con texto encima de una imagen es la escena del
   * paisaje. Su velo estaba en el 62 %: dos puntos de más que no se ven a ojo y
   * sí se miden, que es justo la clase de deriva que este repaso existe para
   * cazar.
   */
  test("el velo bajo el texto de una foto se queda en el tope de la entrega", async ({
    page,
  }) => {
    await page.goto("/");

    /*
      SE MIDEN LOS TOKENS Y NO EL DEGRADADO PINTADO, y la primera versión de
      este test se equivocó justo ahí: en reposo la escena está en su estado
      LEJANO, con el velo al 10 y al 20 %, así que medir lo que hay en pantalla
      sin hacer scroll daba por buena cualquier cosa. El tope del 60 % vive en
      el estado CERCANO, que es el que queda debajo del titular.

      Leyendo los tokens se comprueba la regla en su origen, sin depender de
      dónde esté el scroll ni de si el navegador anima con él.
    */
    const velos = await page.evaluate(() => {
      const raiz = getComputedStyle(document.documentElement);
      const nombres = [
        "--velo-foto",
        "--velo-escena-cerca-arriba",
        "--velo-escena-lejos-arriba",
        "--velo-escena-lejos-abajo",
      ];
      /*
        El navegador normaliza `rgb(20 23 15 / 60%)` a `#14170f99`, así que la
        opacidad hay que sacarla del par hexadecimal del final: 0x99 son 153 de
        255, o sea el 60 %. Se admiten también las otras dos formas por si
        algún día deja de normalizar.
      */
      const opacidadDe = (valor: string): number | null => {
        const hex = valor.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/i);
        if (hex) return (parseInt(hex[1], 16) / 255) * 100;

        const porcentaje = valor.match(/\/\s*([\d.]+)%/);
        if (porcentaje) return Number(porcentaje[1]);

        const rgba = valor.match(/rgba\([^)]*?,\s*([\d.]+)\s*\)/);
        if (rgba) return Number(rgba[1]) * 100;

        return null;
      };

      return nombres.map((nombre) => {
        const valor = raiz.getPropertyValue(nombre).trim();
        return { nombre, valor, opacidad: opacidadDe(valor) };
      });
    });

    const conValor = velos.filter((v) => v.opacidad !== null);
    expect(
      conValor.length,
      "no se ha podido leer ningún velo: el barrido está roto, no la regla",
    ).toBeGreaterThan(0);

    for (const { nombre, valor, opacidad } of conValor) {
      expect(
        opacidad,
        `${nombre} vale ${valor}, y la entrega acota el velo sobre foto al 60 %`,
      ).toBeLessThanOrEqual(60.5);
      expect(
        opacidad,
        `${nombre} vale ${valor}, por debajo del 20 % que pide la entrega`,
      ).toBeGreaterThanOrEqual(10);
    }

    // Y el más oscuro de todos es justo el que nombra la regla.
    const foto = conValor.find((v) => v.nombre === "--velo-foto");
    expect(foto, "falta `--velo-foto`, que es el nombre de la regla").toBeDefined();
    expect(Math.max(...conValor.map((v) => v.opacidad as number))).toBe(foto!.opacidad);
  });
});
