import { test as base, type TestInfo } from "@playwright/test";

export type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Locator,
  Page,
  Request,
  Response,
  TestInfo,
} from "@playwright/test";

/**
 * CADA TEST ES UN INVITADO DISTINTO
 *
 * El cortafuegos del RSVP cuenta los intentos fallidos POR ORIGEN: la IP que
 * llega en `x-forwarded-for` (ver `src/lib/huella-peticion.ts`). Sin esa
 * cabecera, todos los tests de la suite caen en el mismo cupo de respaldo, y
 * el décimo enlace inválido que visite CUALQUIER test —el barrido de
 * accesibilidad, el de la CSP, el de la playlist con una cookie caducada—
 * cierra el RSVP a los que vienen detrás durante quince minutos. En el CI, con
 * un solo worker y la suite entera en siete minutos, eso se lee como «un token
 * falso y uno revocado dan la misma respuesta» en rojo: el revocado contestaba
 * «demasiados intentos» porque otros veinte tests ya habían gastado el cupo.
 *
 * Aquí cada test recibe una dirección propia, derivada de su nombre, su
 * proyecto y su reintento: lo que un test gaste sólo lo paga él. Es lo que pasa
 * en la realidad —cada invitado llega desde su casa— y justo lo que el
 * cortafuegos existe para distinguir. Los tests del propio cortafuegos siguen
 * gastando su cupo entero… en su dirección, con los contextos que ya se crean
 * a mano en `rsvp.spec.ts`.
 *
 * Vale para `page`, `context` y `request`, que salen de las opciones del test.
 * Un `browser.newContext()` hecho a mano no las hereda: si visita enlaces que
 * no existen, que lleve su `extraHTTPHeaders`, como hace `rsvp.spec.ts`.
 *
 * Los specs importan `test` y `expect` de aquí y no de `@playwright/test`; un
 * unitario lo vigila para que el siguiente spec no vuelva al cupo compartido
 * sin darse cuenta.
 */
export function origenDe(info: Pick<TestInfo, "titlePath" | "project" | "retry">): string {
  const semilla = `${info.project.name}|${info.titlePath.join(" › ")}|${info.retry}`;

  // FNV-1a de 32 bits: determinista, sin dependencias, y con 2^24 direcciones
  // en 10/8 para unos cientos de tests no hay colisiones que temer.
  let hash = 2166136261;
  for (const caracter of semilla) {
    hash ^= caracter.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return `10.${(hash >>> 16) & 255}.${(hash >>> 8) & 255}.${hash & 255}`;
}

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, usar, info) => {
    await usar({ ...extraHTTPHeaders, "x-forwarded-for": origenDe(info) });
  },
});

export const expect = test.expect;

/**
 * Para un `browser.newContext()` hecho a mano dentro de un test: el mismo
 * origen que ya llevan `page` y `request`, para que lo que ese contexto gaste
 * lo pague este test y no el resto de la suite.
 */
export const origenDelTest = (): Record<string, string> => ({
  "x-forwarded-for": origenDe(test.info()),
});
