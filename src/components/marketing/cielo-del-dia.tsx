/**
 * EL CIELO DEL DÍA
 *
 * La landing cuenta el día de la boda de la mañana a la noche, y el fondo lo
 * cuenta con ella: arriba es el alba, a media página la tarde dorada, al final
 * el ocaso, justo antes de la noche marino del RSVP y el pie. Por encima cruza
 * un sol que es sólo luz —un brillo de bronce sin disco—: sale por la
 * izquierda, culmina a media página y se pone abajo a la derecha.
 *
 * No hay JavaScript: cada capa es un tinte fijo detrás de todo y su opacidad
 * va ligada al scroll de la página (`motion.css`). Sin líneas de tiempo de
 * scroll, o con movimiento reducido, no se pinta ninguna capa y la página
 * queda en su nieve de siempre.
 *
 * Es decoración: `aria-hidden` y sin recibir el ratón.
 */
export function CieloDelDia() {
  return (
    <div
      aria-hidden
      data-cielo-del-dia
      className="pointer-events-none fixed inset-0 capa-cielo overflow-hidden"
    >
      <div className="cielo-capa cielo-alba luz-alba absolute inset-0" />
      <div className="cielo-capa cielo-tarde luz-tarde absolute inset-0" />
      <div className="cielo-capa cielo-ocaso luz-ocaso absolute inset-0" />
      <div className="cielo-capa cielo-sol luz-sol absolute top-0 left-0" />
    </div>
  );
}
