import { expect, test } from "@playwright/test";

import copy from "../../content/copy.es.json";

/**
 * BODA-02 · Sistema de design tokens
 *
 * Lo que se verifica no es que la página se vea bonita, sino que la ARQUITECTURA
 * de tokens funciona: que los semánticos resuelven, que las utilidades de
 * Tailwind apuntan a ellos en vez de copiar el valor, y que los bloques
 * inversos los reasignan sin que ningún componente cambie una clase.
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
    // que permite que los bloques inversos funcionen reasignando semánticos,
    // sin que ningún componente se entere.
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
 * NO HAY MODO OSCURO. NUNCA.
 *
 * La web nació siguiendo `prefers-color-scheme`, y eso significaba que media
 * lista de invitados abría la invitación en oscuro sin haberlo pedido: una
 * pieza que nadie diseñó, porque la entrega del estudio es clara. Se quitó el
 * tema entero —no se cambió el valor por defecto, se quitó—, y esto lo sujeta.
 *
 * ES UN FALLO QUE NO SE VE DESDE UN NAVEGADOR EN CLARO, que es como se
 * desarrolla y como se revisan las capturas. Sin estos tests volvería solo, y
 * volvería invisible: el único que lo notaría es un invitado con el móvil en
 * oscuro, y ése no puede avisar.
 */
test.describe("Nunca hay modo oscuro", () => {
  /** El fondo real del `body`, de 0 (negro) a 255 (blanco). */
  async function luminosidadDelFondo(pagina: import("@playwright/test").Page) {
    return pagina.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.body)
        .backgroundColor.match(/\d+/g)!
        .map(Number);
      return (r + g + b) / 3;
    });
  }

  /**
   * CAMINO FELIZ · con el móvil en oscuro, la invitación sigue siendo clara.
   *
   * Se mira el color real y no una clase: el fondo sale del mismo token en los
   * dos casos, así que comprobar la clase pasaría igual estando mal.
   */
  test("con el sistema en oscuro, la web sigue siendo clara", async ({ browser }) => {
    const contexto = await browser.newContext({ colorScheme: "dark" });
    const pagina = await contexto.newPage();

    try {
      await pagina.goto("/");
      expect(await luminosidadDelFondo(pagina), "el fondo tiene que ser claro").toBeGreaterThan(
        200,
      );
    } finally {
      await contexto.close();
    }
  });

  /**
   * CASO DE ERROR · ni forzándolo a mano.
   *
   * Es el test que de verdad impide que el tema vuelva: mientras exista
   * cualquier regla colgando de `[data-tema]`, esto se pone oscuro. Comprueba
   * los dos valores que llegó a haber, porque volver a añadir uno solo bastaría
   * para que a alguien se le pusiera la invitación en negro.
   */
  for (const valor of ["oscuro", "sistema"]) {
    test(`el atributo data-tema="${valor}" no enciende nada`, async ({ browser }) => {
      const contexto = await browser.newContext({ colorScheme: "dark" });
      const pagina = await contexto.newPage();

      try {
        await pagina.goto("/");
        await pagina.evaluate(
          (tema) => document.documentElement.setAttribute("data-tema", tema),
          valor,
        );

        expect(
          await luminosidadDelFondo(pagina),
          "no queda ninguna regla de tema a la que agarrarse",
        ).toBeGreaterThan(200);
      } finally {
        await contexto.close();
      }
    });
  }

  /**
   * CASO DE ERROR · lo que pinta el sistema operativo, no nuestros tokens.
   *
   * Los campos del RSVP, la barra de desplazamiento, el selector de fecha y el
   * relleno automático los pinta el navegador, y en un móvil en oscuro los pinta
   * oscuros por mucho que nuestro CSS sea claro. `color-scheme: light` es la
   * única declaración que le dice que no, y no se nota en las capturas: hay que
   * afirmarlo aquí.
   */
  test("los controles del navegador tampoco se van a oscuro", async ({ browser }) => {
    const contexto = await browser.newContext({ colorScheme: "dark" });
    const pagina = await contexto.newPage();

    try {
      await pagina.goto("/");
      const esquema = await pagina.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      );
      expect(esquema).toBe("light");
    } finally {
      await contexto.close();
    }
  });
});
