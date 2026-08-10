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
   */
  test("la «y» entre los nombres se pinta con Italianno", async ({ page }) => {
    const conector = page.getByText(copy.portada.conjuncion, { exact: true }).first();
    await expect(conector).toBeVisible();

    const familia = await conector.evaluate(
      (elemento) => getComputedStyle(elemento).fontFamily,
    );
    expect(familia).toContain("Italianno");

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
