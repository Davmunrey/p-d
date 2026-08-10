"use client";

import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { Etiqueta } from "@/components/ui/tipografia";
import { RUTA_CUENTA_REGALOS } from "@/config/constants";
import { t } from "@/lib/copy";

/**
 * BODA-28 · EL NÚMERO DE CUENTA SE REVELA AL PULSAR
 *
 * El IBAN no viaja en el HTML de la landing. Se pide a `/regalos/cuenta`
 * cuando alguien pulsa, y hasta entonces lo que hay aquí es un botón.
 *
 * POR QUÉ, QUE NO ES OBVIO. Un número de cuenta escrito en el HTML lo indexan
 * los buscadores y lo recogen los rastreadores sin que nadie haya abierto la
 * página siquiera. Pedirlo aparte no lo convierte en un secreto —quien conozca
 * la ruta puede pedirla— pero deja fuera todo lo que no es una persona mirando
 * la web, que es de lo que hay que proteger un dato así en un sitio público.
 *
 * Y HAY UNA RAZÓN DE FONDO ADEMÁS DE LA TÉCNICA: la sección dice «vuestra
 * presencia ya es el regalo». Un número de cuenta a la vista contradice esa
 * frase por mucho que la frase esté encima. Detrás de un botón, quien no
 * quiera contribuir no lo ve, y ésa es la intención de todo el bloque.
 */

interface Cuenta {
  iban: string;
  titular: string | null;
}

type Estado =
  | { fase: "oculta" }
  | { fase: "pidiendo" }
  | { fase: "visible"; cuenta: Cuenta }
  | { fase: "fallo" };

export function CuentaRegalos() {
  const [estado, setEstado] = useState<Estado>({ fase: "oculta" });

  async function revelar() {
    setEstado({ fase: "pidiendo" });
    try {
      const respuesta = await fetch(RUTA_CUENTA_REGALOS);
      if (!respuesta.ok) throw new Error(String(respuesta.status));
      setEstado({ fase: "visible", cuenta: (await respuesta.json()) as Cuenta });
    } catch {
      // Sin detalles: quien lo lee no puede arreglar nada, y el motivo real
      // —la base, la red— no le dice nada útil.
      setEstado({ fase: "fallo" });
    }
  }

  if (estado.fase === "visible") {
    return (
      <>
        {estado.cuenta.titular ? (
          <Etiqueta>{t("regalos.titular", { titular: estado.cuenta.titular })}</Etiqueta>
        ) : null}
        <CampoCopiable
          valor={estado.cuenta.iban}
          etiqueta={t("regalos.etiquetaCuenta")}
          textoCopiar={t("regalos.copiar")}
          textoCopiado={t("regalos.copiado")}
        />
      </>
    );
  }

  return (
    <>
      <Boton
        jerarquia="secundario"
        onClick={revelar}
        disabled={estado.fase === "pidiendo"}
        className="mt-pila"
      >
        {estado.fase === "pidiendo" ? t("regalos.revelando") : t("regalos.revelar")}
      </Boton>

      {estado.fase === "fallo" ? (
        <p role="alert" className="mt-pila text-pequeno text-tinta-suave">
          {t("regalos.errorRevelar")}
        </p>
      ) : null}

      {/*
        Sin JavaScript no hay botón que valga, y meter el número en el
        `<noscript>` sería devolverlo al HTML entregado — justo lo que este
        componente existe para evitar. Así que se dice a quién escribir.
      */}
      <noscript>
        <p className="mt-pila text-pequeno text-tinta-suave">{t("regalos.sinJavascript")}</p>
      </noscript>
    </>
  );
}
