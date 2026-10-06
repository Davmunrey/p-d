/**
 * El nombre de la foto —o de la sección— dentro de un botón, sólo para quien
 * no lo ve. «Borrar» repetido veinte veces no dice de qué foto es a un lector
 * de pantalla ni deja nombrarlo por voz; el texto oculto sí, y sin
 * `aria-label` el nombre sigue empezando por lo que se ve escrito (WCAG 2.5.3).
 */
export function DeQue({ nombre }: { nombre: string }) {
  return <span className="sr-only"> {nombre}</span>;
}
