"use client";

import { useEffect, useRef } from "react";

import { TAMANO_TESELA } from "@/config/constants";
import type { Tesela } from "@/lib/mapa";

/**
 * LAS TESELAS DEL MAPA DEL FINAL, ancladas al sitio de la boda.
 *
 * Cada una va a su distancia del sitio, que está en el punto de anclaje
 * (`foco-del-mapa`): así el sitio cae exacto en cualquier pantalla.
 *
 * `<img>` Y NO `next/image`: las teselas ya vienen a su tamaño, y optimizarlas
 * sería pasar el mapa de OpenStreetMap por nuestro servidor, que es justo lo
 * que su política de uso pide no hacer. Perezosas: en un móvil, las de los
 * lados ni se piden.
 *
 * ES DE CLIENTE POR UNA SOLA RAZÓN: si una tesela no carga —sin conexión, un
 * bloqueador—, el navegador pinta su icono de imagen rota en medio del plano.
 * Una que falla se esconde y queda el cielo de día; también las que fallaron
 * antes de que llegara el JavaScript, que se miran al montar. Sin JavaScript
 * se ven igual: sólo se pierde ese escondite.
 */
export function TeselasDelMapa({ teselas }: { teselas: Tesela[] }) {
  const capa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    capa.current?.querySelectorAll("img").forEach((imagen) => {
      if (imagen.complete && imagen.naturalWidth === 0) imagen.dataset.rota = "";
    });
  }, []);

  return (
    <div ref={capa} className="absolute foco-del-mapa md:foco-del-mapa-ancho">
      {teselas.map((tesela) => (
        // eslint-disable-next-line @next/next/no-img-element -- ver arriba: las teselas no pasan por el optimizador
        <img
          key={tesela.url}
          src={tesela.url}
          alt=""
          width={TAMANO_TESELA}
          height={TAMANO_TESELA}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={(evento) => {
            evento.currentTarget.dataset.rota = "";
          }}
          className="absolute max-w-none select-none data-rota:invisible"
          style={{ left: tesela.x, top: tesela.y }}
        />
      ))}
    </div>
  );
}
