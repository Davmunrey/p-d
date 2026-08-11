import type { Page } from "@playwright/test";

/**
 * EL RASTRO DE UNA PESTAÑA: QUÉ SALIÓ, QUÉ VOLVIÓ Y A DÓNDE DECÍA IR
 *
 * Vivía copiado dentro de `panel-proveedores.spec.ts`. Se saca aquí porque el
 * fallo que persigue —#126— aparece en cuatro specs distintos, y una copia por
 * spec es cuatro sitios donde arreglar lo mismo.
 *
 *
 * LO QUE APORTA RESPECTO A LA VERSIÓN QUE HABÍA: EL DESTINO DE LA REDIRECCIÓN
 *
 * La versión original apuntaba método, código y URL de la petición. Con eso,
 * un fallo de #126 se lee así:
 *
 *     POST 303 → http://localhost:3000/panel/proveedores
 *
 * …y se queda a medias, porque **`respuesta.url()` es a dónde se ENVIÓ el
 * POST, no a dónde decía la respuesta que fuera**. El dato que hace falta para
 * cerrar #126 es el otro: el `Location` de ese `303`. Distingue dos averías que
 * hoy se ven idénticas —
 *
 *   · apunta a la URL con `?estado=` y el navegador no la sigue
 *     → el problema está en el router de cliente;
 *   · apunta a la misma URL sin query
 *     → el problema está en el servidor.
 *
 * Se estuvo dando por hecho que ese dato sólo salía abriendo la traza de
 * Playwright del artefacto de CI, que desde el contenedor de trabajo no se
 * puede descargar. No es cierto: la respuesta pasa por aquí y sus cabeceras
 * están a mano. El diagnóstico cabe en el registro del propio CI.
 *
 * Se apuntan las dos cabeceras que puede usar Next para redirigir: `location`
 * —camino sin JavaScript— y `x-action-redirect` —camino de acción de servidor,
 * donde la redirección viaja aparte del `Location`—. Medido contra la propia
 * aplicación compilada en producción: por el camino de cliente llega
 * `x-action-redirect: /ruta?estado=algo;push` y `location` viene vacío.
 *
 *
 * Y LO QUE PIDE EL ENRUTADOR DESPUÉS, que es la otra mitad de la respuesta.
 * Sabiendo el destino, quedan cuatro lecturas y cada una señala a un sitio
 * distinto:
 *
 *   · sin destino               → el servidor no llegó a redirigir;
 *   · destino y ni una petición → el enrutador lo recibió y no hizo nada;
 *   · destino y petición rota   → se cayó yendo a por la página nueva;
 *   · destino, petición correcta y ninguna navegación
 *                               → tenía la página nueva y no la aplicó.
 *
 * Sin esto, las cuatro se ven igual: «POST 303 y ahí se acaba».
 *
 *
 * SE APUNTA EL POST AL SALIR Y AL VOLVER. Escuchando sólo la respuesta, una
 * petición que se queda a medias no deja ni una línea, y ese silencio se
 * confunde con «no se envió nada» — que es justo la distinción que hace falta.
 *
 * OJO AL LEERLO: un `ERR_ABORTED` sobre el POST **no es el fallo**. Sale igual
 * en ejecuciones que pasan —medido: reproduciendo la misma pantalla contra la
 * aplicación compilada, el POST aparece cortado y la navegación se hace
 * después—; es cómo el navegador reporta la petición original cuando el
 * enrutador se lleva la respuesta por su cuenta. Lo mismo con los `_rsc`
 * abortados, que son prefetch cancelados de rutina.
 *
 * SÓLO SE APUNTAN LAS PETICIONES ROTAS QUE VIENEN DESPUÉS DE LA ACCIÓN. Antes
 * hay decenas de prefetch cancelados —una pantalla con dieciséis secciones dejó
 * once seguidos— y con el rastro recortado a las últimas líneas, ese ruido
 * empuja fuera justo lo que hay que leer. Las del POST se apuntan siempre.
 *
 * Se guarda en un `WeakMap` y no en una variable suelta porque cada test tiene
 * su propia `page` y fuera de CI corren en paralelo.
 */
const rastro = new WeakMap<Page, string[]>();

export function seguirLaPista(pagina: Page): void {
  const pasos: string[] = [];
  rastro.set(pagina, pasos);

  // Antes de la primera acción, los `_rsc` son prefetch de rutina y son
  // decenas; después, son el enrutador yendo a por la página nueva. Sólo
  // interesan los segundos.
  let huboPost = false;

  pagina.on("framenavigated", (marco) => {
    if (marco === pagina.mainFrame()) pasos.push(`navega a ${marco.url()}`);
  });

  pagina.on("request", (peticion) => {
    if (peticion.method() !== "POST") return;
    // `next-action` sólo viaja por el camino de cliente. Su ausencia dice que
    // el formulario se envió de forma nativa, sin que React lo interceptase.
    const accion = peticion.headers()["next-action"];
    pasos.push(`POST sale → ${peticion.url()} ${accion ? "(cliente)" : "(nativo)"}`);
  });

  pagina.on("response", (respuesta) => {
    const peticion = respuesta.request();

    if (peticion.method() === "POST") {
      huboPost = true;
      const cabeceras = respuesta.headers();
      const destino = cabeceras["location"] ?? cabeceras["x-action-redirect"];
      pasos.push(
        `POST vuelve ${respuesta.status()} · destino=${destino ?? "(ninguno en cabeceras)"}`,
      );
      return;
    }

    // Lo que el enrutador pide DESPUÉS de la acción: ahí se ve si llegó a
    // intentar la navegación. Ver el porqué en la cabecera del fichero.
    if (huboPost && peticion.url().includes("_rsc=")) {
      pasos.push(`el enrutador pide ${respuesta.status()} ← ${peticion.url()}`);
    }
  });

  pagina.on("requestfailed", (peticion) => {
    if (!huboPost && peticion.method() !== "POST") return;
    pasos.push(
      `${peticion.method()} cortada (${peticion.failure()?.errorText ?? "sin motivo"}) → ${peticion.url()}`,
    );
  });

  pagina.on("pageerror", (fallo) => pasos.push(`error de página: ${fallo.message}`));

  pagina.on("console", (mensaje) => {
    if (mensaje.type() === "error") pasos.push(`consola: ${mensaje.text()}`);
  });
}

/** El rastro en texto, para pegarlo en el mensaje de un fallo. */
export function laPista(pagina: Page): string {
  const pasos = rastro.get(pagina);
  if (!pasos?.length) return "(no se apuntó nada: ¿falta `seguirLaPista`?)";
  return pasos.slice(-30).join("\n");
}
