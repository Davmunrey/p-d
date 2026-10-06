"use client";

import { useState } from "react";

import { DURACION_AVISO_COPIADO } from "@/config/constants";
import { t } from "@/lib/copy";

/**
 * BODA-103 (#70) · EL RECUENTO, PEGABLE EN WHATSAPP
 *
 * El criterio del ticket es literal: «se comparte como texto pegable». Lo que
 * pasa de verdad es que el catering pide la cifra por WhatsApp y alguien la
 * copia a mano de la pantalla, que es como se equivoca uno en un número.
 *
 * EL TEXTO LO ARMA EL SERVIDOR y llega hecho. Aquí no se recompone nada: si se
 * armara en el navegador habría dos versiones del mismo mensaje —la que se ve y
 * la que se pega— y un día dirían cosas distintas.
 *
 * SIN PORTAPAPELES TAMBIÉN VALE. `navigator.clipboard` no existe en contextos no
 * seguros y falla si el usuario deniega el permiso; en ese caso se selecciona el
 * texto, que es lo que se hacía antes de que existiera la API y sigue
 * funcionando en todas partes.
 */
export function CopiarRecuento({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      // Vuelve a su sitio solo: un botón que se queda diciendo «copiado» para
      // siempre deja de contestar si el segundo intento funcionó.
      window.setTimeout(() => setCopiado(false), DURACION_AVISO_COPIADO);
    } catch {
      const area = document.getElementById("recuento-pegable");
      if (area instanceof HTMLTextAreaElement) {
        area.focus();
        area.select();
      }
    }
  };

  return (
    <div className="mt-elemento">
      <button
        type="button"
        onClick={() => void copiar()}
        className="inline-flex min-h-control items-center rounded-boton border border-borde-fuerte px-elemento text-etiqueta uppercase tracking-boton text-tinta-marca transicion-color hover:border-borde-marca hover:bg-superficie-hundida"
      >
        {t(copiado ? "panel.dia.recuento.copiado" : "panel.dia.recuento.copiar")}
      </button>

      {/*
        EL TEXTO ESTÁ EN LA PÁGINA, NO SÓLO EN EL PORTAPAPELES. Es el respaldo
        de cuando copiar falla, y además deja ver exactamente qué se va a mandar
        antes de mandarlo — que en un mensaje con cifras no sobra nunca.
      */}
      {/*
        `field-sizing-content` LO HACE TAN ALTO COMO EL TEXTO. Las filas cuentan
        renglones, pero en el móvil las líneas largas se parten, y la última
        —«Sin contestar», la que evita encargar de más— quedaba debajo del
        borde. `rows` se queda para el navegador que no lo entiende.
      */}
      <textarea
        id="recuento-pegable"
        readOnly
        rows={texto.split("\n").length}
        value={texto}
        aria-label={t("panel.dia.recuento.pegable")}
        className="mt-elemento w-full resize-y field-sizing-content rounded-campo border border-borde bg-superficie-hundida p-interno text-pequeno text-tinta"
      />
    </div>
  );
}
