/**
 * El giro de cada desplegable, escrito entero: Tailwind sólo compila las
 * clases que encuentra tal cual en el código. Cada `<details>` que lo usa
 * lleva su grupo con nombre (`group/regalos`, `group/acompanante`), para que
 * un desplegable dentro de otro no gire con el de fuera.
 */
const GIRO_AL_ABRIR = {
  regalos: "group-open/regalos:rotate-45",
  acompanante: "group-open/acompanante:rotate-45",
} as const;

/** El «+» de un desplegable, que se vuelve «×» al abrirse. Decoración. */
export function SignoAbrir({ grupo }: { grupo: keyof typeof GIRO_AL_ABRIR }) {
  const lado = 24;
  const margen = 5;
  const medio = lado / 2;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${lado} ${lado}`}
      className={`size-icono shrink-0 stroke-current transicion-transformacion ${GIRO_AL_ABRIR[grupo]}`}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d={`M${medio} ${margen}V${lado - margen}M${margen} ${medio}H${lado - margen}`} />
    </svg>
  );
}
