"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { Titulo3 } from "@/components/ui/tipografia";
import { INTERVALO_REINTENTO_GUION_MS, PLAZO_MARCA_GUION_MS } from "@/config/constants";
import type { PuntoDelGuion } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";

import { marcarPuntoDelGuion } from "./acciones";
import {
  aceptadasDelServidor,
  aceptar,
  apuntar,
  empezarEnvio,
  envioDelServidor,
  instantanea,
  instantaneaDeAceptadas,
  instantaneaDelEnvio,
  instantaneaDelServidor,
  marcaVigente,
  soltar,
  suscribirse,
  suscribirseAlEnvio,
  terminarEnvio,
} from "./cola";

/** Una promesa que se da por fallida si no contesta a tiempo. */
function conPlazo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const reloj = window.setTimeout(() => rechazar(new Error("sin respuesta")), ms);
    promesa.then(
      (valor) => {
        window.clearTimeout(reloj);
        resolver(valor);
      },
      (motivo: unknown) => {
        window.clearTimeout(reloj);
        rechazar(motivo);
      },
    );
  });
}

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
 *   3. Si no sale bien, se queda, y se reintenta solo: al abrir la pantalla,
 *      al volver a ella, cuando el navegador avisa de que vuelve la red y,
 *      por si no avisa —con una raya de cobertura cree que la hay—, cada poco.
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
  const [noExiste, setNoExiste] = useState(false);

  /*
    LO QUE EL SERVIDOR YA HA ACEPTADO, y cómo va el envío. Viven en `cola.ts`,
    fuera del componente: volver atrás desde «Teléfonos» lo monta de nuevo con
    la carga que el navegador guardaba, y lo aceptado en un `useState` se
    perdía con él (ver `cola.ts`).
  */
  const confirmadas = useSyncExternalStore(
    suscribirseAlEnvio,
    instantaneaDeAceptadas,
    aceptadasDelServidor,
  );
  const envio = useSyncExternalStore(suscribirseAlEnvio, instantaneaDelEnvio, envioDelServidor);

  /**
   * MANDA LA COLA ENTERA, UN ENVÍO A LA VEZ.
   *
   * Si ya hay uno en camino no se lanza otro: el que va vuelve a leer la cola
   * al acabar cada vuelta y se lleva lo marcado mientras tanto. Así el toque,
   * el reloj y el `online` no mandan lo mismo dos veces ni se apilan detrás de
   * una petición colgada —las acciones de servidor salen de una en una—, y
   * cada marca tiene un plazo: pasado, se da por fallida y se queda en la cola.
   *
   * «NO PUEDES» NO SE REINTENTA. Un lector nunca va a poder marcar, así que
   * dejarlo en la cola sería reintentar para siempre y —peor— dejar la pantalla
   * diciendo que hay algo sin mandar cuando lo que hay es algo que no se va a
   * mandar nunca. Se suelta y se dice por qué.
   */
  const mandarLaCola = useCallback(async () => {
    if (!empezarEnvio()) return;

    const fallaron = new Set<string>();
    // Pares id + marca: lo intentado en esta vuelta no se repite en ella.
    const intentados = new Set<string>();

    try {
      for (;;) {
        const nuevos = Object.entries(instantanea()).filter(
          ([id, marca]) => !intentados.has(`${id}|${marca}`),
        );
        if (nuevos.length === 0) break;

        for (const [id, marca] of nuevos) {
          intentados.add(`${id}|${marca}`);
          try {
            const resultado = await conPlazo(
              marcarPuntoDelGuion(id, marca !== null),
              PLAZO_MARCA_GUION_MS,
            );
            fallaron.delete(id);
            if (resultado.ok) {
              // Se recuerda lo aceptado ANTES de soltarlo de la cola, para que
              // la pantalla no se quede un instante sin ninguna de las dos.
              aceptar(id, marca);
            } else if (resultado.motivo === "sin-permiso") {
              setSinPermiso(true);
            } else if (resultado.motivo === "no-existe") {
              // Alguien lo quitó del guion mientras esperaba: no hay nada que
              // mandar, ni ahora ni luego.
              setNoExiste(true);
            }
            // La cola sólo suelta el par si SIGUE siendo lo que se mandó: si
            // el punto se volvió a tocar, la marca nueva se queda pendiente.
            soltar([[id, marca]]);
          } catch {
            // Sin red, o sin respuesta a tiempo. Se queda para el siguiente.
            fallaron.add(id);
          }
        }
      }
    } finally {
      terminarEnvio([...fallaron]);
    }
  }, []);

  /*
    SE MANDA SOLO, Y NO SÓLO AL VOLVER LA RED. Al abrir la pantalla con algo
    pendiente de antes —el móvil se bloqueó en el aparcamiento y se vuelve a
    abrir en la finca—, al volver a la pestaña, cuando el navegador avisa de
    que hay red, y cada poco mientras quede algo: con una raya de cobertura el
    navegador cree que hay red, y si la señal mejora no avisa de nada.
  */
  useEffect(() => {
    const intentar = () => {
      if (Object.keys(instantanea()).length > 0) void mandarLaCola();
    };
    const alVerse = () => {
      if (document.visibilityState === "visible") intentar();
    };

    intentar();
    window.addEventListener("online", intentar);
    window.addEventListener("pageshow", intentar);
    document.addEventListener("visibilitychange", alVerse);
    const reloj = window.setInterval(intentar, INTERVALO_REINTENTO_GUION_MS);
    return () => {
      window.removeEventListener("online", intentar);
      window.removeEventListener("pageshow", intentar);
      document.removeEventListener("visibilitychange", alVerse);
      window.clearInterval(reloj);
    };
  }, [mandarLaCola]);

  const alternar = async (punto: PuntoDelGuion) => {
    const estabaHecho = (punto.id in cola ? cola[punto.id] : punto.hechoEn) !== null;

    // 1 · Se apunta y se pinta antes de intentar nada. Lo que se ve y lo que
    //     sobrevive a una recarga no dependen de que haya red.
    //
    //     La hora es sólo para pintar: la de verdad la pone el servidor con su
    //     propio reloj, porque el del móvil que marca es el de un invitado.
    //
    //     LA MISMA MARCA EN LOS DOS SITIOS. La cola sólo suelta pares que
    //     coincidan con lo que se mandó; con dos `new Date()` distintos, la
    //     segunda podía caer en el milisegundo siguiente y la entrada se
    //     quedaba «sin mandar» hasta el siguiente reintento, aceptada ya.
    const marca = estabaHecho ? null : new Date().toISOString();
    apuntar(punto.id, marca);
    setSinPermiso(false);
    setNoExiste(false);

    // 2 · Y se manda. Si ya hay un envío en camino, él se lo lleva al acabar.
    await mandarLaCola();
  };

  /*
    TRES CAPAS, Y EL ORDEN IMPORTA: lo que está sin mandar gana a lo que el
    servidor ya aceptó, y eso gana a lo que había cuando se pintó la pantalla.
    Un «sin permiso» no entra en ninguna de las dos primeras, así que vuelve al
    valor de la base — que es lo correcto: a un lector no se le marcó nada.
  */
  const conSusMarcas = puntos.map((punto) => ({
    ...punto,
    hechoEn: marcaVigente(punto.id, punto.hechoEn, cola, confirmadas),
    sinMandar: punto.id in cola,
  }));

  const sinMandar = conSusMarcas.filter((punto) => punto.sinMandar).length;
  // «Sin conexión» sólo si algo de lo pendiente falló de verdad al mandarlo.
  const algoFallo = conSusMarcas.some(
    (punto) => punto.sinMandar && envio.fallaron.includes(punto.id),
  );
  const tocaAhora = conSusMarcas.find((punto) => !punto.hechoEn) ?? null;

  return (
    <section className="mt-bloque">
      {/*
        LA SECCIÓN TIENE TÍTULO, Y NO LO TENÍA. Es una lista de veinte casillas
        colgando del `h1` de la pantalla, sin nada que diga qué son: con lector
        de pantalla, saltar de encabezado en encabezado se las pasaba enteras.
        El copy —«El guion de la jornada»— llevaba escrito desde el principio y
        nadie lo había pintado, que es un fallo que ninguna prueba cantaba.
      */}
      <Titulo3 como="h2">{t("panel.dia.guion.titulo")}</Titulo3>

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

      {sinMandar > 0 && algoFallo ? (
        <p
          role="status"
          data-sin-mandar={sinMandar}
          className="mt-elemento rounded-campo bg-aviso-fondo p-interno text-pequeno text-aviso-tinta"
        >
          {t("panel.dia.guion.sinConexion")}{" "}
          <strong>{t("panel.dia.guion.pendientes", { numero: sinMandar })}</strong>{" "}
          {/* Mientras va un envío, pulsar sólo lo pondría en la fila. */}
          <button
            type="button"
            disabled={envio.enCurso}
            className="min-h-control-compacto underline disabled:no-underline disabled:opacity-60"
            onClick={() => void mandarLaCola()}
          >
            {envio.enCurso ? t("panel.dia.guion.guardando") : t("panel.dia.guion.reintentar")}
          </button>
        </p>
      ) : sinMandar > 0 ? (
        // En camino y sin haber fallado: con buena red esto dura un segundo, y
        // un «sin conexión» amarillo en cada toque mentía.
        <p role="status" className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.dia.guion.guardando")}
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

      {noExiste ? (
        <p
          role="status"
          className="mt-elemento rounded-campo bg-aviso-fondo p-interno text-pequeno text-aviso-tinta"
        >
          {t("panel.dia.guion.noExiste")}
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
    </section>
  );
}
