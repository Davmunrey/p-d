import Image from "next/image";

import { VideoDeFondo } from "@/components/marketing/video-de-fondo";

import { BUCKET_MEDIOS } from "@/config/constants";
import type { Medio } from "@/lib/bbdd/landing";

/**
 * EL HUECO DE UNA FOTO
 *
 * La entrega es un diseño conducido por fotografía: la portada parte la
 * pantalla en dos y la mitad derecha es una imagen. Pero las fotos todavía no
 * existen, y van a tardar —la sesión de preboda ni siquiera está decidida—.
 *
 * De ahí este componente. Lee de `medios` de verdad: el día que se publique una
 * fila, la foto aparece sola y sin tocar código. Mientras tanto pinta el vacío
 * que trae la propia entrega —superficie hundida, sin dibujos ni iconos de
 * «imagen rota»— y la sección se sostiene igual.
 *
 * NO PINTA UN MARCADOR DE POSICIÓN CON TEXTO. Un recuadro que pone «foto
 * vertical de los novios» es una nota para el equipo que se acaba enseñando a
 * los invitados. Si no hay foto, lo honesto es un plano de color que forma
 * parte del diseño.
 */

interface Propiedades {
  /** La imagen publicada, o `null` si esa sección todavía no tiene ninguna. */
  medio: Medio | null;
  /** URL pública de Supabase, para componer la ruta del bucket. */
  urlBase: string | undefined;
  /** `sizes` de `next/image`: cuánto ocupa el hueco en cada tamaño. */
  medidas: string;
  className?: string;
  /** La portada se ve nada más entrar: esa no puede cargar en diferido. */
  prioritaria?: boolean;
}

export function HuecoFoto({
  medio,
  urlBase,
  medidas,
  className = "",
  prioritaria = false,
}: Propiedades) {
  const enElBucket = (ruta: string) =>
    `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${ruta}`;

  const fuente = medio && urlBase ? enElBucket(medio.ruta) : null;

  /*
    UN VÍDEO NO ES UNA IMAGEN CON OTRA EXTENSIÓN, así que sale por su propia
    rama en vez de intentar que `next/image` lo entienda. Lo dice la base —el
    campo `tipo`—, no el final de la ruta: «.mov» y «.mp4» son el mismo vídeo
    con distinto envoltorio, y adivinarlo mirando una cadena convierte un dato
    en una corazonada.
  */
  const esVideo = medio?.tipo === "video" && medio.posterRuta && fuente && urlBase;

  return (
    <div className={`relative overflow-hidden bg-superficie-hundida ${className}`}>
      {esVideo ? (
        <VideoDeFondo
          fuente={fuente!}
          poster={enElBucket(medio!.posterRuta!)}
          textoAlternativo={medio!.textoAlternativo}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : fuente ? (
        <Image
          src={fuente}
          alt={medio!.textoAlternativo}
          fill
          sizes={medidas}
          priority={prioritaria}
          className="object-cover"
          // El marcador borroso lo calcula quien sube la imagen. Sin él, el
          // hueco se queda en el color de fondo, que ya es un estado digno.
          placeholder={medio!.marcadorBorroso ? "blur" : "empty"}
          blurDataURL={medio!.marcadorBorroso ?? undefined}
        />
      ) : null}

      {/*
        El degradado que funde la foto con la página por su borde izquierdo.
        Va también cuando no hay foto: es lo que evita que el hueco se vea como
        un rectángulo pegado en lugar de como parte de la composición.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-bloque bg-gradient-to-r from-fondo to-transparent"
      />
    </div>
  );
}
