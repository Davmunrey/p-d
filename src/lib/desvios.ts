import { UMBRAL_AVISO_PRESUPUESTO } from "@/config/constants";

/**
 * BODA-64 · CUÁNDO UNA CATEGORÍA SE ESTÁ YENDO DE MADRE
 *
 * AQUÍ Y NO EN `lib/bbdd/presupuesto.ts` porque esto no toca la base: recibe
 * filas y devuelve conclusiones. Sacarlo del módulo `server-only` es lo que
 * permite probarlo con tests unitarios —umbral, orden, el caso del presupuesto
 * a cero— en vez de deducirlo montando media boda en un E2E.
 *
 * PIDE LA FORMA MÍNIMA y no `ResumenCategoria` entera: así el tipo dice qué
 * necesita de verdad, y quien lo llame desde otro sitio no tiene que fabricar
 * campos que no se miran.
 */
export interface FilaDeCategoria {
  categoriaId: string;
  categoria: string;
  importePrevisto: number;
  desviacion: number;
}

/**
 * LO QUE VA COSTANDO UNA CATEGORÍA.
 *
 * No es `real`, y confundirlos esconde dinero. `real` sólo suma las partidas
 * ya cerradas: una categoría con el catering firmado en 8.600 € y las flores
 * todavía estimadas en 500 € enseñaría 8.600 y las flores desaparecerían de la
 * cuenta.
 *
 * Lo que hay que enseñar es «real donde lo haya, estimado donde no», partida a
 * partida — y eso ya lo calcula la vista para su `desviacion`. En vez de
 * repetir la suma aquí con otro criterio (que es exactamente cómo dos cifras de
 * la misma pantalla acaban sin cuadrar), se despeja de ella:
 *
 *     desviacion = previsto − loQueVaCostando
 *     loQueVaCostando = previsto − desviacion
 *
 * Una sola definición, la de la base, y la pantalla no puede discrepar.
 */
export function loQueVaCostando(fila: FilaDeCategoria): number {
  return fila.importePrevisto - fila.desviacion;
}

/**
 * DOS GRADOS Y NO UNO.
 *
 * «Superado» llega tarde por definición: el dinero ya está comprometido. El
 * aviso que de verdad cambia algo es el de antes —«te quedan doscientos euros
 * de flores»—, porque todavía se puede llamar a la floristería. Enterarse de
 * que una categoría se ha ido de madre cuando ya se ha firmado no sirve de nada.
 */
export type GradoDesvio = "superado" | "cerca";

export interface Desvio {
  categoriaId: string;
  categoria: string;
  previsto: number;
  vaCostando: number;
  grado: GradoDesvio;
}

/**
 * Las categorías que se han pasado o están a punto, lo peor primero.
 *
 * NO SE VUELVE A PREGUNTAR A LA BASE. Sale de `v_resumen_presupuesto`, que ya
 * calcula la desviación con el criterio bueno —el importe acordado cuando lo
 * hay y el estimado mientras no—. Una segunda suma con otro criterio es cómo la
 * portada acaba avisando de algo que el módulo no ve.
 */
export function desviosDe(filas: FilaDeCategoria[]): Desvio[] {
  const desvios: Desvio[] = [];

  for (const fila of filas) {
    /*
      SIN PRESUPUESTO NO HAY DESVÍO.

      Una categoría con cero previsto no es una que se haya pasado: es una que
      todavía no se ha presupuestado. Avisar de ella sacaría un aviso rojo el
      primer día, cuando lo único que pasa es que aún no se ha hecho el número —
      y un aviso que aparece sin que nadie haya hecho nada mal enseña a no
      mirarlos. Es el mismo criterio que usa el tope de los pagos.
    */
    if (fila.importePrevisto <= 0) continue;

    const vaCostando = loQueVaCostando(fila);
    const grado: GradoDesvio | null =
      vaCostando > fila.importePrevisto
        ? "superado"
        : vaCostando >= fila.importePrevisto * UMBRAL_AVISO_PRESUPUESTO
          ? "cerca"
          : null;

    if (!grado) continue;

    desvios.push({
      categoriaId: fila.categoriaId,
      categoria: fila.categoria,
      previsto: fila.importePrevisto,
      vaCostando,
      grado,
    });
  }

  /*
    LO PEOR PRIMERO, y dentro de cada grado lo que más se ha pasado.

    El orden del presupuesto —el que eligieron los novios— no sirve aquí: si el
    banquete se ha ido de madre y está el noveno, el aviso lo entierra. Este
    bloque existe para contestar «¿de qué me tengo que preocupar?», y esa
    respuesta empieza por lo más gordo.
  */
  return desvios.sort((uno, otro) => {
    if (uno.grado !== otro.grado) return uno.grado === "superado" ? -1 : 1;
    return otro.vaCostando - otro.previsto - (uno.vaCostando - uno.previsto);
  });
}
