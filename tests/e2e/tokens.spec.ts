import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";

/**
 * BODA-02 · Sistema de design tokens
 *
 * Lo que se verifica no es que la página se vea bonita, sino que la ARQUITECTURA
 * de tokens funciona: que los semánticos resuelven, que el tema oscuro los
 * reasigna sin tocar componentes, y que la preferencia persiste.
 */

/** Lee el valor computado de una variable CSS en el elemento raíz. */
async function leerToken(page: import("@playwright/test").Page, token: string) {
  return page.evaluate(
    (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim(),
    `--${token}`,
  );
}

test.describe("Sistema de diseño", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/cocina");
  });

  test("los tokens semánticos resuelven a un valor real", async ({ page }) => {
    for (const token of ["fondo", "superficie", "tinta", "marca", "borde", "foco"]) {
      expect(await leerToken(page, token), `El token --${token} no resuelve`).not.toBe("");
    }
  });

  test("la utilidad de Tailwind resuelve al mismo valor que el token semántico", async ({
    page,
  }) => {
    // Con `@theme inline`, la utilidad `bg-superficie` compila a
    // `var(--superficie)`: no hay copia del valor, hay referencia. Esto es lo
    // que permite que el tema oscuro y los bloques inversos funcionen
    // reasignando semánticos, sin que ningún componente se entere.
    const { pintado, token } = await page.evaluate(() => {
      const sonda = document.createElement("div");
      sonda.className = "bg-superficie";
      document.body.appendChild(sonda);
      const pintado = getComputedStyle(sonda).backgroundColor;
      sonda.remove();

      const raiz = getComputedStyle(document.documentElement);
      const referencia = document.createElement("div");
      referencia.style.backgroundColor = raiz.getPropertyValue("--superficie").trim();
      document.body.appendChild(referencia);
      const token = getComputedStyle(referencia).backgroundColor;
      referencia.remove();

      return { pintado, token };
    });

    expect(pintado).not.toBe("");
    expect(pintado).toBe(token);
  });

  test("el tema oscuro reasigna semánticos sin tocar componentes", async ({ page }) => {
    const fondoClaro = await leerToken(page, "fondo");
    const tintaClara = await leerToken(page, "tinta");

    await page.getByRole("button", { name: copy.cocina.temaOscuro }).click();

    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
    expect(await leerToken(page, "fondo")).not.toBe(fondoClaro);
    expect(await leerToken(page, "tinta")).not.toBe(tintaClara);
  });

  test("la preferencia de tema sobrevive a una recarga", async ({ page }) => {
    await page.getByRole("button", { name: copy.cocina.temaOscuro }).click();
    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");

    await page.reload();

    // Aplicado antes del primer pintado: sin fogonazo blanco.
    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
    await expect(page.getByRole("button", { name: copy.cocina.temaOscuro })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("el selector de tema es accesible por teclado", async ({ page }) => {
    const boton = page.getByRole("button", { name: copy.cocina.temaOscuro });
    await boton.focus();
    await expect(boton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  });

  test("se muestran todos los grupos de tokens de color", async ({ page }) => {
    for (const grupo of [
      copy.cocina.grupoSuperficies,
      copy.cocina.grupoTinta,
      copy.cocina.grupoMarca,
      copy.cocina.grupoBordes,
      copy.cocina.grupoEstado,
    ]) {
      await expect(page.getByRole("heading", { name: grupo })).toBeVisible();
    }
  });
});

/**
 * Caso de error / accesibilidad: con `prefers-reduced-motion` activado, las
 * animaciones se reducen. No es un extra: hay personas a las que el movimiento
 * les provoca mareo real.
 */
test.describe("Movimiento reducido", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("el CSS entregado contiene la regla de movimiento reducido", async ({ page }) => {
    await page.goto("/cocina");

    // Independiente de que el navegador sepa emular la preferencia: comprueba
    // que la regla existe en la hoja de estilos que llega al invitado.
    const tieneRegla = await page.evaluate(() =>
      Array.from(document.styleSheets).some((hoja) => {
        try {
          return Array.from(hoja.cssRules).some(
            (regla) =>
              regla instanceof CSSMediaRule &&
              regla.conditionText.includes("prefers-reduced-motion"),
          );
        } catch {
          // Hoja de otro origen: no se puede inspeccionar, no es la nuestra.
          return false;
        }
      }),
    );

    expect(tieneRegla).toBe(true);
  });

  test("las animaciones se acortan al mínimo", async ({ page }) => {
    await page.goto("/cocina");

    const emulacionActiva = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    // Algunos navegadores de contenedor no aplican la emulación de Playwright.
    // Mejor saltar que dar un verde falso.
    test.skip(
      !emulacionActiva,
      "Este navegador no aplica la emulación de prefers-reduced-motion",
    );

    const duracion = await page
      .locator(".animacion-subir")
      .first()
      .evaluate((elemento) => getComputedStyle(elemento).animationDuration);

    // El token --duration-instant vale 100ms.
    expect(duracion).toBe("0.1s");
  });
});

/**
 * La prueba de fuego del sistema de tokens: los MISMOS componentes, sin una
 * sola clase distinta, dentro de un bloque inverso. Si esto funciona, cambiar
 * el aspecto de una sección entera no obliga a tocar ningún componente.
 */
test.describe("Bloques inversos", () => {
  test("los mismos componentes se adaptan sin cambiar de clase", async ({ page }) => {
    await page.goto("/cocina");

    const bloque = page.locator('[data-prueba="bloque-inverso"]');
    await expect(bloque).toBeVisible();

    const { normal, inverso } = await page.evaluate(() => {
      const dentro = document.querySelector('[data-prueba="bloque-inverso"]')!;
      const raiz = getComputedStyle(document.documentElement);
      return {
        normal: raiz.getPropertyValue("--fondo").trim(),
        inverso: getComputedStyle(dentro).getPropertyValue("--fondo").trim(),
      };
    });

    expect(inverso).not.toBe("");
    expect(inverso).not.toBe(normal);
  });

  test("el texto del bloque inverso mantiene contraste suficiente", async ({ page }) => {
    await page.goto("/cocina");

    // Comprobación real de contraste: el color de texto computado dentro del
    // bloque tiene que separarse del fondo del propio bloque, no del de la
    // página. Un bloque inverso mal resuelto da texto oscuro sobre oscuro.
    const ratio = await page.evaluate(() => {
      const bloque = document.querySelector('[data-prueba="bloque-inverso"]') as HTMLElement;
      const estilo = getComputedStyle(bloque);

      const luminancia = (color: string) => {
        const [r, g, b] = color
          .match(/\d+(\.\d+)?/g)!
          .slice(0, 3)
          .map(Number);
        const canal = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
      };

      const lFondo = luminancia(estilo.backgroundColor);
      const lTexto = luminancia(estilo.color);
      const claro = Math.max(lFondo, lTexto);
      const oscuro = Math.min(lFondo, lTexto);
      return (claro + 0.05) / (oscuro + 0.05);
    });

    // AA para texto normal exige 4.5:1.
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * Este test existe por un fallo real. El bloque inverso reasignaba `--marca`
   * y las tintas, pero se dejó `--acento` sin tocar: un botón primario dentro
   * salía oliva sobre oliva, prácticamente invisible, y el test de contraste
   * de arriba no lo veía porque solo mira el texto del contenedor.
   *
   * Se comprueba el botón contra su PROPIO fondo, que es lo que ve quien mira.
   */
  test("el botón primario se ve dentro de un bloque inverso", async ({ page }) => {
    await page.goto("/cocina");

    const medida = await page.evaluate(() => {
      const bloque = document.querySelector('[data-prueba="bloque-inverso"]')!;
      const boton = bloque.querySelector("button") as HTMLElement;
      const estiloBoton = getComputedStyle(boton);
      const estiloBloque = getComputedStyle(bloque as HTMLElement);

      const luminancia = (color: string) => {
        const [r, g, b] = color
          .match(/\d+(\.\d+)?/g)!
          .slice(0, 3)
          .map(Number);
        const canal = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
      };

      const contraste = (a: string, b: string) => {
        const claro = Math.max(luminancia(a), luminancia(b));
        const oscuro = Math.min(luminancia(a), luminancia(b));
        return (claro + 0.05) / (oscuro + 0.05);
      };

      return {
        // El rótulo tiene que leerse sobre el relleno del botón…
        rotulo: contraste(estiloBoton.backgroundColor, estiloBoton.color),
        // …y el botón tiene que distinguirse del fondo de la sección.
        relleno: contraste(estiloBoton.backgroundColor, estiloBloque.backgroundColor),
      };
    });

    expect(medida.rotulo).toBeGreaterThanOrEqual(4.5);
    // 3:1 es el umbral AA para elementos de interfaz no textuales.
    expect(medida.relleno).toBeGreaterThanOrEqual(3);
  });
});

/**
 * BODA-08 · El cero sobrevive al cierre del vocabulario de espaciado
 *
 * Cerrar el hueco de `--spacing` apagaba también `top-0` e `inset-0`, que
 * salen de la misma escala — y con ellos la barra fija de navegación, en
 * silencio. Aquí se comprueba lo único comprobable en un navegador: que la
 * barra sigue pegada arriba.
 *
 * Lo otro —que `p-4` ya no exista— NO se puede probar así: Tailwind sólo
 * compila las clases que encuentra en el código, de modo que cualquier clase
 * inyectada en runtime mide cero, exista o no la utilidad. Eso se comprueba en
 * `tests/unidad/estilos.test.ts`, que mira el CSS y el código fuente.
 */
test.describe("El vocabulario de espaciado está cerrado", () => {
  test("el cero sobrevive: la barra sigue pegada arriba", async ({ page }) => {
    await page.goto("/");

    const barra = await page.evaluate(() => {
      const fija = document.querySelector<HTMLElement>(".fixed, .sticky");
      if (!fija) return null;
      const estilo = getComputedStyle(fija);
      return { posicion: estilo.position, arriba: estilo.top };
    });

    expect(barra, "no hay barra fija que comprobar").not.toBeNull();
    expect(barra!.arriba).toBe("0px");
  });
});

/**
 * LA WEB ES CLARA MIENTRAS NADIE ELIJA OTRA COSA.
 *
 * Nació siguiendo la preferencia del sistema, y eso significaba que media lista
 * de invitados abría la invitación en oscuro sin haberlo pedido: una pieza que
 * nadie diseñó, porque la entrega del estudio es clara. Se cambió el criterio, y
 * esto lo sujeta — es un fallo que no se ve en un navegador en claro, así que
 * sin test volvería solo.
 */
test.describe("El tema por defecto", () => {
  test("con el sistema en oscuro, la web sigue siendo clara", async ({ browser }) => {
    const contexto = await browser.newContext({ colorScheme: "dark" });
    const pagina = await contexto.newPage();

    try {
      await pagina.goto("/");

      // Nadie ha elegido nada: no hay atributo que forzar el tema.
      await expect(pagina.locator("html")).not.toHaveAttribute("data-tema", /.*/);

      /*
        Se mira el color real y no una clase: el fondo claro y el oscuro salen
        del mismo token, así que comprobar la clase pasaría en los dos casos.
        El claro es muy luminoso y el oscuro muy apagado — no hay ambigüedad.
      */
      const luminosidad = await pagina.evaluate(() => {
        const [r, g, b] = getComputedStyle(document.body)
          .backgroundColor.match(/\d+/g)!
          .map(Number);
        return (r + g + b) / 3;
      });

      expect(luminosidad, "el fondo tiene que ser claro").toBeGreaterThan(200);
    } finally {
      await contexto.close();
    }
  });

  /**
   * Y quien SÍ lo elige, manda: «sistema» dejó de ser el valor por defecto,
   * pero sigue significando lo que dice.
   */
  test("quien elige seguir al sistema, lo sigue", async ({ browser }) => {
    const contexto = await browser.newContext({ colorScheme: "dark" });
    const pagina = await contexto.newPage();

    try {
      await pagina.goto("/");
      await pagina.evaluate(() =>
        document.documentElement.setAttribute("data-tema", "sistema"),
      );

      const luminosidad = await pagina.evaluate(() => {
        const [r, g, b] = getComputedStyle(document.body)
          .backgroundColor.match(/\d+/g)!
          .map(Number);
        return (r + g + b) / 3;
      });

      expect(luminosidad, "eligiendo «sistema» y con el sistema oscuro").toBeLessThan(80);
    } finally {
      await contexto.close();
    }
  });
});
