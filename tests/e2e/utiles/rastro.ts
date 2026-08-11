import type { Page } from "@playwright/test";

/**
 * EL RASTRO DE UNA PESTAÑA: QUÉ SALIÓ, QUÉ VOLVIÓ Y QUÉ SE ROMPIÓ
 *
 * Una acción de servidor que escribe y redirige deja una huella muy concreta:
 * un `POST` que sale, su respuesta con código, y una navegación a la URL nueva.
 * Cuando algo falla, distinguir entre
 *
 *   · el POST NO SALIÓ           → el formulario no llegó a enviarse
 *   · salió y respondió 500      → la acción reventó
 *   · respondió bien y no navegó → el redirect se perdió por el camino
 *
 * son tres averías con tres arreglos distintos, y desde el registro de CI no se
 * distinguen sin esto. Costó cinco vueltas de CI en BODA-29 no tenerlo: la
 * subida fallaba, el servidor no escribía nada y la URL no cambiaba, y sin
 * saber si el POST había salido siquiera no había forma de acotar.
 *
 * SE APUNTA EL POST AL SALIR Y AL VOLVER, y ésa es la diferencia que importa.
 * Escuchando sólo `response` —como hacía la versión original de este ayudante,
 * que vive copiada en `panel-proveedores.spec.ts`— un POST que se queda a medias
 * no deja ni una línea, y el silencio se confunde con «no se envió nada».
 *
 * Se guarda en un `WeakMap` y no en una variable suelta porque cada test tiene
 * su propia `page` y fuera de CI corren en paralelo.
 */
const rastro = new WeakMap<Page, string[]>();

export function seguirLaPista(pagina: Page): void {
  const pasos: string[] = [];
  rastro.set(pagina, pasos);

  pagina.on("framenavigated", (marco) => {
    if (marco === pagina.mainFrame()) pasos.push(`navega a ${marco.url()}`);
  });

  pagina.on("request", (peticion) => {
    if (peticion.method() === "POST") pasos.push(`POST sale → ${peticion.url()}`);
  });

  pagina.on("response", (respuesta) => {
    if (respuesta.request().method() === "POST") {
      pasos.push(`POST vuelve ${respuesta.status()} ← ${respuesta.url()}`);
    }
  });

  pagina.on("requestfailed", (peticion) => {
    pasos.push(
      `${peticion.method()} FALLÓ (${peticion.failure()?.errorText ?? "sin motivo"}) → ${peticion.url()}`,
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
  return pasos.join("\n");
}
