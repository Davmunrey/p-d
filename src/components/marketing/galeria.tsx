import Image from "next/image";

import { VisorGaleria, type FotoDelVisor } from "@/components/marketing/visor-galeria";
import { BUCKET_MEDIOS } from "@/config/constants";
import { anclaDe } from "@/config/secciones";
import type { FotoGaleria } from "@/lib/bbdd/landing";
import { t } from "@/lib/copy";

/**
 * BODA-25 · LA GALERÍA
 *
 * Una rejilla de fotos que se abren a pantalla completa. Todo lo que se ve sale
 * de `medios`: publicar una foto en el panel la añade aquí, y despublicarla la
 * quita, sin tocar código.
 *
 * LA REJILLA SE PINTA EN EL SERVIDOR, entera. Lo único que lleva JavaScript es
 * el visor —`VisorGaleria`—, que envuelve la lista para escuchar los clics.
 * Pulsar una miniatura sin JavaScript abre el fichero en la pestaña, porque
 * cada una es un enlace de verdad: la sección promete que se ven las fotos, y
 * eso se cumple con o sin visor.
 *
 * ES LA TIRA DE LA ENTREGA (BODA-114), no una sección con cabecera: cuelga
 * del programa, a 1400 px, con huecos 4/3 que se reparten el ancho —tres en
 * un escritorio, uno en un móvil— y sin un titular que la anuncie. La entrega
 * deja tres huecos porque son tres los que caben; aquí se pintan TODAS las
 * fotos publicadas, porque la página enseña lo que el panel publica y un tope
 * escondería fotos sin decirlo.
 *
 * EL TITULAR EXISTE PERO NO SE VE. Para quien escucha la página, una tira de
 * imágenes sin nombre es «imagen, imagen, imagen»; con un `h2` sólo para el
 * lector de pantalla, la sección se llama «Nuestras fotos» y se puede saltar.
 * Es lo único que la tira añade a la entrega.
 *
 * EL HUECO ES 4/3 PARA TODAS, con la foto recortada dentro. Vienen de sitios
 * distintos —una réflex, un móvil en vertical, una captura— y respetar la
 * proporción de cada una convertiría la tira en una escalera. El recorte es
 * sólo de la miniatura: el visor las enseña enteras.
 */

/**
 * Cuánto ocupa una miniatura en cada tamaño de pantalla, para que el navegador
 * no se descargue la versión de pantalla completa y la pinte a un tercio de
 * ancho. Va emparejado con la rejilla de abajo: a partir de tres huecos por
 * fila, un tercio; por debajo, la pantalla entera.
 */
const MEDIDAS_MINIATURA = "(min-width: 48rem) 33vw, 100vw";

export function Galeria({
  fotos,
  urlBase,
}: {
  fotos: FotoGaleria[];
  urlBase: string | undefined;
}) {
  /*
    Sin la raíz de Supabase no hay URL que componer, así que no hay galería que
    enseñar. Es un fallo de despliegue —falta una variable de entorno—, no un
    caso de contenido: mejor no pintar la sección que pintar una rejilla de
    huecos rotos con el ancla y el titular puestos.
  */
  if (!urlBase || fotos.length === 0) return null;

  const enElBucket = (ruta: string) =>
    `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${ruta}`;

  const ancla = anclaDe("galeria");
  const idTitulo = `titulo-${ancla}`;

  const paraElVisor: FotoDelVisor[] = fotos.map((foto) => ({
    id: foto.id,
    fuente: enElBucket(foto.ruta),
    textoAlternativo: foto.textoAlternativo,
    ancho: foto.ancho,
    alto: foto.alto,
    marcadorBorroso: foto.marcadorBorroso,
  }));

  return (
    <section id={ancla} className="px-margen py-seccion-fluida" aria-labelledby={idTitulo}>
      <div className="mx-auto max-w-amplio">
        <header className="sr-only">
          <h2 id={idTitulo}>{t("galeria.titulo")}</h2>
        </header>

        <VisorGaleria fotos={paraElVisor}>
          <ul className="rejilla-tira gap-galeria">
            {fotos.map((foto, indice) => (
              <li key={foto.id} className="animacion-subir-al-ver">
                {/*
                  UN ENLACE Y NO UN BOTÓN, aunque casi siempre abra el visor: sin
                  JavaScript sigue llevando a alguna parte, que es justo lo que
                  distingue a un enlace de un botón. El nombre accesible sale del
                  texto alternativo de la foto, que la base garantiza que existe.
                */}
                <a
                  href={enElBucket(foto.ruta)}
                  data-indice={indice}
                  className="block overflow-hidden rounded-imagen bg-superficie-hundida transicion-color hover:shadow-elevada"
                >
                  <Image
                    src={enElBucket(foto.ruta)}
                    alt={foto.textoAlternativo}
                    width={foto.ancho}
                    height={foto.alto}
                    sizes={MEDIDAS_MINIATURA}
                    className="aspect-foto-tira w-full object-cover"
                    // El marcador lo calcula quien sube la foto. Sin él, el
                    // hueco se queda en el color de fondo, que ya es un estado
                    // digno mientras carga.
                    placeholder={foto.marcadorBorroso ? "blur" : "empty"}
                    blurDataURL={foto.marcadorBorroso ?? undefined}
                  />
                </a>
              </li>
            ))}
          </ul>
        </VisorGaleria>
      </div>
    </section>
  );
}
