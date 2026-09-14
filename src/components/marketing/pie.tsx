import { RUTA_COCINA } from "@/config/constants";
import { rutaDe } from "@/config/secciones";
import { t } from "@/lib/copy";
import { fechaEnPuntos } from "@/lib/fechas";
import { inicial } from "@/lib/nombres";

/**
 * PIE DE LA LANDING
 *
 * El de la entrega, y no otro: centrado, con el monograma grande, una línea
 * con la fecha y el lugar, y una fila de enlaces. Antes era una rejilla de
 * dos columnas con los nombres completos, el menú repetido y un «cualquier
 * duda, escribidnos» — otra pieza, con otra voz.
 *
 * Los enlaces son los de la entrega salvo uno: «Cartelería» es de imprenta y
 * no tiene página a la que llevar, así que no se enlaza. El sistema de marca
 * sí la tiene —la cocina— y es donde la entrega manda. «Volver arriba» se
 * queda al final: en una página de veinte pantallas es el gesto que más se
 * usa desde aquí, y la barra fija no siempre está a la vista en móvil.
 *
 * `data-seccion="pie"` reasigna los tokens semánticos a la paleta oscura. El
 * componente no sabe de qué color se pinta: por eso no lleva ni una clase
 * distinta de las de cualquier otro bloque.
 */
export function Pie({
  nombreNovia,
  nombreNovio,
  fechaCeremonia,
  lugar,
  correoContacto,
  hashtag,
}: {
  nombreNovia: string;
  nombreNovio: string;
  fechaCeremonia: Date;
  lugar: string | null;
  correoContacto: string | null;
  hashtag: string | null;
}) {
  const nombres = `${nombreNovia} ${t("portada.conjuncion")} ${nombreNovio}`;
  const fecha = fechaEnPuntos(fechaCeremonia);

  const enlaces = [
    { href: rutaDe("reserva_la_fecha"), rotulo: t("navegacion.secciones.reserva_la_fecha") },
    { href: RUTA_COCINA, rotulo: t("pie.sistemaDeMarca") },
    correoContacto ? { href: `mailto:${correoContacto}`, rotulo: correoContacto } : null,
    { href: "#portada", rotulo: t("pie.volverArriba") },
  ].filter((enlace) => enlace !== null);

  return (
    <footer
      data-seccion="pie"
      className="animacion-subir-al-ver px-margen pt-pie-arriba pb-pie-abajo text-center"
    >
      <div className="mx-auto max-w-estrecho">
        {/*
          El monograma, con las iniciales de la base y el «&» en cursiva, como
          en la barra. Para quien escucha la página son los dos nombres: las
          letras sueltas no significan nada leídas de una en una.
        */}
        <p className="animacion-pop-al-ver font-titulo peso-titulo-menor text-monograma-pie leading-compacto text-tinta">
          <span className="sr-only">{nombres}</span>
          <span aria-hidden="true">
            {inicial(nombreNovia)}
            <span className="mx-linea text-ampersand text-tinta-marca italic">
              {t("navegacion.monogramaConector")}
            </span>
            {inicial(nombreNovio)}
          </span>
        </p>

        {/* Sin lugar configurado se queda la fecha sola, nunca «— null». */}
        <p className="mt-pila text-boton uppercase tracking-pie text-tinta-suave">
          {lugar ? t("pie.fechaLugar", { fecha, lugar }) : fecha}
        </p>

        {hashtag ? (
          <p className="mt-interno-compacto text-etiqueta uppercase tracking-marcado text-tinta-marca">
            {hashtag}
          </p>
        ) : null}

        <nav aria-label={t("pie.etiquetaNavegacion")} className="mt-chips-arriba">
          {/*
            SE TOCAN CON EL PULGAR, no con un ratón. Un rótulo de trece píxeles
            mide poco más como destino táctil: el área crece hasta el mínimo
            cómodo sin que el rótulo cambie de tamaño ni de sitio.
          */}
          <ul className="flex flex-wrap justify-center gap-x-margen">
            {enlaces.map((enlace) => (
              <li key={enlace.href}>
                <a
                  href={enlace.href}
                  className="flex min-h-control-compacto items-center text-enlace-pie tracking-enlace-pie text-tinta-suave transicion-color hover:text-tinta"
                >
                  {enlace.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
