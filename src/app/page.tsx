import Link from "next/link";

import { t } from "@/lib/copy";

/**
 * Portada provisional.
 *
 * La landing real es la épica E3 del backlog y se construirá leyendo su
 * contenido de la base de datos. Hasta entonces esta página no finge ser lo
 * que no es: enlaza al sistema de diseño y ya está.
 */
export default function PaginaInicio() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-estrecho place-items-center px-interno py-seccion">
      <div className="text-center">
        <h1 className="text-titulo-1 font-light">{t("meta.titulo")}</h1>
        <p className="mt-pila text-cuerpo-grande text-tinta-suave">
          {t("meta.descripcion")}
        </p>
        <Link
          href="/cocina"
          className="mt-bloque inline-block rounded-boton border border-borde-fuerte px-elemento py-interno-compacto text-pequeno uppercase tracking-amplio text-tinta-suave transition-colors hover:border-borde-marca hover:text-tinta-marca"
        >
          {t("cocina.titulo")}
        </Link>
      </div>
    </main>
  );
}
