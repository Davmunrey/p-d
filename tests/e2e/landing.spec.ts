import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";

/**
 * E3 · Landing
 *
 * Lo que se verifica aquí no es que la página se vea bonita, sino que **lee de
 * la base de datos**. El seed de desarrollo marca todo con el prefijo «(DES)»,
 * así que si ese prefijo aparece en pantalla es prueba de que el contenido
 * viene de la base y no de un literal escondido en el código.
 *
 * La regla 3 del proyecto —nada de maquetas con datos falsos— se comprueba
 * aquí, no se promete en una revisión.
 */

test.describe("Landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("los nombres y el lugar salen de la base de datos", async ({ page }) => {
    // El prefijo (DES) sólo existe en el seed: si se ve, la página está
    // leyendo de verdad.
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText("(DES)");
    await expect(page.getByText(/\(DES\).*[Ff]inca/).first()).toBeVisible();
  });

  test("el programa del día se pinta con sus horas", async ({ page }) => {
    const programa = page.locator("#programa");
    await expect(programa).toBeVisible();
    await expect(programa.getByText("(DES) Ceremonia")).toBeVisible();
    await expect(programa.getByText("13:00").first()).toBeVisible();
  });

  test("los alojamientos muestran tarifa y enlace de reserva", async ({ page }) => {
    const alojamiento = page.locator("#alojamiento");
    await expect(alojamiento).toBeVisible();
    await expect(alojamiento.getByText("135 € / noche")).toBeVisible();

    const enlace = alojamiento.getByRole("link", { name: copy.alojamiento.reservar }).first();
    // Un enlace externo sin rel=noopener deja al sitio de destino manipular la
    // pestaña de origen.
    await expect(enlace).toHaveAttribute("rel", /noopener/);
    await expect(enlace).toHaveAttribute("target", "_blank");
  });

  test("las preguntas frecuentes se abren y cierran con teclado", async ({ page }) => {
    const primera = page.locator("#preguntas-frecuentes details").first();
    await expect(primera).not.toHaveAttribute("open", "");

    await primera.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(primera).toHaveAttribute("open", "");
  });

  test("la cuenta atrás muestra cifras y no un hueco", async ({ page }) => {
    const contador = page.getByRole("timer");
    await expect(contador).toBeVisible();
    // Cuatro bloques: días, horas, minutos y segundos.
    await expect(contador.locator("> div")).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(contador.locator("> div").nth(i).locator("div").first()).toHaveText(/^\d+$/);
    }
  });

  test("la cuenta atrás avanza sola", async ({ page }) => {
    const segundos = page.getByRole("timer").locator("> div").nth(3).locator("div").first();
    const antes = await segundos.textContent();
    await expect(segundos).not.toHaveText(antes ?? "", { timeout: 3000 });
  });

  test("el CTA de la portada lleva al RSVP", async ({ page }) => {
    await page.getByRole("link", { name: copy.portada.confirmarAsistencia }).first().click();
    await expect(page).toHaveURL(/#rsvp$/);
    await expect(page.locator("#rsvp")).toBeInViewport();
  });

  test("la jerarquía de encabezados es correcta", async ({ page }) => {
    // Un solo h1: si hay varios, el lector de pantalla pierde el hilo de la
    // página y el índice por encabezados deja de servir.
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.locator("h2").count()).toBeGreaterThan(0);
  });

  /**
   * BODA-19 · La portada, según la entrega.
   */
  test("la fecha se escribe con puntos medios, como la marca", async ({ page }) => {
    // `26 · 06 · 2027`. Se comprueba el formato, no la fecha: la fecha la pone
    // la base y cambia; la forma de escribirla es la marca y no cambia.
    const fecha = page.locator("#portada time").first();
    await expect(fecha).toHaveText(/^\d{2} · \d{2} · \d{4}$/);
  });

  test("la portada se parte en dos cuando hay foto publicada", async ({ page }) => {
    // El seed publica una foto de portada, así que aquí tiene que haber dos
    // columnas: el texto y la imagen.
    const columnas = await page
      .locator("#portada")
      .evaluate((seccion) => seccion.children.length);

    expect(columnas).toBe(2);
  });

  /**
   * CASO DE ERROR. Una imagen sin publicar no puede asomarse a la landing.
   *
   * El seed deja una en `galeria` marcada como borrador justamente para esto:
   * si apareciera, significaría que la consulta se olvidó del filtro y que
   * cualquier foto a medio subir acabaría en la web.
   */
  test("una imagen sin publicar no aparece en ninguna parte", async ({ page }) => {
    await expect(page.getByAltText(/Borrador/i)).toHaveCount(0);
    await expect(page.locator('img[src*="galeria-borrador"]')).toHaveCount(0);
  });

  /**
   * BODA-20 · El cielo de la cuenta atrás.
   */
  test("la cuenta atrás lleva su cielo, y es decoración para quien no ve", async ({ page }) => {
    const cielo = page.locator("#cuenta-atras .cielo-estrellado");
    await expect(cielo).toHaveCount(1);

    // Decoración pura: anunciarlo sería ruido en un lector de pantalla.
    await expect(cielo).toHaveAttribute("aria-hidden", "true");

    const capas = await cielo.evaluate(
      (nodo) => getComputedStyle(nodo).backgroundImage.split("radial-gradient").length - 1,
    );
    expect(capas).toBe(4);
  });

  /**
   * BODA-17 · El conector va en Italianno, y de verdad.
   *
   * Comprobar la clase no valdría: diría que se ha pedido la fuente, no que
   * haya llegado. Si `next/font` fallara o el nombre de la familia se
   * escribiera mal, la «y» caería en la serif y la clase seguiría ahí.
   *
   * Y TAMPOCO VALE BUSCAR «Italianno» EN LA PILA DE FAMILIAS. Ese nombre está
   * escrito a mano en `--font-family-conector` como red de seguridad, así que
   * aparece en el `fontFamily` calculado tanto si la fuente ha llegado como si
   * no: un test que lo busque pasa siempre. Lo que se comprueba es que la
   * PRIMERA familia de la pila —la que de verdad se usa— corresponde a una
   * fuente cargada, que es la única señal que distingue las dos situaciones.
   */
  test("la «y» entre los nombres se pinta con Italianno", async ({ page }) => {
    const conector = page.getByText(copy.portada.conjuncion, { exact: true }).first();
    await expect(conector).toBeVisible();

    const familia = await conector.evaluate(
      (elemento) => getComputedStyle(elemento).fontFamily,
    );
    expect(familia).toContain("Italianno");

    await page.evaluate(() => document.fonts.ready);
    const llego = await conector.evaluate((elemento) => {
      const primera = getComputedStyle(elemento)
        .fontFamily.split(",")[0]
        .trim()
        .replace(/^["']|["']$/g, "");
      return [...document.fonts].some(
        (fuente) => fuente.family === primera && fuente.status === "loaded",
      );
    });
    expect(llego, "la primera familia de la pila tiene que ser una fuente cargada").toBe(true);

    // Y en bronce: es la única gota de color cálido de la portada.
    const { conectorColor, tituloColor } = await page.evaluate((texto) => {
      const nodos = [...document.querySelectorAll("span")];
      const y = nodos.find((n) => n.textContent?.trim() === texto)!;
      return {
        conectorColor: getComputedStyle(y).color,
        tituloColor: getComputedStyle(document.querySelector("h1")!).color,
      };
    }, copy.portada.conjuncion);

    expect(conectorColor).not.toBe(tituloColor);
  });
});

/**
 * ESTO SE VA A VER EN EL MÓVIL, Y SE TOCA CON EL PULGAR.
 *
 * La invitación llega por WhatsApp: casi nadie la abrirá en un escritorio. Un
 * control de 34 px de alto se ve perfecto en una captura y se falla una de cada
 * tres veces con el dedo, y el que más se falla es siempre el mismo —el de
 * confirmar—, porque los botones bonitos se dibujan ajustados.
 *
 * 44 px es el mínimo de la WCAG (2.5.8) y el de las guías de Apple. Se mide el
 * rectángulo REAL en el navegador, no la clase: el alto de una píldora sale de
 * su relleno, de su tipografía y de si el contenedor la estira, y ninguna de las
 * tres cosas se ve leyendo el `className`.
 *
 * SE EXIMEN LOS ENLACES DENTRO DE UNA FRASE, como los exime la propia norma:
 * agrandar «escríbenos a hola@…» rompería el renglón, y su objetivo es la línea
 * de texto, no un botón.
 */
test.describe("Se toca con el pulgar", () => {
  /** El mínimo de la WCAG 2.5.8, en píxeles CSS. */
  const MINIMO = 44;

  test("ningún control de la landing baja del mínimo táctil", async ({ page }) => {
    await page.goto("/");

    const pequenos = await page.evaluate((minimo) => {
      const fuera: string[] = [];

      for (const nodo of document.querySelectorAll<HTMLElement>(
        "a, button, summary, [role=button]",
      )) {
        const caja = nodo.getBoundingClientRect();

        // Lo que no se ve no se toca. El salto «ir al contenido» vive así
        // hasta que alguien lo enfoca, y entonces sí es un control de verdad.
        if (caja.width === 0 || caja.height === 0) continue;
        if (nodo.closest(".sr-only")) continue;

        // Enlace dentro de un párrafo: es texto, y la norma lo exime.
        if (nodo.closest("p")) continue;

        if (caja.height < minimo) {
          fuera.push(
            `${nodo.tagName.toLowerCase()} «${(nodo.textContent ?? "").trim().slice(0, 30)}» ${Math.round(caja.height)}px`,
          );
        }
      }

      return fuera;
    }, MINIMO);

    expect(pequenos, `controles por debajo de ${MINIMO}px de alto`).toEqual([]);
  });

  /**
   * Y el de confirmar por su nombre, aparte del barrido.
   *
   * Es lo ÚNICO que se le pide al invitado, así que merece un test que lo
   * nombre: si algún día el barrido se relaja o se le añade una excepción,
   * éste sigue diciendo que confirmar no puede encoger. Es el de la barra: el
   * pie ya no repite el menú (BODA-113, como la entrega), y quien ha bajado la
   * invitación entera se encuentra la sección de confirmar justo encima.
   */
  test("los enlaces de confirmar no encogen", async ({ page }) => {
    await page.goto("/");

    const confirmar = page.getByRole("link", {
      name: copy.navegacion.secciones.rsvp,
      exact: true,
    });
    await expect(confirmar, "el de la barra").toHaveCount(1);

    for (const enlace of await confirmar.all()) {
      const caja = await enlace.boundingBox();
      expect(caja!.height, "un enlace de confirmar").toBeGreaterThanOrEqual(MINIMO);
    }
  });
});

/**
 * LAS FUENTES SON NUESTRAS.
 *
 * Cormorant Infant, Jost e Italianno viven en `src/fuentes` y las sirve el
 * propio dominio. Esto no es una preferencia de estilo, arregla tres cosas que
 * ya dieron guerra:
 *
 *   · La compilación dejó de depender de que Google conteste. Con
 *     `next/font/google`, el MISMO commit compiló en un trabajo de CI y falló
 *     en otro con «Can't resolve @vercel/turbopack-next/internal/font/google».
 *     En una web cuyo diseño *es* la tipografía, eso es la compilación entera.
 *   · Nadie le cuenta a Google quién abre la invitación. Mismo criterio que el
 *     mapa de OpenStreetMap.
 *   · Un salto de red menos antes del primer texto.
 *
 * Se prueba desde la red y no leyendo el código porque lo que importa es lo que
 * el navegador PIDE: un `import` de `next/font/google` que se colara en
 * cualquier fichero volvería a sacar peticiones a Google sin tocar esto.
 */
test.describe("Las fuentes", () => {
  /** Todo lo que la página pide de fuera mientras se pinta. */
  async function peticionesAlCargar(page: import("@playwright/test").Page) {
    const urls: string[] = [];
    page.on("request", (peticion) => urls.push(peticion.url()));
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    return urls;
  }

  /**
   * CAMINO FELIZ · los `.woff2` salen de nuestro propio origen.
   */
  test("las tipografías las sirve el propio dominio", async ({ page, baseURL }) => {
    const urls = await peticionesAlCargar(page);
    const fuentes = urls.filter((url) => url.endsWith(".woff2"));

    expect(fuentes.length, "la portada tiene que pedir alguna fuente").toBeGreaterThan(0);

    const origen = new URL(baseURL!).origin;
    const ajenas = fuentes.filter((url) => new URL(url).origin !== origen);
    expect(ajenas, "ninguna fuente puede venir de fuera").toEqual([]);
  });

  /**
   * CASO DE ERROR · ni una sola petición a Google.
   *
   * Comprueba los DOS dominios, y no sólo el de los ficheros: `fonts.gstatic`
   * sirve los `.woff2`, pero es `fonts.googleapis` quien recibe la petición de
   * la hoja de estilos —y esa es la que va con la IP de quien abre la
   * invitación—. Bloquear uno y dejar el otro no arregla nada.
   */
  test("no se le pide nada a Google", async ({ page }) => {
    const urls = await peticionesAlCargar(page);

    const aGoogle = urls.filter(
      (url) => url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com"),
    );
    expect(aGoogle, "las fuentes están en el repositorio, no en Google").toEqual([]);
  });
});

/**
 * BODA-33 · La cabecera de sección.
 *
 * Lo que se comprueba aquí no es que el patrón esté escrito, sino que el
 * acento sigue siendo escaso. Un componente con una propiedad `realzada` es
 * muy fácil de encender en todas las secciones «porque queda bien», y el día
 * que eso pasa el bronce deja de significar nada. El test lo impide.
 */
test.describe("Cabecera de sección", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("ninguna sección de contenido se queda sin abrir", async ({ page }) => {
    // La portada y la cuenta atrás tienen su propia composición; el resto
    // comparte el patrón y ninguna puede quedarse muda.
    const mudas = await page.evaluate(() =>
      [...document.querySelectorAll("main section")]
        .filter((seccion) => !["portada", "cuenta-atras"].includes(seccion.id))
        .filter((seccion) => !seccion.querySelector("header h2"))
        .map((seccion) => seccion.id),
    );

    expect(mudas).toEqual([]);
  });

  test("el titular abre la sección, pero sigue siendo un h2", async ({ page }) => {
    // Tamaño de portada y jerarquía de subapartado son cosas distintas: lo
    // primero es diseño y lo segundo es lo que oye un lector de pantalla.
    const cabeceras = await page.evaluate(() =>
      [...document.querySelectorAll("main section header h2")].map((titulo) => {
        const seccion = titulo.closest("section")!;
        const menor = seccion.querySelector("h3");
        return {
          id: seccion.id,
          tam: parseFloat(getComputedStyle(titulo).fontSize),
          tamMenor: menor ? parseFloat(getComputedStyle(menor).fontSize) : null,
        };
      }),
    );

    expect(cabeceras.length).toBeGreaterThan(0);
    for (const cabecera of cabeceras) {
      if (cabecera.tamMenor !== null) {
        expect(
          cabecera.tam,
          `«${cabecera.id}» no abre: su titular no es mayor`,
        ).toBeGreaterThan(cabecera.tamMenor);
      }
    }
  });

  test("el bronce es una gota: hay secciones sobrias y secciones realzadas", async ({
    page,
  }) => {
    const versalitas = await page.evaluate(() =>
      [...document.querySelectorAll("main section header > div > span:first-child")].map(
        (span) => ({
          id: span.closest("section")!.id,
          color: getComputedStyle(span).color,
          rombo: span.querySelectorAll("[aria-hidden]").length,
        }),
      ),
    );

    const realzadas = versalitas.filter((v) => v.rombo === 1);
    const sobrias = versalitas.filter((v) => v.rombo === 0);

    // Si algún día todas fueran realzadas, el acento habría dejado de serlo.
    expect(realzadas.length).toBeGreaterThan(0);
    expect(sobrias.length).toBeGreaterThan(0);

    // Y son de dos colores distintos, no del mismo con un rombo de más.
    const colores = new Set(versalitas.map((v) => v.color));
    expect(colores.size).toBeGreaterThan(1);
  });

  /**
   * CASO DE ERROR. El rombo es decoración pura. Si se anunciara, quien navega
   * con lector de pantalla oiría un ruido de más en cada sección realzada.
   */
  test("el rombo no se anuncia y no lleva texto", async ({ page }) => {
    const rombos = page.locator("main section header span[aria-hidden]");
    expect(await rombos.count()).toBeGreaterThan(0);

    for (const rombo of await rombos.all()) {
      await expect(rombo).toHaveAttribute("aria-hidden", "true");
      await expect(rombo).toHaveText("");
    }
  });
});

/**
 * Caso de error: la página no puede quedarse en blanco si la base de datos
 * todavía no tiene configurada la boda. Se comprueba que el texto de respaldo
 * existe en los copys, que es lo que la página pintaría.
 */
test.describe("Landing sin configurar", () => {
  test("existe un mensaje para cuando no hay datos", () => {
    expect(copy.errores.generico.length).toBeGreaterThan(0);
  });
});

/**
 * CASO DE ERROR / ACCESIBILIDAD
 *
 * Un fondo en movimiento perpetuo es justo lo que marea a quien activa
 * «movimiento reducido». El cielo de la cuenta atrás tiene que pararse del
 * todo, no ralentizarse.
 */
test.describe("Cielo con movimiento reducido", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("el cielo deja de moverse", async ({ page }) => {
    await page.goto("/");

    const emulacionActiva = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    test.skip(
      !emulacionActiva,
      "Este navegador no aplica la emulación de prefers-reduced-motion",
    );

    const nombre = await page
      .locator("#cuenta-atras .cielo-estrellado")
      .evaluate((nodo) => getComputedStyle(nodo).animationName);

    expect(nombre).toBe("none");
  });
});

/**
 * BODA-36 · La víspera
 *
 * La entrega tiene una sección que aquí no existía: el plan del viernes para
 * quien viene de fuera. Se resuelve con la tabla del programa y una columna
 * que dice a qué momento pertenece cada hito, así que lo que hay que
 * comprobar es justo eso: que las dos secciones leen la misma tabla y no se
 * mezclan.
 */
test.describe("La víspera y el día", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("son dos secciones distintas y ninguna enseña los hitos de la otra", async ({
    page,
  }) => {
    const preboda = page.locator("#preboda");
    const programa = page.locator("#programa");

    // La sección de la víspera puede estar apagada: es contenido opcional y
    // entra desactivada. Si no está, no hay nada que comprobar aquí.
    test.skip((await preboda.count()) === 0, "La víspera está apagada en esta base.");

    await expect(preboda).toBeVisible();
    await expect(programa).toBeVisible();

    const horasPreboda = await preboda.locator("ol li").allTextContents();
    const horasPrograma = await programa.locator("ol li").allTextContents();

    expect(horasPreboda.length).toBeGreaterThan(0);
    expect(horasPrograma.length).toBeGreaterThan(0);

    // Ningún hito puede salir en las dos: significaría que falta el filtro por
    // momento y que la víspera está repitiendo el día de la boda.
    for (const hito of horasPreboda) {
      expect(horasPrograma, "un hito sale en las dos secciones").not.toContain(hito);
    }
  });

  test("la víspera va antes que el día, y en el menú también", async ({ page }) => {
    test.skip(
      (await page.locator("#preboda").count()) === 0,
      "La víspera está apagada en esta base.",
    );

    const orden = await page.evaluate(() =>
      [...document.querySelectorAll("main section")].map((seccion) => seccion.id),
    );
    expect(orden.indexOf("preboda")).toBeLessThan(orden.indexOf("programa"));

    const menu = await page.evaluate(() =>
      [...document.querySelectorAll("nav a")].map((enlace) => enlace.getAttribute("href")),
    );
    expect(menu.indexOf("#preboda")).toBeLessThan(menu.indexOf("#programa"));
  });
});

/**
 * BODA-108 y BODA-109 · La tipografía es la de la entrega, elemento a elemento.
 *
 * Salió de una auditoría con `getComputedStyle` contra la Landing aplicada del
 * estudio: el segundo nombre de la portada pesaba 400 y el primero 300, los
 * botones iban a 11 px en vez de a 12, y una versalita marcada como `h3` salía
 * en Cormorant porque la regla base de los titulares le imponía la serif. Nada
 * de eso se ve en una captura y todo se mide aquí.
 */
test.describe("La tipografía es la de la entrega", () => {
  /** Familia, peso y tamaño de un elemento, tal como los pinta el navegador. */
  async function medir(page: import("@playwright/test").Page, selector: string) {
    return page
      .locator(selector)
      .first()
      .evaluate((nodo) => {
        const estilo = getComputedStyle(nodo);
        return {
          familia: estilo.fontFamily,
          peso: Number(estilo.fontWeight),
          tamano: parseFloat(estilo.fontSize),
          interlinea: parseFloat(estilo.lineHeight) / parseFloat(estilo.fontSize),
        };
      });
  }

  for (const [nombre, ancho] of [
    ["móvil", 390],
    ["escritorio", 1280],
  ] as const) {
    test(`en ${nombre} los dos nombres de la portada pesan y miden lo mismo`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto("/");

      const primero = await medir(page, "#portada h1");
      const segundo = await medir(page, "#portada p.text-display");

      // El segundo nombre es un `<p>` a propósito (un solo h1 por página), y
      // aun así tiene que pesar 300 como el h1: el peso viaja con el componente.
      expect(segundo.peso, "el segundo nombre no pesa como el primero").toBe(primero.peso);
      expect(segundo.tamano).toBe(primero.tamano);
      expect(primero.peso).toBe(300);
    });
  }

  test("los botones y el menú van al escalón de 12 px", async ({ page }) => {
    await page.goto("/");

    const boton = await medir(page, `#portada a[href="#rsvp"]`);
    const enlaceMenu = await medir(page, "header nav a");

    expect(boton.tamano).toBe(12);
    expect(enlaceMenu.tamano).toBe(12);
    expect(boton.familia).toMatch(/Jost/);
  });

  test("el titular de sección llega a los 68 px de la entrega en escritorio", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    /*
      El paisaje queda fuera a propósito: su titular no es el de una sección de
      contenido, es el de la ESCENA, y la entrega le da su propia escala
      (38–98 px contra 38–68). Medir el primero que aparezca en el documento
      daría 94 px y diría que la escala está rota cuando está bien.
    */
    const titular = await medir(page, "main section:not(#paisaje) header h2");
    // 5.4vw a 1280 son 69,12: el clamp topa en 68. Con 5vw se quedaba en 64.
    expect(titular.tamano).toBe(68);
    expect(titular.peso).toBe(300);
  });

  test("las horas del programa van a interlínea 1 y tamaño fluido", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const hora = await medir(page, "#programa li > span");
    expect(hora.familia).toMatch(/Cormorant/);
    expect(hora.interlinea).toBeCloseTo(1, 2);
    // clamp(26px, 3.2vw, 36px) a 1280 → 36.
    expect(hora.tamano).toBe(36);

    // Y la víspera, un escalón por debajo: clamp(24px, 3vw, 32px) → 32.
    const horaVispera = await medir(page, "#preboda li > span");
    expect(horaVispera.tamano).toBe(32);
  });

  test("los datos de la portada van en Cormorant a interlínea 1.1", async ({ page }) => {
    await page.goto("/");
    const fecha = await medir(page, "#portada dd");
    expect(fecha.familia).toMatch(/Cormorant/);
    expect(fecha.interlinea).toBeCloseTo(1.1, 1);
  });

  /**
   * CASO DE ERROR. Es el fallo que se cazó: una versalita pintada como `h3`
   * heredaba la serif y el peso 300 de la regla base `h1–h4`. Aquí se recorre
   * TODA la página en busca de cualquier versalita —mayúsculas con espaciado—
   * que no sea Jost, sea cual sea su etiqueta. Si mañana alguien escribe otro
   * `<h3>` con clases de versalita, esto lo dice por su selector.
   */
  test("ninguna versalita de la landing sale en serif", async ({ page }) => {
    await page.goto("/");

    const enSerif = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main *, header *, footer *")]
        .filter((nodo) => nodo.childElementCount === 0 && nodo.textContent?.trim())
        .map((nodo) => ({ nodo, estilo: getComputedStyle(nodo) }))
        .filter(
          ({ estilo }) =>
            estilo.textTransform === "uppercase" && parseFloat(estilo.letterSpacing) > 1,
        )
        .filter(({ estilo }) => /Cormorant|serif/i.test(estilo.fontFamily.split(",")[0]))
        .map(({ nodo }) => `${nodo.tagName.toLowerCase()} «${nodo.textContent?.trim()}»`),
    );

    expect(enSerif, "una versalita ha heredado la serif de los titulares").toEqual([]);
  });

  test("ningún h3 pesa como un titular de sección", async ({ page }) => {
    await page.goto("/");

    const ligeros = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main h3")]
        .filter((nodo) => Number(getComputedStyle(nodo).fontWeight) < 400)
        .map((nodo) => nodo.textContent?.trim()),
    );

    expect(ligeros, "los h3 de la entrega pesan 400, no 300").toEqual([]);
  });
});

/**
 * BODA-110 a BODA-113 · El ritmo y la composición son los de la entrega.
 *
 * Medido con `getBoundingClientRect` contra la Landing aplicada. Lo que se
 * comprueba no es que haya tokens —eso ya lo vigila stylelint— sino que el
 * resultado en el navegador es el número de la entrega: 26 px de margen, una
 * cuenta atrás que respira con el ancho, un pie centrado con su monograma.
 */
test.describe("El ritmo y la composición son los de la entrega", () => {
  const ESCRITORIO = { width: 1280, height: 900 };

  test("el margen lateral de las secciones es el de la entrega (26 px)", async ({ page }) => {
    await page.goto("/");
    const margen = await page
      .locator("#programa")
      .evaluate((seccion) => parseFloat(getComputedStyle(seccion).paddingLeft));
    expect(margen).toBe(26);
  });

  test("la cuenta atrás respira con el ancho: 64 px en móvil, 102 en escritorio", async ({
    page,
  }) => {
    const relleno = async (ancho: number) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto("/");
      return page
        .locator("#cuenta-atras")
        .evaluate((seccion) => parseFloat(getComputedStyle(seccion).paddingTop));
    };
    // clamp(64px, 8vw, 104px): 64 a 390 y 102,4 a 1280.
    expect(await relleno(390)).toBe(64);
    expect(await relleno(1280)).toBeCloseTo(102.4, 0);
  });

  test("la barra mide 64 px", async ({ page }) => {
    await page.goto("/");
    const alto = await page
      .locator("header")
      .first()
      .evaluate((barra) => barra.getBoundingClientRect().height);
    // 64 más el filete de un píxel.
    expect(Math.round(alto)).toBe(65);
  });

  test("cada sección usa el ancho que le da la entrega", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const anchos = await page.evaluate(() =>
      Object.fromEntries(
        ["programa", "alojamiento", "playlist", "regalos"].map((id) => [
          id,
          Math.round(document.querySelector(`#${id} > div`)!.getBoundingClientRect().width),
        ]),
      ),
    );

    // 1080, 1180, 900 y 816 (51rem): cuatro anchos, no uno.
    expect(anchos.programa).toBe(1080);
    expect(anchos.alojamiento).toBe(1180);
    expect(anchos.playlist).toBe(900);
    expect(anchos.regalos).toBe(816);
  });

  test("regalos se centra entero: cabecera y tarjeta comparten eje", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const centros = await page.evaluate(() => {
      const centro = (nodo: Element) => {
        const caja = nodo.getBoundingClientRect();
        return Math.round(caja.left + caja.width / 2);
      };
      const seccion = document.querySelector("#regalos")!;
      return {
        cabecera: centro(seccion.querySelector("header h2")!),
        tarjeta: centro(seccion.querySelector("header + div")!),
        alineacion: getComputedStyle(seccion.querySelector("header")!).textAlign,
      };
    });

    expect(centros.alineacion).toBe("center");
    expect(Math.abs(centros.cabecera - centros.tarjeta)).toBeLessThanOrEqual(1);
  });

  test("en alojamiento y dress code la entradilla cae bajo el titular", async ({ page }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    for (const id of ["alojamiento", "dresscode"]) {
      const posicion = await page.evaluate((id) => {
        const cabecera = document.querySelector(`#${id} header`)!;
        const titulo = cabecera.querySelector("h2")!.getBoundingClientRect();
        const entradilla = cabecera.querySelector("p")!.getBoundingClientRect();
        return {
          debajo: entradilla.top >= titulo.bottom,
          mismoBorde: entradilla.left === titulo.left,
        };
      }, id);

      expect(posicion.debajo, `${id}: la entradilla no está bajo el titular`).toBe(true);
      expect(posicion.mismoBorde, `${id}: la entradilla no arranca donde el titular`).toBe(
        true,
      );
    }
  });

  test("cómo llegar es dos columnas: el botón con el texto y el mapa casi cuadrado", async ({
    page,
  }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const medidas = await page.evaluate(() => {
      const seccion = document.querySelector("#transporte")!;
      const boton = seccion.querySelector("a[target='_blank']")!.getBoundingClientRect();
      const mapa = seccion.querySelector("iframe")!.getBoundingClientRect();
      const rutas = seccion.querySelector("ul")!.getBoundingClientRect();
      return {
        botonALaIzquierdaDelMapa: boton.right <= mapa.left,
        rutasALaIzquierdaDelMapa: rutas.right <= mapa.left,
        proporcion: mapa.height / mapa.width,
        radio: getComputedStyle(seccion.querySelector("iframe")!).borderRadius,
      };
    });

    expect(medidas.botonALaIzquierdaDelMapa).toBe(true);
    expect(medidas.rutasALaIzquierdaDelMapa).toBe(true);
    expect(medidas.proporcion).toBeCloseTo(1.06, 2);
    expect(medidas.radio).toBe("0px");
  });

  test("las filas del programa llevan el filete vertical y cierran por arriba", async ({
    page,
  }) => {
    await page.goto("/");

    const fila = await page
      .locator("#programa ol > li")
      .first()
      .evaluate((li) => {
        const estilo = getComputedStyle(li);
        return {
          columnas: estilo.gridTemplateColumns.split(" ").length,
          filete: parseFloat(estilo.gridTemplateColumns.split(" ")[1]),
          arriba: parseFloat(estilo.borderTopWidth),
          abajo: parseFloat(estilo.borderBottomWidth),
        };
      });

    expect(fila.columnas).toBe(3);
    expect(fila.filete).toBe(1);
    expect(fila.arriba).toBe(1);
    expect(fila.abajo).toBe(0);

    // Y la víspera, al revés: cierra por abajo, como en la entrega.
    const vispera = await page
      .locator("#preboda ol > li")
      .first()
      .evaluate((li) => ({
        arriba: parseFloat(getComputedStyle(li).borderTopWidth),
        abajo: parseFloat(getComputedStyle(li).borderBottomWidth),
      }));
    expect(vispera).toEqual({ arriba: 0, abajo: 1 });
  });

  test("el pie es el de la entrega: centrado, con monograma, fecha y lugar", async ({
    page,
  }) => {
    await page.setViewportSize(ESCRITORIO);
    await page.goto("/");

    const pie = page.getByRole("contentinfo");
    const medidas = await pie.evaluate((nodo) => {
      const estilo = getComputedStyle(nodo);
      return {
        alineacion: estilo.textAlign,
        arriba: Math.round(parseFloat(estilo.paddingTop)),
        abajo: Math.round(parseFloat(estilo.paddingBottom)),
      };
    });
    // clamp(56px, 7vw, 88px) arriba → 88 a 1280; 40 fijos abajo.
    expect(medidas).toEqual({ alineacion: "center", arriba: 88, abajo: 40 });

    // El monograma: dos iniciales de la base y el «&» entre ellas. Lo visible
    // va en un span aria-hidden; lo que se anuncia son los nombres completos.
    await expect(pie.locator("p [aria-hidden]").first()).toHaveText(/^\S\s*&\s*\S$/);
    await expect(pie.locator("p .sr-only").first()).toContainText("(DES)");
    // La línea de fecha y lugar: «26 · 06 · 2027 — (DES) Finca…».
    await expect(pie.getByText(/^\d{2} · \d{2} · \d{4} — \(DES\)/)).toBeVisible();

    // Los enlaces van en Jost de 13 px y en caja normal, no en versalita.
    const enlace = await pie
      .getByRole("link")
      .first()
      .evaluate((a) => ({
        tamano: parseFloat(getComputedStyle(a).fontSize),
        caja: getComputedStyle(a).textTransform,
      }));
    expect(enlace).toEqual({ tamano: 13, caja: "none" });
  });

  /**
   * CASO DE ERROR. La foto de un hotel sigue la misma regla que la de un hito:
   * si no está publicada, la tarjeta se pinta sin ella y la imagen no aparece
   * por ninguna parte. El seed no enlaza fotos a los hoteles, así que lo que
   * se comprueba es la mitad que sí se puede: ninguna tarjeta trae un hueco de
   * imagen vacío, y una tarjeta sin foto empieza directamente por el texto.
   */
  test("una tarjeta de hotel sin foto no deja un hueco vacío", async ({ page }) => {
    await page.goto("/");
    const tarjetas = page.locator("#alojamiento ul > li");
    expect(await tarjetas.count()).toBeGreaterThan(0);

    for (const tarjeta of await tarjetas.all()) {
      const huecosVacios = await tarjeta.locator(".aspect-foto-tarjeta:not(:has(img))").count();
      expect(huecosVacios).toBe(0);
    }
  });
});

/**
 * BODA-114 a BODA-116 · Lo que la entrega escribe y en qué orden lo pone.
 *
 * Los copys que nombran la ciudad, las fechas escritas como en la entrega, los
 * avisos al pie del programa y el orden de las secciones. Todo sale de la
 * base: el seed marca la ciudad y los avisos con «(DES)», así que verlos en
 * pantalla es la prueba de que no hay un literal escondido.
 */
test.describe("Los copys y el orden de la entrega", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("la portada dice «Nos casamos en» la ciudad de la base", async ({ page }) => {
    const versalita = page.locator("#portada p").first();
    await expect(versalita).toHaveText(
      copy.portada.etiqueta.replace("{ciudad}", "(DES) León"),
      { ignoreCase: true },
    );
  });

  test("el programa lleva la fecha como «Sábado 26 de junio» y la víspera, el día antes", async ({
    page,
  }) => {
    const dia = await page.locator("#programa header span").first().textContent();
    const vispera = await page.locator("#preboda header span").first().textContent();

    // Día de la semana con inicial mayúscula, número y mes; ni coma ni año.
    const forma = /^[A-ZÁÉÍÓÚ][a-záéíóú]+ \d{1,2} de [a-z]+$/;
    expect(dia?.trim()).toMatch(forma);
    expect(vispera?.trim()).toMatch(forma);
    expect(vispera).not.toBe(dia);
  });

  test("el alojamiento cuenta los hoteles en letra y nombra la ciudad", async ({ page }) => {
    // El seed trae tres hoteles y la ciudad «(DES) León».
    await expect(page.locator("#alojamiento header p")).toContainText(
      "tres hoteles de (DES) León",
    );
    // Y el plazo, sin día de la semana: «antes del 1 de mayo de 2027».
    await expect(page.locator("#alojamiento header p")).toContainText(
      /antes del \d{1,2} de [a-z]+ de \d{4}\./,
    );
  });

  test("los avisos del programa se pintan como etiquetas al pie de la lista", async ({
    page,
  }) => {
    const avisos = page.locator("#programa ol + ul li");
    await expect(avisos).toHaveCount(2);
    await expect(avisos.first()).toContainText("(DES) Etiqueta elegante");
  });

  test("el alojamiento va antes que «cómo llegar», y el menú lo hereda", async ({ page }) => {
    const orden = await page.evaluate(() =>
      [...document.querySelectorAll("main section[id]")].map((seccion) => seccion.id),
    );
    expect(orden.indexOf("alojamiento")).toBeLessThan(orden.indexOf("transporte"));

    const menu = await page
      .getByRole("navigation", { name: copy.navegacion.etiquetaPrincipal })
      .getByRole("link")
      .evaluateAll((enlaces) => enlaces.map((enlace) => enlace.getAttribute("href")));
    expect(menu.indexOf("#alojamiento")).toBeLessThan(menu.indexOf("#transporte"));
  });

  test("el pie escribe el lugar con la ciudad detrás", async ({ page }) => {
    await expect(
      page.getByRole("contentinfo").getByText(/— \(DES\) Finca de pruebas, \(DES\) León$/),
    ).toBeVisible();
  });
});

/**
 * BODA-118 a BODA-120 · El movimiento de la entrega, medido con getAnimations.
 *
 * Una animación no se ve en una captura y su ausencia tampoco: por eso cada
 * gesto de la entrega se comprueba leyendo lo que el navegador tiene puesto
 * —nombre, retardo, duración, curva— y no lo que dice una clase.
 */
test.describe("El movimiento es el de la entrega", () => {
  test("la portada entra escalonada, de la versalita a la pista", async ({ page }) => {
    await page.goto("/");

    const retardos = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#portada [class*='retardo-']")].map((nodo) =>
        parseFloat(getComputedStyle(nodo).animationDelay),
      ),
    );

    // Siete elementos con siete retardos distintos, de 0,2 s a 1,6 s. No van en
    // orden de documento a propósito: «bajad» está antes que los botones en el
    // DOM y entra el último, como en la entrega.
    expect(retardos).toHaveLength(7);
    expect([...retardos].sort((a, b) => a - b)).toEqual([0.2, 0.35, 0.5, 0.8, 0.95, 1.1, 1.6]);
    expect(retardos[0], "la versalita abre").toBeCloseTo(0.2, 2);
  });

  test("la foto de portada aparece en fundido y hace el zoom lento", async ({ page }) => {
    await page.goto("/");

    const foto = await page
      .locator("#portada img")
      .first()
      .evaluate((img) => ({
        nombre: getComputedStyle(img).animationName,
        duracion: getComputedStyle(img).animationDuration,
        fundido: getComputedStyle(img.closest(".animacion-aparecer-lento")!).animationName,
      }));

    expect(foto.nombre).toBe("acercar");
    expect(foto.duracion).toBe("2.4s");
    expect(foto.fundido).toBe("aparecer");
  });

  test("la pista «bajad» cae y se apaga en 2,6 s", async ({ page }) => {
    await page.goto("/");
    const raya = await page.locator("#portada .animacion-flotar").evaluate((nodo) => ({
      nombre: getComputedStyle(nodo).animationName,
      periodo: getComputedStyle(nodo).animationDuration,
    }));
    expect(raya).toEqual({ nombre: "flotar", periodo: "2.6s" });
  });

  test("las tarjetas se levantan al pasar el ratón", async ({ page }) => {
    await page.goto("/");
    const tarjeta = page.locator("#alojamiento ul > li").first();
    // Arriba del todo de la pantalla, pasado el tramo del reveal: mientras el
    // reveal está activo es él quien manda en el `transform`, no el hover.
    await tarjeta.evaluate((nodo) => nodo.scrollIntoView({ block: "start" }));
    await tarjeta.hover();

    // El `transform` es una matriz: la última cifra es el desplazamiento
    // vertical, y tiene que ser negativo (sube) una vez acabe la transición.
    await expect
      .poll(async () =>
        tarjeta.evaluate((nodo) => {
          const matriz = getComputedStyle(nodo).transform.match(/[-\d.]+/g);
          return matriz ? Number(matriz.at(-1)) : 0;
        }),
      )
      .toBeLessThan(0);
  });

  test("el cielo de la cuenta atrás deriva en 44 s exactos", async ({ page }) => {
    await page.goto("/");
    const cielo = await page
      .locator("#cuenta-atras .cielo-estrellado")
      .evaluate((nodo) => getComputedStyle(nodo).animationDuration);
    expect(cielo).toBe("44s, 7s");
  });

  test("la barra de lectura mide lo leído y la cabecera se compacta al bajar", async ({
    page,
  }) => {
    await page.goto("/");

    const soportado = await page.evaluate(() => CSS.supports("animation-timeline: scroll()"));
    test.skip(!soportado, "Este navegador no anima con el scroll: la barra no se pinta.");

    const barra = page.locator(".barra-lectura");
    await expect(barra).toHaveCSS("height", "2px");
    await expect(barra).toHaveCSS("position", "fixed");

    const alfaDe = (color: string) => {
      const partes = color.match(/[\d.]+/g) ?? [];
      return partes.length === 4 ? Number(partes[3]) : 1;
    };
    const fondoArriba = await page
      .locator("header")
      .first()
      .evaluate((h) => getComputedStyle(h).backgroundColor);
    expect(alfaDe(fondoArriba), "arriba del todo la cabecera es transparente").toBe(0);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await expect
      .poll(async () =>
        barra.evaluate((nodo) => {
          const matriz = getComputedStyle(nodo).transform.match(/[-\d.]+/g);
          return matriz ? Number(matriz[0]) : 0;
        }),
      )
      .toBeGreaterThan(0.3);
    const fondoAbajo = await page
      .locator("header")
      .first()
      .evaluate((h) => getComputedStyle(h).backgroundColor);
    expect(alfaDe(fondoAbajo), "al bajar la cabecera se vela").toBeGreaterThan(0);
  });

  /**
   * CASO DE ERROR. Con «movimiento reducido», los retardos de la portada se
   * anulan: si no, «bajad» tardaría 1,6 s en aparecer aunque su fundido durase
   * 100 ms, y los reveals tienen que estar a la vista sin más. El pop de las
   * fichas de la playlist se comprueba en `playlist.spec.ts`, que es donde se
   * apunta una canción de verdad: el seed no trae ninguna.
   */
  test("con movimiento reducido nada espera ni se queda oculto", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const activo = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    test.skip(!activo, "Este navegador no aplica la emulación de prefers-reduced-motion");

    const estado = await page.evaluate(() => {
      const retardos = [
        ...document.querySelectorAll<HTMLElement>("#portada [class*='retardo-']"),
      ];
      return {
        retardos: retardos.map((n) => getComputedStyle(n).animationDelay),
        reveal: getComputedStyle(
          document.querySelector("#cuenta-atras .animacion-cortina-al-ver")!,
        ).animationName,
        pista: getComputedStyle(document.querySelector("#portada .animacion-flotar")!)
          .animationName,
      };
    });

    expect(new Set(estado.retardos)).toEqual(new Set(["0s"]));
    expect(estado.reveal).toBe("aparecer");
    expect(estado.pista).toBe("none");

    // El fundido dura 100 ms: se espera a que acabe, no se mira a mitad.
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("#portada [class*='retardo-']")].map(
            (n) => getComputedStyle(n).opacity,
          ),
        ),
      )
      .toEqual(Array(7).fill("1"));
  });
});
