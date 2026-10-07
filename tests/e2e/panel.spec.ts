import { expect, test } from "./utiles/origen-propio";

import copy from "../../content/copy.es.json";
import {
  RUTA_ACCESO,
  RUTA_CUENTA,
  RUTA_DOCUMENTOS,
  RUTA_GASTOS,
  RUTA_GUION_DIA,
  RUTA_INVITADOS,
  RUTA_MESAS,
  RUTA_MESAS_REPARTO,
  RUTA_PAGOS,
  RUTA_PANEL,
  RUTA_PRESUPUESTO,
  RUTA_PROVEEDORES,
  RUTA_TAREAS,
} from "../../src/config/constants";
import {
  GRUPOS_DE_MODULOS,
  MODULOS,
  MODULOS_EN_LA_BARRA,
  MODULOS_ENTREGADOS,
  modulosDe,
} from "../../src/config/modulos";

/**
 * BODA-42 · El esqueleto del panel
 *
 * El recorrido de verdad —entrar, navegar, cerrar sesión— necesita GoTrue, así
 * que vive en el trabajo de CI que levanta el Supabase local y se salta en
 * cualquier otro sitio.
 *
 * Lo que sí se prueba en todas partes está más abajo: que las pantallas del
 * panel no se guardan en la caché del navegador. Esa es la que muerde de
 * verdad, y no hace falta sesión para comprobarla.
 */

const CORREO_CON_ACCESO = process.env.CORREO_CON_ACCESO;
const CONTRASENA = process.env.CONTRASENA_PRUEBAS;

test.describe("Dentro del panel", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
  });

  test("se navega entre módulos y el menú dice dónde estás", async ({ page }) => {
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();

    await expect(menu.getByRole("link", { name: copy.panel.modulos.resumen })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await menu.getByRole("link", { name: copy.panel.modulos.cuenta }).click();

    await expect(page).toHaveURL(new RegExp(RUTA_CUENTA));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(copy.panel.cuenta.titulo);
    await expect(menu.getByRole("link", { name: copy.panel.modulos.cuenta })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("el nombre que se guarda es el que aparece en el menú", async ({ page }) => {
    // Escribe de verdad en `perfiles`: si esto pasa, la pantalla está cableada.
    const nombre = "(PRUEBA) Nombre cambiado";

    await page.goto(RUTA_CUENTA);
    await page.getByLabel(copy.panel.cuenta.nombre).fill(nombre);
    await page.getByRole("button", { name: copy.panel.cuenta.guardar }).click();

    await expect(page.getByRole("main").getByRole("status")).toHaveText(
      copy.panel.cuenta.guardado,
    );
    // «Has entrado como…» vive al pie del menú, no en una franja encima de
    // cada pantalla.
    await expect(
      page.getByRole("navigation", { name: copy.panel.navegacion }).first(),
    ).toContainText(nombre);

    // Y sigue ahí al recargar, que es lo que separa guardar de aparentarlo.
    await page.reload();
    await expect(page.getByLabel(copy.panel.cuenta.nombre)).toHaveValue(nombre);
  });

  test("un nombre de sólo espacios no se guarda", async ({ page }) => {
    await page.goto(RUTA_CUENTA);
    const campo = page.getByLabel(copy.panel.cuenta.nombre);
    const original = await campo.inputValue();

    // DOS espacios, y no uno, a propósito. Con uno el navegador ni siquiera
    // envía el formulario —lo para su propio `minlength`— y lo que se estaría
    // probando es el navegador, no nuestro código. Con dos pasa esa criba y
    // llega al servidor, que es quien tiene que darse cuenta de que un nombre
    // que al recortarlo se queda en nada no es un nombre.
    await campo.fill("  ");
    await page.getByRole("button", { name: copy.panel.cuenta.guardar }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      copy.panel.cuenta.nombreCorto,
    );

    await page.goto(RUTA_CUENTA);
    await expect(campo).toHaveValue(original);
  });

  test("un nombre más largo de lo que cabe se explica y no se guarda", async ({ page }) => {
    await page.goto(RUTA_CUENTA);
    const campo = page.getByLabel(copy.panel.cuenta.nombre);
    const original = await campo.inputValue();

    // El `maxlength` del campo lo pararía antes; se quita para que llegue al
    // servidor, que es quien tiene que saber decir que no cabe.
    const tope = Number(await campo.getAttribute("maxlength"));
    expect(tope, "el campo tiene que llevar su tope").toBeGreaterThan(0);
    await campo.evaluate((input) => input.removeAttribute("maxlength"));
    await campo.fill("N".repeat(tope + 1));
    await page.getByRole("button", { name: copy.panel.cuenta.guardar }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      copy.panel.cuenta.nombreLargo.replace("{largo}", String(tope)),
    );

    await page.goto(RUTA_CUENTA);
    await expect(campo).toHaveValue(original);
  });

  test("los módulos sin terminar no están en el menú", async ({ page }) => {
    // Un menú que enseña ocho módulos cuando funcionan dos no es una promesa:
    // es una trampa.
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();

    for (const modulo of MODULOS.filter((cada) => !cada.entregado)) {
      await expect(
        menu.getByRole("link", { name: copy.panel.modulos[modulo.clave] }),
      ).toHaveCount(0);
    }
  });

  /**
   * CAMINO FELIZ · El lateral va en grupos, y cada grupo es una lista con su
   * nombre: «Preparativos, lista, 4 elementos». Trece rótulos iguales en una
   * columna se recorrían enteros cada vez.
   */
  test("el lateral agrupa los módulos por lo que contestan", async ({ page }) => {
    const menu = page.getByRole("navigation", { name: copy.panel.navegacion }).first();

    for (const grupo of GRUPOS_DE_MODULOS) {
      const lista = menu.getByRole("list", { name: copy.panel.grupos[grupo] });
      const esperados = modulosDe(grupo).map((modulo) => copy.panel.modulos[modulo.clave]);
      await expect(lista.getByRole("link")).toHaveText(esperados);
    }

    // Y la web, con su nombre y avisando de que se abre aparte.
    const web = menu.getByRole("link", { name: copy.panel.menu.verLaWeb });
    await expect(web).toHaveAttribute("href", "/");
    await expect(web).toHaveAttribute("target", "_blank");
    await expect(web).toHaveAccessibleName(
      new RegExp(copy.panel.menu.otraPestana.replace(/[()]/g, "\\$&")),
    );
  });

  // --- El caso que de verdad importa -----------------------------------

  test("tras cerrar sesión, «atrás» no devuelve al panel", async ({ page }) => {
    await page.goto(RUTA_CUENTA);
    await page.getByRole("button", { name: copy.acceso.cerrarSesion }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));

    await page.goBack();

    // En un portátil compartido, esto es la diferencia entre haber salido y
    // dejar la lista de invitados a la vista de quien lo coja después.
    await expect(page).toHaveURL(new RegExp(RUTA_ACCESO));
    await expect(page.getByRole("button", { name: copy.acceso.cerrarSesion })).toHaveCount(0);
  });
});

test.describe("La caché del panel", () => {
  test("las pantallas del panel no se guardan en el navegador", async ({ request }) => {
    // Sin `no-store`, el navegador devuelve la pantalla desde su historial sin
    // volver a pedirla: ni el middleware ni RLS llegan a enterarse de que la
    // sesión ya no vale.
    //
    // Se pide sin seguir la redirección a propósito: lo que no puede quedarse
    // guardada es también la respuesta que echa a la puerta.
    for (const ruta of [RUTA_PANEL, RUTA_CUENTA]) {
      const respuesta = await request.get(ruta, { maxRedirects: 0 });
      expect(respuesta.headers()["cache-control"] ?? "", ruta).toContain("no-store");
    }
  });
});

/*
 * No hay aquí el test contrario —«la landing sí se cachea»— porque hoy sería
 * falso: la landing se sirve con `force-dynamic` y también sin caché. Fue una
 * decisión meditada y está explicada en `src/app/page.tsx`: cuando se cacheaba
 * una hora, un fallo puntual de la base dejaba la pantalla de «estamos
 * preparando la web» servida durante esa hora entera, y pasó en producción.
 */

/*
  AUDITORÍA DE DISEÑO · LA NAVEGACIÓN DEL PANEL.

  · En el móvil, la barra de abajo repartía su ancho a partes iguales: con
    trece módulos en 390 px, cada casilla tenía 28 px y los rótulos —que no se
    parten— se montaban unos encima de otros.
  · En escritorio, el lateral fijo no se desplazaba: con menos de ~750 px de
    alto, los últimos módulos quedaban fuera de la pantalla y no había forma de
    llegar a ellos.
*/
test.describe("La navegación del panel en pantallas pequeñas", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  async function entrar(page: import("@playwright/test").Page) {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
  }

  /**
   * CAMINO FELIZ · En el móvil, cuatro destinos fijos y «Más». La barra era
   * una tira de trece rótulos que había que arrastrar para encontrar cada uno.
   * Desde «Más» se llega a cualquier módulo, y la hoja se cierra al elegir.
   */
  test("en el móvil la barra lleva cuatro destinos y «Más» abre el menú entero", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page);

    const barra = page.getByRole("navigation", { name: copy.panel.navegacion }).last();
    const destinos = barra.getByRole("link");
    await expect(destinos).toHaveText(
      MODULOS_EN_LA_BARRA.map((clave) => copy.panel.barra[clave]),
    );
    const mas = barra.getByRole("button", { name: copy.panel.barra.mas });

    // Ningún rótulo se sale de su hueco, y cada hueco se puede tocar.
    const medidas = await barra.locator("a, button").evaluateAll((todos) =>
      todos.map((destino) => ({
        sobra: destino.scrollWidth - destino.clientWidth,
        ancho: destino.getBoundingClientRect().width,
        alto: destino.getBoundingClientRect().height,
      })),
    );
    for (const medida of medidas) {
      expect(medida.sobra).toBeLessThanOrEqual(1);
      expect(medida.ancho).toBeGreaterThanOrEqual(44);
      expect(medida.alto).toBeGreaterThanOrEqual(44);
    }

    await mas.click();
    const hoja = page.getByRole("dialog", { name: copy.panel.menu.titulo });
    await expect(hoja).toBeVisible();
    await expect(mas).toHaveAttribute("aria-expanded", "true");

    await hoja.getByRole("link", { name: copy.panel.modulos.presupuesto }).click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_PRESUPUESTO}$`));
    await expect(hoja).toBeHidden();

    // En un módulo sin hueco propio, la hoja dice dónde se está.
    await mas.click();
    await expect(
      hoja.getByRole("link", { name: copy.panel.modulos.presupuesto }),
    ).toHaveAttribute("aria-current", "page");
  });

  /**
   * CASO DE ERROR · La hoja no atrapa a nadie: Escape la cierra y el foco
   * vuelve a «Más», que es de donde salió. Y cerrar sesión, que ya no está
   * encima de cada pantalla, está dentro.
   */
  test("en el móvil la hoja se cierra con Escape y lleva el cierre de sesión", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page);

    const mas = page
      .getByRole("navigation", { name: copy.panel.navegacion })
      .last()
      .getByRole("button", { name: copy.panel.barra.mas });
    await mas.click();
    const hoja = page.getByRole("dialog", { name: copy.panel.menu.titulo });
    await expect(hoja.getByRole("button", { name: copy.acceso.cerrarSesion })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(hoja).toBeHidden();
    await expect(mas).toBeFocused();
    await expect(mas).toHaveAttribute("aria-expanded", "false");

    // Y el botón de cerrar de la propia hoja también la cierra.
    await mas.click();
    await hoja.getByRole("button", { name: copy.panel.menu.cerrar }).click();
    await expect(hoja).toBeHidden();
  });

  /**
   * CASO DE ERROR · Abierta en una tableta en vertical y girada a horizontal,
   * la hoja quedaba oculta pero seguía siendo modal: la página entera dejaba
   * de responder. Al dejar de verse la barra, se cierra.
   */
  test("si la barra del móvil desaparece con la hoja abierta, la hoja se cierra", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrar(page);

    await page
      .getByRole("navigation", { name: copy.panel.navegacion })
      .last()
      .getByRole("button", { name: copy.panel.barra.mas })
      .click();
    const hoja = page.getByRole("dialog", { name: copy.panel.menu.titulo });
    await expect(hoja).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    // Por el elemento y no por su papel: cerrada, ya no está en el árbol
    // accesible y `getByRole` no la encontraría para preguntarle.
    await expect
      .poll(() =>
        page
          .locator("dialog")
          .evaluateAll((dialogos) =>
            dialogos.some((dialogo) => (dialogo as HTMLDialogElement).open),
          ),
      )
      .toBe(false);

    // Y el lateral responde: nada se ha quedado inerte detrás.
    await page
      .getByRole("navigation", { name: copy.panel.navegacion })
      .first()
      .getByRole("link", { name: copy.panel.modulos.tareas })
      .click();
    await expect(page).toHaveURL(/\/panel\/tareas$/);
  });

  test("en un portátil bajo, el lateral se desplaza y llega al último módulo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await entrar(page);

    const lateral = page.getByRole("navigation", { name: copy.panel.navegacion }).first();
    const ultimo = lateral.getByRole("link", {
      name: copy.panel.modulos[MODULOS_ENTREGADOS.at(-1)!.clave],
    });
    await ultimo.scrollIntoViewIfNeeded();
    await expect(ultimo).toBeInViewport();
    await ultimo.click();
    await expect(page).toHaveURL(new RegExp(MODULOS_ENTREGADOS.at(-1)!.ruta));
  });
});

/*
  LAS PESTAÑAS DE CADA MÓDULO. Gastos, pagos y gráficas colgaban de tres
  enlaces sueltos bajo la descripción del presupuesto, cada uno con su
  «Volver»; ahora las hermanas se ven siempre, arriba, y la abierta se marca.
*/
test.describe("Las pestañas de cada módulo", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
  });

  const pestanasDe = (page: import("@playwright/test").Page, modulo: string) =>
    page.getByRole("navigation", {
      name: copy.panel.pestanas.de.replace("{modulo}", modulo),
    });

  /** CAMINO FELIZ · Se pasa de una hermana a otra y la marca la sigue. */
  test("las pestañas del presupuesto llevan a sus pantallas y marcan la abierta", async ({
    page,
  }) => {
    await page.goto(RUTA_GASTOS);
    const pestanas = pestanasDe(page, copy.panel.modulos.presupuesto);

    await expect(pestanas.getByRole("link")).toHaveText([
      copy.panel.pestanas.categorias,
      copy.panel.pestanas.gastos,
      copy.panel.pestanas.pagos,
      copy.panel.pestanas.graficas,
    ]);
    await expect(
      pestanas.getByRole("link", { name: copy.panel.pestanas.gastos }),
    ).toHaveAttribute("aria-current", "page");

    await pestanas.getByRole("link", { name: copy.panel.pestanas.pagos }).click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_PAGOS}$`));
    await expect(
      pestanas.getByRole("link", { name: copy.panel.pestanas.pagos }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      pestanas.getByRole("link", { name: copy.panel.pestanas.gastos }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  /**
   * CASO DE ERROR · Una pantalla de dentro marca su pestaña madre, no la
   * primera ni ninguna: la ficha de una invitación sigue en «Invitaciones».
   */
  test("la ficha de una invitación marca «Invitaciones» y no «Sin contestar»", async ({
    page,
  }) => {
    await page.goto(RUTA_INVITADOS);
    // La primera ficha de la lista: las pestañas también cuelgan de
    // `/panel/invitados/`, así que se busca un enlace con identificador.
    const fichas = await page
      .locator(`main a[href^="${RUTA_INVITADOS}/"]`)
      .evaluateAll((enlaces) =>
        enlaces
          .map((enlace) => enlace.getAttribute("href") ?? "")
          .filter((href) => /\/[0-9a-f-]{36}$/.test(href)),
      );
    expect(fichas.length, "la semilla trae invitaciones").toBeGreaterThan(0);
    await page.goto(fichas[0]);
    await expect(page).toHaveURL(new RegExp(`${RUTA_INVITADOS}/[0-9a-f-]{36}`));

    const pestanas = pestanasDe(page, copy.panel.modulos.invitados);
    await expect(
      pestanas.getByRole("link", { name: copy.panel.pestanas.invitaciones }),
    ).toHaveAttribute("aria-current", "page");
    await expect(pestanas.locator('[aria-current="page"]')).toHaveCount(1);
  });
});

test.describe("La acción de crear, arriba", () => {
  test.skip(
    !CORREO_CON_ACCESO || !CONTRASENA,
    "Necesita el Supabase local: solo corre en el trabajo de CI que lo levanta.",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto(RUTA_ACCESO);
    await page.getByLabel(copy.acceso.correo).fill(CORREO_CON_ACCESO!);
    await page.getByLabel(copy.acceso.contrasena).fill(CONTRASENA!);
    await page.getByRole("button", { name: copy.acceso.entrar }).click();
    await expect(page).toHaveURL(new RegExp(RUTA_PANEL));
  });

  /** El botón de debajo del título y el título del alta a la que salta. */
  const PANTALLAS = [
    {
      ruta: RUTA_INVITADOS,
      accion: copy.panel.invitados.accionNueva,
      alta: copy.panel.invitados.nuevaTitulo,
    },
    {
      ruta: RUTA_PROVEEDORES,
      accion: copy.panel.proveedores.nuevoTitulo,
      alta: copy.panel.proveedores.nuevoTitulo,
    },
    {
      ruta: RUTA_PRESUPUESTO,
      accion: copy.panel.presupuesto.nuevaTitulo,
      alta: copy.panel.presupuesto.nuevaTitulo,
    },
    {
      ruta: RUTA_GASTOS,
      accion: copy.panel.presupuesto.gastos.nuevaTitulo,
      alta: copy.panel.presupuesto.gastos.nuevaTitulo,
    },
    {
      ruta: RUTA_PAGOS,
      accion: copy.panel.presupuesto.pagos.nuevaTitulo,
      alta: copy.panel.presupuesto.pagos.nuevaTitulo,
    },
    {
      ruta: RUTA_TAREAS,
      accion: copy.panel.tareas.nuevaTitulo,
      alta: copy.panel.tareas.nuevaTitulo,
    },
    {
      ruta: RUTA_DOCUMENTOS,
      accion: copy.panel.documentos.nuevoTitulo,
      alta: copy.panel.documentos.nuevoTitulo,
    },
    {
      ruta: RUTA_GUION_DIA,
      accion: copy.panel.dia.escribir.nuevoTitulo,
      alta: copy.panel.dia.escribir.nuevoTitulo,
    },
  ];

  /**
   * CAMINO FELIZ · El alta de cada pantalla estaba al final, debajo de todo lo
   * que ya hay —la de proveedores, a cuatro mil quinientos píxeles—. El botón
   * de debajo del título salta a ella y la deja a la vista.
   */
  test("el botón de debajo del título lleva al alta de cada pantalla", async ({ page }) => {
    for (const { ruta, accion, alta } of PANTALLAS) {
      await page.goto(ruta);
      const boton = page.getByRole("main").getByRole("link", { name: accion, exact: true });
      await expect(boton, `${ruta} lleva su acción arriba`).toBeVisible();
      await expect(boton, `${ruta}: la acción va antes que la lista`).toBeInViewport();

      await boton.click();
      await expect(
        page.getByRole("heading", { name: alta, exact: true }),
        `${ruta}: el alta queda a la vista`,
      ).toBeInViewport();
    }
  });

  /**
   * CASO DE ERROR · Un botón que salta a un alta que no está en la pantalla
   * no hace nada, y parece roto. Pasa en cuanto la pantalla esconde el alta
   * —sin categorías no se apunta un gasto; sin gastos, un pago— o la lista
   * se filtra o cambia de vista. En cada variante, si hay botón, su destino
   * existe.
   */
  test("ningún botón de arriba salta a un alta que no está", async ({ page }) => {
    // Quince pantallas enteras, cada una `force-dynamic`: no caben en el plazo
    // de una.
    test.slow();
    const variantes = [
      ...PANTALLAS.map(({ ruta }) => ruta),
      `${RUTA_TAREAS}?vista=tablero`,
      `${RUTA_PROVEEDORES}?buscar=ninguno-${Date.now()}`,
      `${RUTA_INVITADOS}?buscar=ninguno-${Date.now()}`,
      `${RUTA_GASTOS}?categoria=no-existe`,
      // Las mesas viven de anclas: el índice de las bolsas y «Ir a una mesa».
      RUTA_MESAS,
      RUTA_MESAS_REPARTO,
    ];

    for (const ruta of variantes) {
      await page.goto(ruta);
      const destinos = await page
        .getByRole("main")
        .locator("a[href^='#']")
        .evaluateAll((enlaces) =>
          enlaces
            .map((enlace) => enlace.getAttribute("href")!.slice(1))
            .filter((id) => id.length > 0)
            .map((id) => ({ id, existe: document.getElementById(id) !== null })),
        );
      for (const { id, existe } of destinos) {
        expect(existe, `${ruta} salta a #${id}, que no está en la pantalla`).toBe(true);
      }
    }
  });
});
