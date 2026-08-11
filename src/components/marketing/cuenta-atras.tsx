"use client";

import { useEffect, useState } from "react";

import { ZONA_HORARIA } from "@/config/constants";
import { t } from "@/lib/copy";

/**
 * CUENTA ATRÁS
 *
 * El servidor entrega el HTML ya con los números calculados, así que se ve bien
 * antes de que cargue ningún JavaScript; a partir de ahí el cliente los
 * refresca cada segundo.
 *
 * La fecha llega desde la base de datos, nunca desde una constante: si cambia
 * la hora de la ceremonia, cambia aquí sola.
 */

interface Restante {
  dias: number;
  horas: number;
  minutos: number;
  segundos: number;
  llegado: boolean;
}

function calcular(objetivo: number, ahora: number): Restante {
  let resto = Math.max(0, objetivo - ahora);
  const dias = Math.floor(resto / 86_400_000);
  resto -= dias * 86_400_000;
  const horas = Math.floor(resto / 3_600_000);
  resto -= horas * 3_600_000;
  const minutos = Math.floor(resto / 60_000);
  resto -= minutos * 60_000;
  return {
    dias,
    horas,
    minutos,
    segundos: Math.floor(resto / 1000),
    llegado: objetivo - ahora <= 0,
  };
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

export function CuentaAtras({ fechaIso }: { fechaIso: string }) {
  const objetivo = new Date(fechaIso).getTime();
  const [restante, setRestante] = useState(() => calcular(objetivo, Date.now()));

  useEffect(() => {
    const id = setInterval(() => setRestante(calcular(objetivo, Date.now())), 1000);
    return () => clearInterval(id);
  }, [objetivo]);

  if (restante.llegado) {
    return <p className="font-titulo text-titulo-1 text-tinta">{t("cuentaAtras.yaEsHoy")}</p>;
  }

  const bloques = [
    { valor: String(restante.dias), etiqueta: t("cuentaAtras.dias") },
    { valor: dosDigitos(restante.horas), etiqueta: t("cuentaAtras.horas") },
    { valor: dosDigitos(restante.minutos), etiqueta: t("cuentaAtras.minutos") },
    { valor: dosDigitos(restante.segundos), etiqueta: t("cuentaAtras.segundos") },
  ];

  return (
    <div
      /*
        EN MÓVIL, DOS POR DOS. Con cuatro bloques en una fila que envuelve, un
        390 px partía el contador en tres arriba y uno abajo — un huérfano
        centrado que parecía un descuido. La rejilla de dos columnas reparte el
        peso igual; desde `sm` vuelve la fila única de la entrega.
      */
      className="grid grid-cols-2 justify-items-center gap-elemento sm:flex sm:flex-wrap sm:justify-center"
      // Un contador que se relee entero cada segundo es ruido insoportable con
      // lector de pantalla. Se anuncia el conjunto una vez y se calla.
      aria-live="off"
      role="timer"
      aria-label={`${restante.dias} ${t("cuentaAtras.dias")}`}
    >
      {bloques.map((bloque) => (
        <div key={bloque.etiqueta} className="animacion-escala-al-ver min-w-cifra text-center">
          {/*
            Las cifras tienen su propio tamaño, más contenido que el titular:
            son cuatro seguidas y a tamaño de portada no cabrían en un móvil.
          */}
          <div className="font-titulo text-cifra font-light leading-none tabular-nums">
            {bloque.valor}
          </div>
          <div className="mt-linea text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
            {bloque.etiqueta}
          </div>
        </div>
      ))}
      <span className="sr-only">{ZONA_HORARIA}</span>
    </div>
  );
}
