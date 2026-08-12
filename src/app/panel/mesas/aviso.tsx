import type { ReactNode } from "react";

import { CAPACIDAD_MAXIMA_MESA, CAPACIDAD_MINIMA_MESA } from "@/config/constants";
import { t, type ClaveCopy } from "@/lib/copy";

/**
 * `role="alert"` sólo para lo que ha ido mal. Un «mesa guardada» anunciado a
 * gritos interrumpe lo que estuviera leyendo un lector de pantalla; un fallo sí
 * merece interrumpir.
 *
 * `confirmar-borrado` no ha fallado —se está preguntando— pero se anuncia como
 * aviso: quien no ve la pantalla tiene que enterarse de que su borrado no ha
 * ocurrido todavía.
 */
const AVISOS: Record<string, { clave: ClaveCopy; error: boolean }> = {
  creada: { clave: "panel.mesas.avisoCreada", error: false },
  editada: { clave: "panel.mesas.avisoEditada", error: false },
  borrada: { clave: "panel.mesas.avisoBorrada", error: false },
  colocada: { clave: "panel.mesas.avisoColocada", error: false },
  movida: { clave: "panel.mesas.avisoMovida", error: false },
  sentado: { clave: "panel.mesas.avisoSentado", error: false },
  levantado: { clave: "panel.mesas.avisoLevantado", error: false },
  nombre: { clave: "panel.mesas.errorNombre", error: true },
  "nombre-repetido": { clave: "panel.mesas.errorNombreRepetido", error: true },
  forma: { clave: "panel.mesas.errorForma", error: true },
  posicion: { clave: "panel.mesas.errorPosicion", error: true },
  mesa: { clave: "panel.mesas.errorMesa", error: true },
  invitado: { clave: "panel.mesas.errorInvitado", error: true },
  grupo: { clave: "panel.mesas.errorGrupo", error: true },
  "no-existe": { clave: "panel.mesas.errorNoExiste", error: true },
  "en-uso": { clave: "panel.mesas.errorEnUso", error: true },
  "sin-permiso": { clave: "panel.mesas.errorSinPermiso", error: true },
  error: { clave: "panel.mesas.errorGuardar", error: true },
};

interface Detalle {
  /** El nombre de la mesa implicada, ya resuelto por la pantalla. */
  mesa: string;
  /** Cuánta gente cabe y cuánta habría. Vacío si la acción no lo pudo decir. */
  caben: string;
  habria: string;
  /** Cuántos se quedarían sin sitio al borrar la mesa. */
  cuantos: string;
}

/**
 * LOS TRES AVISOS QUE LLEVAN CIFRA NO ESTÁN EN LA TABLA DE ARRIBA, y no es una
 * excepción por comodidad: son los únicos que necesitan un dato de la operación
 * que acaba de pasar, y con la cifra dentro se resuelven en la misma frase que
 * los nombra.
 *
 * «No caben» a secas obliga a ir a la mesa, contar cabeceras y restar. «En la
 * Mesa 4 caben 8 y os saldrían 11» dice además cuánto sobra.
 *
 * Si la cifra no llega —porque la acción falló antes de poder contarla— se dice
 * sin ella en vez de inventarla.
 */
export function AvisoMesas({ estado, detalle }: { estado: string; detalle: Detalle }) {
  if (estado === "sin-sitio") {
    return (
      <Recuadro error>
        {detalle.mesa && detalle.caben && detalle.habria
          ? t("panel.mesas.errorSinSitio", {
              mesa: detalle.mesa,
              caben: detalle.caben,
              habria: detalle.habria,
            })
          : t("panel.mesas.errorSinSitioSinCifra")}
      </Recuadro>
    );
  }

  /*
    EL RANGO SALE DE LAS CONSTANTES Y NO DEL TEXTO. Escribir «entre 1 y 30» en
    el copy convertiría el tope en dos números que se separan solos: el día que
    la migración admita mesas de cuarenta, el mensaje seguiría diciendo treinta
    y nadie sabría por qué le rechazan un 35.
  */
  if (estado === "capacidad") {
    return (
      <Recuadro error>
        {t("panel.mesas.errorCapacidad", {
          minima: CAPACIDAD_MINIMA_MESA,
          maxima: CAPACIDAD_MAXIMA_MESA,
        })}
      </Recuadro>
    );
  }

  if (estado === "confirmar-borrado") {
    return (
      <Recuadro error>
        {detalle.mesa && detalle.cuantos
          ? t("panel.mesas.avisoConfirmarBorrado", {
              mesa: detalle.mesa,
              cuantos: detalle.cuantos,
            })
          : t("panel.mesas.avisoConfirmarBorradoSinCifra")}
      </Recuadro>
    );
  }

  /*
    SENTAR A QUIEN NO HA CONTESTADO SE PERMITE Y SE AVISA, y por eso va en
    ámbar y no en rojo ni en verde. En verde se leería como «hecho y correcto»
    —y falta la respuesta— y en rojo como «no se ha guardado», que sería
    mentira: se ha guardado. El ámbar es exactamente lo que ha pasado.
  */
  if (estado === "sentado-sin-confirmar") {
    return (
      <p
        role="status"
        className="mt-elemento rounded-campo bg-aviso-fondo p-interno text-pequeno text-aviso-tinta print:hidden"
      >
        {t("panel.mesas.avisoSentadoSinConfirmar")}
      </p>
    );
  }

  const aviso = AVISOS[estado];
  if (!aviso) return null;

  return <Recuadro error={aviso.error}>{t(aviso.clave)}</Recuadro>;
}

function Recuadro({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mt-elemento rounded-campo p-interno text-pequeno print:hidden ${
        error ? "bg-error-fondo text-error-tinta" : "bg-exito-fondo text-exito-tinta"
      }`}
    >
      {children}
    </p>
  );
}
