"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  ATRIBUTO_TEMA,
  CLAVE_TEMA,
  TEMA_POR_DEFECTO,
  TEMAS,
  type Tema,
} from "@/config/constants";
import { t } from "@/lib/copy";

const ETIQUETAS: Record<Tema, string> = {
  claro: t("cocina.temaClaro"),
  oscuro: t("cocina.temaOscuro"),
  sistema: t("cocina.temaSistema"),
};

/** Evento propio: avisa a los suscriptores cuando el tema cambia en esta pestaña. */
const EVENTO_TEMA = "boda:tema-cambiado";

function esTema(valor: string | null): valor is Tema {
  return valor !== null && (TEMAS as readonly string[]).includes(valor);
}

/**
 * El tema es estado EXTERNO a React: vive en `localStorage` y en un atributo
 * del DOM. Por eso se lee con `useSyncExternalStore` en lugar de duplicarlo en
 * un `useState` que habría que mantener sincronizado a mano.
 */
function suscribir(alCambiar: () => void) {
  window.addEventListener("storage", alCambiar);
  window.addEventListener(EVENTO_TEMA, alCambiar);
  return () => {
    window.removeEventListener("storage", alCambiar);
    window.removeEventListener(EVENTO_TEMA, alCambiar);
  };
}

function leerTema(): Tema {
  const guardado = window.localStorage.getItem(CLAVE_TEMA);
  return esTema(guardado) ? guardado : TEMA_POR_DEFECTO;
}

function leerTemaEnServidor(): Tema {
  return TEMA_POR_DEFECTO;
}

/**
 * Cambia entre tema claro, oscuro y el del sistema.
 *
 * No conoce ningún color: se limita a poner un atributo en el elemento raíz.
 * Toda la traducción a valores la hace la capa semántica de tokens.
 */
export function SelectorTema() {
  const tema = useSyncExternalStore(suscribir, leerTema, leerTemaEnServidor);

  const cambiar = useCallback((nuevo: Tema) => {
    /*
      LOS TRES VALORES SE ESCRIBEN, incluido «sistema». Antes se quitaba el
      atributo para que mandara la preferencia del navegador; ahora la ausencia
      de atributo significa «clara», que es la entrega, así que «sistema» tiene
      que dejar su marca para que la hoja de estilos sepa a quién seguir.
    */
    document.documentElement.setAttribute(ATRIBUTO_TEMA, nuevo);
    window.localStorage.setItem(CLAVE_TEMA, nuevo);
    window.dispatchEvent(new Event(EVENTO_TEMA));
  }, []);

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
