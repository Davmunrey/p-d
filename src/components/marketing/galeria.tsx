import Image from "next/image";

import { VisorGaleria, type FotoDelVisor } from "@/components/marketing/visor-galeria";
import { Cuerpo, EtiquetaSeccion, Titulo1 } from "@/components/ui/tipografia";
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
 * DOS COLUMNAS YA EN EL MÓVIL, y no una como en «nuestra historia». Son cosas
 * distintas: allí cada foto acompaña a un texto que hay que leer, aquí las
 * fotos SON el contenido y se recorren de un vistazo. A una columna, veinte
 * fotos son veinte pantallas de scroll; a dos, se ojean.
 *
 * EL HUECO ES CUADRADO PARA TODAS, con la foto recortada dentro. Vienen de
 * sitios distintos —una réflex, un móvil en vertical, una captura— y respetar
 * la proporción de cada una convertiría la rejilla en una escalera. El recorte
 * es sólo de la miniatura: el visor las enseña enteras.
 */

/**
 * Cuánto ocupa una miniatura en cada tamaño de pantalla, para que el navegador
 * no se descargue la versión de pantalla completa y la pinte a un cuarto de
 * ancho. Va emparejado con las columnas de la rejilla de abajo: si cambia una,
 * cambia el otro.
 */
const MEDIDAS_MINIATURA = "(min-width: 64rem) 25vw, (min-width: 40rem) 33vw, 50vw";

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
    <section id={ancla} className="px-interno py-seccion-fluida" aria-labelledby={idTitulo}>
      <div className="mx-auto max-w-contenido">
        {/*
          La cabecera de siempre: versalita, titular y una entradilla a su
          derecha. Realzada —bronce y rombo— porque la galería es de las
          secciones que se ofrecen, no de las que hay que leer para llegar a la
          boda.
        */}
        <header className="animacion-subir-al-ver mb-bloque-fluido flex flex-wrap items-end justify-between gap-elemento">
          <div>
            <EtiquetaSeccion realzada>{t("galeria.etiqueta")}</EtiquetaSeccion>
            <Titulo1 como="h2" id={idTitulo} className="mt-pila">
              {t("galeria.titulo")}
            </Titulo1>
          </div>
          <Cuerpo className="ancho-entradilla">{t("galeria.entradilla")}</Cuerpo>
        </header>

        <VisorGaleria fotos={paraElVisor}>
          <ul className="grid grid-cols-2 gap-interno sm:grid-cols-3 lg:grid-cols-4">
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
                    className="aspect-hito w-full object-cover"
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
