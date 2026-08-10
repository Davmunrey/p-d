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
 * Caso de error: la página no puede quedarse en blanco si la base de datos
 * todavía no tiene configurada la boda. Se comprueba que el texto de respaldo
 * existe en los copys, que es lo que la página pintaría.
 */
test.describe("Landing sin configurar", () => {
  test("existe un mensaje para cuando no hay datos", () => {
    expect(copy.errores.generico.length).toBeGreaterThan(0);
  });
});
