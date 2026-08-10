"use client";

import { useEffect, useRef, useState } from "react";

import { Boton } from "@/components/ui/boton";
import { DURACION_AVISO_COPIADO } from "@/config/constants";

/**
 * UN VALOR QUE HAY QUE LLEVARSE A OTRA APLICACIÓN
 *
 * Un IBAN no se lee: se copia y se pega en el banco. Equivocarse en un dígito
 * de veinticuatro es la norma, no la excepción, así que teclearlo no es una
 * alternativa aceptable.
 *
 * EL CAMPO ES LO QUE IMPORTA, NO EL BOTÓN. El valor vive en un `<input>` de
 * sólo lectura, así que se selecciona entero de una pasada y se copia con el
 * gesto de siempre —pulsación larga en el móvil, doble clic en el escritorio—.
 * Eso funciona sin una línea de JavaScript, que es el requisito de esta web: se
 * abre desde WhatsApp, en móviles viejos y con conexiones malas.
 *
 * El botón es la mejora, no el mecanismo. Si el JavaScript no ha cargado o el
 * navegador no da acceso al portapapeles —Safari lo niega fuera de contextos
 * seguros—, el botón se limita a seleccionar el campo: el invitado sigue
 * teniendo el valor a un gesto de distancia y nunca a ninguno.
 */

interface Propiedades {
  valor: string;
  /** Rótulo accesible del campo: sin él el lector de pantalla dice «edición». */
  etiqueta: string;
  textoCopiar: string;
  textoCopiado: string;
}

export function CampoCopiable({ valor, etiqueta, textoCopiar, textoCopiado }: Propiedades) {
  const campo = useRef<HTMLInputElement>(null);
  const [copiado, setCopiado] = useState(false);

  // El aviso se retira solo. Sin esto se queda un «Copiado» permanente que deja
  // de significar nada en cuanto se pulsa una segunda vez.
  useEffect(() => {
    if (!copiado) return;
    const temporizador = setTimeout(() => setCopiado(false), DURACION_AVISO_COPIADO);
    return () => clearTimeout(temporizador);
  }, [copiado]);

  async function copiar() {
    // Seleccionar SIEMPRE, y antes de nada: es lo que deja el valor a mano
    // aunque el portapapeles no esté disponible.
    campo.current?.select();
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      // Sin portapapeles queda la selección, que es un gesto de distancia. No
      // se enseña un error: no ha fallado nada que el invitado pueda arreglar.
    }
  }

  return (
    <div className="mt-pila flex flex-wrap items-center gap-interno-compacto">
      <input
        ref={campo}
        readOnly
        value={valor}
        aria-label={etiqueta}
        className="min-h-campo min-w-0 flex-1 rounded-campo border border-borde bg-superficie px-interno font-codigo text-pequeno text-tinta"
      />
      <Boton jerarquia="secundario" onClick={copiar}>
        {copiado ? textoCopiado : textoCopiar}
      </Boton>
      {/*
        El cambio de rótulo lo ve quien mira. Esto es para quien escucha: un
        lector de pantalla no anuncia que el texto de un botón ha cambiado.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {copiado ? textoCopiado : ""}
      </span>
    </div>
  );
}
