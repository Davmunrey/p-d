import { t } from "@/lib/copy";

/**
 * PIE DE LA LANDING
 *
 * Cierra la página y recoge lo que un invitado busca cuando ya ha leído todo:
 * a quién escribir si le queda una duda.
 *
 * `data-seccion="pie"` reasigna los tokens semánticos a la paleta oscura. El
 * componente no sabe de qué color se pinta: por eso no lleva ni una clase
 * distinta de las de cualquier otro bloque.
 */
export function Pie({
  nombres,
  correoContacto,
  hashtag,
  enlaces,
}: {
  nombres: string;
  correoContacto: string | null;
  hashtag: string | null;
  enlaces: { seccion: string; ancla: string; rotulo: string }[];
}) {
  return (
    <footer data-seccion="pie" className="px-interno py-seccion-compacta">
      <div className="mx-auto grid max-w-contenido gap-bloque sm:grid-cols-2">
        <div>
          <p className="font-titulo text-titulo-2 leading-titulo-corto">{nombres}</p>
          {hashtag ? (
            <p className="mt-pila text-etiqueta uppercase tracking-marcado text-tinta-marca">
              {hashtag}
            </p>
          ) : null}
        </div>

        <div className="sm:justify-self-end">
          {enlaces.length > 0 ? (
            <nav aria-label={t("pie.etiquetaNavegacion")}>
              {/*
                SE TOCAN CON EL PULGAR, no con un ratón. Un rótulo de versalita
                mide dieciséis píxeles de alto: como texto se lee bien, como
                destino táctil es una lotería. El área crece hasta el mínimo
                cómodo sin que el rótulo cambie de tamaño ni de sitio — lo que
                cambia es dónde vale pulsar.
              */}
              <ul className="flex flex-wrap gap-x-elemento">
                {enlaces.map((enlace) => (
                  <li key={enlace.seccion}>
                    <a
                      href={`#${enlace.ancla}`}
                      className="flex min-h-control-compacto items-center text-etiqueta uppercase tracking-etiqueta text-tinta-suave transicion-color hover:text-tinta"
                    >
                      {enlace.rotulo}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          {correoContacto ? (
            <div className="mt-bloque">
              <p className="text-pequeno text-tinta-suave">{t("pie.contacto")}</p>
              <a
                href={`mailto:${correoContacto}`}
                className="mt-linea inline-flex min-h-control-compacto items-center font-titulo text-titulo-3 text-tinta-marca transicion-color hover:text-tinta"
              >
                {correoContacto}
              </a>
            </div>
          ) : null}

          <a
            href="#portada"
            className="mt-bloque inline-flex min-h-control-compacto items-center text-etiqueta uppercase tracking-etiqueta text-tinta-suave transicion-color hover:text-tinta"
          >
            {t("pie.volverArriba")}
          </a>
        </div>
      </div>
    </footer>
  );
}
