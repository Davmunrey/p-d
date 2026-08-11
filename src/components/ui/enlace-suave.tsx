import Link from "next/link";

/**
 * EL ENLACE DE TEXTO DEL PANEL
 *
 * «Volver al presupuesto», «Ver los gastos», «Editar». No son botones —no
 * compiten con la acción principal de la pantalla— pero tampoco son texto: se
 * pulsan, y en el panel se pulsan con el pulgar.
 *
 * ESTABA COPIADO EN TRECE SITIOS, y las trece copias medían 21 PX de alto: la
 * mitad del mínimo que hace falta acertar con el dedo. Lo destapó el repaso del
 * panel en móvil, que falló en siete de las diez pantallas señalando siempre a
 * los mismos rótulos. Un estilo repetido a mano se arregla trece veces o
 * ninguna; por eso vive aquí.
 *
 * `inline-flex` con altura mínima y no `inline-block`: lo que cambia es dónde
 * vale pulsar, no lo que se ve. El subrayado sigue pegado al texto porque la
 * altura la reparte el centrado, no un relleno que separaría la línea.
 *
 * NO SIRVE PARA UN ENLACE DENTRO DE UNA FRASE. Ahí no se debe forzar altura
 * —rompería el renglón— y la norma lo exime expresamente: un enlace en línea
 * dentro de un texto tiene como objetivo la línea, no un botón. Para eso se usa
 * un `Link` normal dentro del párrafo, como en la lista de invitados.
 */
export function EnlaceSuave({
  href,
  children,
  className = "",
  discreto = false,
}: {
  href: string;
  children: React.ReactNode;
  /** Sólo para el aire de alrededor: `mt-pila` y compañía. */
  className?: string;
  /** Para el enlace secundario de una pareja, que no debe pesar igual. */
  discreto?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-h-control-compacto items-center text-pequeno underline underline-offset-4 transicion-color",
        discreto
          ? "text-tinta-suave decoration-borde hover:text-tinta"
          : "text-tinta-marca decoration-borde-fuerte hover:decoration-borde-marca",
        className,
      ]
        .join(" ")
        .trim()}
    >
      {children}
    </Link>
  );
}
