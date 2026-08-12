"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import type { PuntoDelGuion } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";

import { marcarPuntoDelGuion } from "./acciones";
import {
  apuntar,
  instantanea,
  instantaneaDelServidor,
  soltar,
  suscribirse,
  type ColaDeMarcas,
} from "./cola";

/**
 * BODA-100 (#67) · LA LISTA DE CONTROL QUE AGUANTA UNA FINCA SIN COBERTURA
 *
 * Es la única pantalla del panel con estado en el navegador, y no es un
 * capricho de arquitectura: es el requisito del ticket. «Aguanta una conexión
 * mala sin perder lo marcado» no se cumple con un formulario que envía y
 * recarga, porque sin cobertura ese envío se pierde y con él la marca.
 *
 * CÓMO FUNCIONA, en tres pasos y sin magia:
 *
 *   1. Al pulsar, la marca se apunta en la cola —que es `localStorage`— y la
 *      pantalla se pinta como si ya estuviera guardada. Eso es lo que sobrevive
 *      a todo: a que no haya red, a que el móvil se bloquee, a cerrar la
 *      pestaña.
 *   2. Se intenta mandar al servidor. Si sale bien, la marca sale de la cola.
 *   3. Si no sale bien, se queda, y se reintenta cuando vuelve la conexión — el
 *      navegador avisa con el evento `online`.
 *
 * LO QUE MANDA ES EL SERVIDOR, SALVO LO QUE ESTÁ EN LA COLA. Al recargar, la
 * lista llega de la base con sus marcas y encima se aplican las pendientes, que
 * son las que todavía no ha visto nadie más. Así dos móviles marcando a la vez
 * no se pisan: cada uno ve lo de la base más lo suyo sin mandar.
 *
 * POR QUÉ NO UN SERVICE WORKER. Haría falta para poder ABRIR la pantalla ya sin
 * cobertura, y eso es otro ticket y otro riesgo — una caché mal invalidada el
 * día de la boda enseña el guion de ayer. Lo que resuelve el problema real —se
 * abre con cobertura al llegar y se marca durante horas con la red yendo y
 * viniendo— es esto.
 */
export function Guion({
  puntos,
  puedeEditar,
}: {
  puntos: PuntoDelGuion[];
  puedeEditar: boolean;
}) {
  const cola = useSyncExternalStore(suscribirse, instantanea, instantaneaDelServidor);
  const [sinPermiso, setSinPermiso] = useState(false);

  /**
   * Manda lo que se le dé y saca de la cola lo que se haya podido mandar.
   *
   * «NO PUEDES» NO SE REINTENTA. Un lector nunca va a poder marcar, así que
   * dejarlo en la cola sería reintentar para siempre y —peor— dejar la pantalla
   * diciendo que hay algo sin mandar cuando lo que hay es algo que no se va a
   * mandar nunca. Se suelta y se dice por qué.
   */
  const mandar = useCallback(async (pendientes: ColaDeMarcas) => {
    const resueltos: string[] = [];
    let denegado = false;

    for (const [id, marca] of Object.entries(pendientes)) {
      try {
        const resultado = await marcarPuntoDelGuion(id, marca !== null);
        if (resultado.ok) {
          resueltos.push(id);
        } else if (resultado.motivo === "sin-permiso") {
          denegado = true;
          resueltos.push(id);
        }
      } catch {
        // Sin red. Se queda en la cola para el próximo intento.
      }
    }

    if (denegado) setSinPermiso(true);
    soltar(resueltos);
  }, []);

  /*
    AL VOLVER LA CONEXIÓN, SOLO. Es el caso que describe el ticket: se marca en
    el aparcamiento sin cobertura y se sincroniza al entrar en la finca.

    `instantanea()` se lee dentro del manejador y no se captura de fuera: así el
    efecto no depende de la cola y no hay que resuscribirse en cada marca.
  */
  useEffect(() => {
    const alVolver = () => void mandar(instantanea());
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, [mandar]);

  const alternar = async (punto: PuntoDelGuion) => {
    const estabaHecho = (punto.id in cola ? cola[punto.id] : punto.hechoEn) !== null;

    // 1 · Se apunta y se pinta antes de intentar nada. Lo que se ve y lo que
    //     sobrevive a una recarga no dependen de que haya red.
    //
    //     La hora es sólo para pintar: la de verdad la pone el servidor con su
    //     propio reloj, porque el del móvil que marca es el de un invitado.
    apuntar(punto.id, estabaHecho ? null : new Date().toISOString());
    setSinPermiso(false);

    // 2 · Y ahora se manda sólo esto, no la cola entera: mandar aquí lo de
    //     antes duplicaría los intentos con el reintento de `online`.
    await mandar({ [punto.id]: estabaHecho ? null : new Date().toISOString() });
  };

  const conSusMarcas = puntos.map((punto) => ({
    ...punto,
    hechoEn: punto.id in cola ? cola[punto.id] : punto.hechoEn,
    sinMandar: punto.id in cola,
  }));

  const sinMandar = conSusMarcas.filter((punto) => punto.sinMandar).length;
  const tocaAhora = conSusMarcas.find((punto) => !punto.hechoEn) ?? null;

  return (
    <div className="mt-bloque">
      {/*
        QUÉ TOCA AHORA, ARRIBA Y GRANDE. Es la única pregunta que se hace ese
        día, y tener que buscarla recorriendo la lista con el sol de frente es
        exactamente lo que el ticket pide evitar.
      */}
      <p
        aria-live="polite"
        className="rounded-campo bg-superficie-hundida p-elemento text-cuerpo text-tinta"
      >
        {tocaAhora ? (
          <>
            <span className="block text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
              {t("panel.dia.guion.tocaAhora")}
            </span>
            <span className="mt-pila block text-titulo-3 text-tinta">
              {tocaAhora.hora} · {tocaAhora.titulo}
            </span>
          </>
        ) : (
          t("panel.dia.guion.todoHecho")
        )}
      </p>

      {sinMandar > 0 ? (
        <p
          role="status"
          data-sin-mandar={sinMandar}
          className="mt-elemento rounded-campo bg-aviso-fondo p-interno text-pequeno text-aviso-tinta"
        >
          {t("panel.dia.guion.sinConexion")}{" "}
          <strong>{t("panel.dia.guion.pendientes", { numero: sinMandar })}</strong>{" "}
          <button
            type="button"
            className="min-h-control-compacto underline"
            onClick={() => void mandar(instantanea())}
          >
            {t("panel.dia.guion.reintentar")}
          </button>
        </p>
      ) : null}

      {sinPermiso ? (
        <p
          role="alert"
          className="mt-elemento rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {t("panel.dia.guion.sinPermiso")}
        </p>
      ) : null}

      <ul className="mt-bloque grid gap-interno">
        {conSusMarcas.map((punto) => (
          <li
            key={punto.id}
            data-punto={punto.id}
            data-hecho={punto.hechoEn ? "si" : "no"}
            className={`rounded-campo border p-elemento ${
              punto.hechoEn ? "border-borde bg-superficie-hundida" : "border-borde-fuerte"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-elemento">
              <div>
                {/*
                  LA HORA EN GRANDE Y EN CIFRAS TABULARES: se lee de un vistazo
                  y a un brazo de distancia, que es como se mira esto.
                */}
                <span className="block text-titulo-3 tabular-nums text-tinta">
                  {punto.hora}
                </span>
                <span
                  className={`mt-pila block text-cuerpo ${
                    punto.hechoEn ? "text-tinta-suave line-through" : "text-tinta"
                  }`}
                >
                  {punto.titulo}
                </span>
                {punto.responsable ? (
                  <span className="mt-pila block text-pequeno text-tinta-suave">
                    {t("panel.dia.guion.responsable", { nombre: punto.responsable })}
                  </span>
                ) : null}
                {punto.notas ? (
                  <span className="mt-pila block text-pequeno text-tinta-suave">
                    {punto.notas}
                  </span>
                ) : null}
              </div>

              {puedeEditar ? (
                /*
                  EL BOTÓN OCUPA TODA LA ALTURA QUE PUEDE. Aquí se pulsa con más
                  prisa que en ninguna otra pantalla del panel: de pie, andando
                  y a veces sin mirar.
                */
                <button
                  type="button"
                  onClick={() => void alternar(punto)}
                  aria-pressed={Boolean(punto.hechoEn)}
                  aria-label={t(
                    punto.hechoEn
                      ? "panel.dia.guion.desmarcarEste"
                      : "panel.dia.guion.marcarEste",
                    { titulo: punto.titulo },
                  )}
                  className="min-h-control shrink-0 rounded-boton border border-borde-fuerte px-elemento text-etiqueta uppercase tracking-boton text-tinta-marca transicion-color hover:border-borde-marca hover:bg-superficie"
                >
                  {t(punto.hechoEn ? "panel.dia.guion.desmarcar" : "panel.dia.guion.marcar")}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
