import { NextResponse } from "next/server";

import { obtenerCuentaRegalos } from "@/lib/bbdd/landing";

/**
 * BODA-28 · EL NÚMERO DE CUENTA, SÓLO CUANDO SE PIDE
 *
 * El criterio del ticket es que el IBAN **no aparezca en el HTML entregado**
 * hasta que alguien pulse. No es cosmético: un número de cuenta escrito en el
 * HTML lo indexan los buscadores y lo recogen los rastreadores sin que nadie
 * haya mirado la página. Pedirlo aparte deja fuera a todo lo que no es una
 * persona delante de la web.
 *
 * NO ES UN SECRETO Y NO SE PRETENDE QUE LO SEA. Quien conozca esta ruta puede
 * pedirla, igual que cualquiera que abra la sección. Lo que se evita es la
 * recogida automática y sin intención, que es de lo que se protege un dato así
 * en una web pública.
 *
 * La autorización, como siempre, la hace la base: `datos_para_regalos()`
 * devuelve cero filas si la sección está apagada o si no hay IBAN, y entonces
 * esto responde 404. Aquí no se decide nada.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const cuenta = await obtenerCuentaRegalos();

  if (!cuenta) {
    return NextResponse.json({ error: "sin-cuenta" }, { status: 404 });
  }

  return NextResponse.json(cuenta, {
    headers: {
      // Ni cachés intermedias ni buscadores: es un dato bancario.
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
