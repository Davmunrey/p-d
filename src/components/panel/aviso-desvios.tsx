import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Cuerpo, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_PRESUPUESTO } from "@/config/constants";
import { type Desvio } from "@/lib/bbdd/presupuesto";
import { t } from "@/lib/copy";

/**
 * BODA-64 · EL AVISO DE DESVÍO, EN LA PORTADA DEL PANEL
 *
 * ESTÁ AQUÍ Y NO SÓLO DENTRO DEL PRESUPUESTO porque quien se ha pasado con el
 * catering no entra al módulo de presupuesto a comprobarlo: entra a mirar
 * cuántos han confirmado. Un aviso que sólo se ve donde ya ibas a mirar no
 * avisa de nada.
 *
 * NO ES SÓLO UN COLOR. Lleva icono y lleva palabra —«Se ha pasado», «A punto de
 * pasarse»—, porque el rojo no lo lee ni un daltónico, ni un lector de pantalla,
 * ni nadie con el sol dando en la pantalla. El icono va `aria-hidden`: quien lo
 * necesita ya tiene el texto, y anunciarlo dos veces es ruido.
 *
 * SI NO HAY NADA QUE DECIR, NO SE DICE NADA. Un recuadro permanente que la
 * mayoría de los días pone «todo en orden» enseña a saltárselo con la vista, y
 * el día que sí trae algo tampoco se lee.
 */
export function AvisoDesvios({ desvios }: { desvios: Desvio[] }) {
  if (desvios.length === 0) return null;

  const hayPasados = desvios.some((desvio) => desvio.grado === "superado");

  return (
    <section
      /*
        `role="status"` y no `alert`: esto ya está en la página cuando se abre,
        no aparece de golpe. `alert` interrumpe lo que el lector de pantalla
        estuviera diciendo, y para eso tendría que ser algo que acaba de pasar.
      */
      role="status"
      className={`rounded-tarjeta border p-interno ${
        hayPasados ? "border-error bg-error-fondo" : "border-aviso bg-aviso-fondo"
      }`}
    >
      <Titulo3 como="h2">{t("panel.resumen.desvios.titulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.resumen.desvios.ayuda")}
      </Cuerpo>

      <ul className="mt-elemento grid gap-pila">
        {desvios.map((desvio) => (
          <li key={desvio.categoriaId} className="flex items-baseline gap-interno-compacto">
            <Icono grado={desvio.grado} />
            <span className="text-pequeno text-tinta">
              <span className="font-titulo text-tinta">{desvio.categoria}</span>{" "}
              {t(
                desvio.grado === "superado"
                  ? "panel.resumen.desvios.superado"
                  : "panel.resumen.desvios.cerca",
              )}
            </span>
          </li>
        ))}
      </ul>

      <EnlaceSuave href={RUTA_PRESUPUESTO} className="mt-elemento">
        {t("panel.resumen.desvios.verPresupuesto")}
      </EnlaceSuave>
    </section>
  );
}

/**
 * Dos formas distintas y no dos colores del mismo dibujo: el triángulo y el
 * círculo se distinguen en blanco y negro y a tamaño pequeño, que es la prueba
 * que un color no pasa.
 */
function Icono({ grado }: { grado: Desvio["grado"] }) {
  const esPasado = grado === "superado";

  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 translate-y-linea ${esPasado ? "text-error" : "text-aviso"}`}
    >
      {esPasado ? (
        <path
          d="M8 1.5 15 14.5H1z M8 6v4 M8 12v.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M8 5v4 M8 11v.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
