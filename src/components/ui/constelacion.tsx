import { constelacionPorClave, GROSOR_TRAZO, type Constelacion } from "@/config/constelaciones";

/**
 * UNA CONSTELACIÓN
 *
 * Dibuja el mapa que hay en `config/constelaciones.ts`: primero las líneas,
 * luego las estrellas encima. El orden importa —si se pintaran al revés, cada
 * línea cruzaría por delante de la estrella y el punto perdería el brillo.
 *
 * NO LLEVA NI UN COLOR. Las estrellas van a `fill-constelacion-estrella` y el
 * trazo a `stroke-constelacion-trazo`, dos semánticos que se reasignan solos en
 * los cuatro fondos del sistema: claro, oscuro, bloque inverso y pie. Meterla
 * en una sección marino la aclara sin tocar una clase, que es justamente lo que
 * el sistema promete.
 *
 * EL VIEWBOX ES 100 × 100 Y EL SVG NO TIENE TAMAÑO PROPIO: ocupa el hueco que
 * le dé quien la usa. Así el mismo mapa vale para un marcasitios de 40 px y
 * para un cartel, sin duplicar coordenadas.
 *
 * ACCESIBILIDAD. Por defecto es decoración y va `aria-hidden`: en una página
 * donde acompaña a un nombre, anunciar «Lira» sería ruido. Cuando la
 * constelación **es** la información —el catálogo del sistema de marca, o el
 * día que una mesa se identifique por su dibujo— se le pasa `rotulada` y
 * entonces se anuncia con su nombre.
 */

/** Lado del lienzo. Las coordenadas del mapa son porcentajes de este número. */
const LIENZO = 100;

export function Constelacion({
  clave,
  rotulada = false,
  className = "",
}: {
  clave: string;
  /** Si es información y no adorno: se anuncia con su nombre. */
  rotulada?: boolean;
  className?: string;
}) {
  const constelacion: Constelacion | undefined = constelacionPorClave(clave);

  // Una clave que no existe no puede tumbar la página que la pinta: se calla.
  // Que la clave exista lo garantiza el test unitario, no un error en runtime.
  if (!constelacion) return null;

  const { estrellas, lineas, nombre } = constelacion;
  const idTitulo = `constelacion-${constelacion.clave}`;

  return (
    <svg
      viewBox={`0 0 ${LIENZO} ${LIENZO}`}
      className={`block h-full w-full ${className}`}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      role={rotulada ? "img" : undefined}
      aria-hidden={rotulada ? undefined : true}
      aria-labelledby={rotulada ? idTitulo : undefined}
    >
      {rotulada ? <title id={idTitulo}>{nombre}</title> : null}

      {lineas.map(([desde, hasta]) => {
        const [x1, y1] = estrellas[desde];
        const [x2, y2] = estrellas[hasta];
        return (
          <line
            key={`${desde}-${hasta}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className="stroke-constelacion-trazo"
            strokeWidth={GROSOR_TRAZO}
            strokeLinecap="round"
          />
        );
      })}

      {estrellas.map(([x, y, radio]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={radio}
          className="fill-constelacion-estrella"
        />
      ))}
    </svg>
  );
}
