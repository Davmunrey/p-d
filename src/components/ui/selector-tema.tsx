"use client";

import { useEffect, useState } from "react";

import { ATRIBUTO_TEMA, CLAVE_TEMA, TEMA_POR_DEFECTO, TEMAS, type Tema } from "@/config/constants";
import { t } from "@/lib/copy";

const ETIQUETAS: Record<Tema, string> = {
  claro: t("cocina.temaClaro"),
  oscuro: t("cocina.temaOscuro"),
  sistema: t("cocina.temaSistema"),
};

function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "sistema") {
    raiz.removeAttribute(ATRIBUTO_TEMA);
  } else {
    raiz.setAttribute(ATRIBUTO_TEMA, tema);
  }
}

function leerTemaGuardado(): Tema {
  const guardado = window.localStorage.getItem(CLAVE_TEMA);
  return TEMAS.includes(guardado as Tema) ? (guardado as Tema) : TEMA_POR_DEFECTO;
}

/**
 * Cambia entre tema claro, oscuro y el del sistema.
 *
 * No conoce ningún color: se limita a poner un atributo en el elemento raíz.
 * Toda la traducción a valores la hace la capa semántica de tokens.
 */
export function SelectorTema() {
  const [tema, setTema] = useState<Tema>(TEMA_POR_DEFECTO);

  useEffect(() => {
    const guardado = leerTemaGuardado();
    setTema(guardado);
    aplicarTema(guardado);
  }, []);

  function cambiar(nuevo: Tema) {
    setTema(nuevo);
    aplicarTema(nuevo);
    window.localStorage.setItem(CLAVE_TEMA, nuevo);
  }

  return (
    <div
      role="group"
      aria-label={t("cocina.cambiarTema")}
      className="inline-flex gap-linea rounded-etiqueta border border-borde bg-superficie p-linea"
    >
      {TEMAS.map((opcion) => (
        <button
          key={opcion}
          type="button"
          onClick={() => cambiar(opcion)}
          aria-pressed={tema === opcion}
          data-activo={tema === opcion}
          className="rounded-etiqueta px-interno py-linea text-pequeno text-tinta-suave transition-colors data-[activo=true]:bg-tinta data-[activo=true]:text-tinta-inversa"
        >
          {ETIQUETAS[opcion]}
        </button>
      ))}
    </div>
  );
}
