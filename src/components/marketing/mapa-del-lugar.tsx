import { EstrellaQueBaja } from "@/components/marketing/estrella-que-baja";
import { TeselasDelMapa } from "@/components/marketing/teselas-del-mapa";
import { teselasAlrededor } from "@/lib/mapa";

/**
 * EL MAPA DEL FINAL, DONDE SE POSA LA ÚLTIMA ESTRELLA
 *
 * La página acaba de día y en el sitio de la boda: el fondo se vuelve el mapa
 * de alrededor de la finca, como un plano impreso, fundido con el cielo por
 * arriba, y una estrella baja hasta el punto exacto.
 *
 * NO ES UN `<iframe>`: es el fondo del final, y un mapa embebido se queda con
 * el dedo —en un móvil, al bajar por encima, se movía el mapa y no la página—.
 * Son las teselas de OpenStreetMap de alrededor del sitio (`TeselasDelMapa`),
 * y todo se ancla al mismo punto (`foco-del-mapa`): las teselas a su distancia
 * del sitio y la estrella encima, así que el sitio cae exacto en cualquier
 * pantalla. Para moverse por el mapa de verdad está
 * «Abrir en el mapa», en la tarjeta.
 *
 * Es decoración (`aria-hidden`): dónde está el sitio lo dicen la dirección y
 * el botón de la tarjeta. Si las teselas no cargan, queda el cielo de día, y
 * la estrella sigue marcando el centro.
 */
export function MapaDelLugar({
  latitud,
  longitud,
  rotulo,
  className = "",
}: {
  latitud: number;
  longitud: number;
  /** El nombre del lugar, debajo de la estrella. */
  rotulo: string | null;
  className?: string;
}) {
  return (
    <div data-mapa-del-lugar="" className={`relative overflow-hidden ${className}`}>
      <div aria-hidden className="teselas-de-papel absolute inset-0">
        <TeselasDelMapa teselas={teselasAlrededor(latitud, longitud)} />
      </div>
      <div className="absolute foco-del-mapa md:foco-del-mapa-ancho">
        <EstrellaQueBaja rotulo={rotulo} />
      </div>
    </div>
  );
}
