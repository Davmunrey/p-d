"use client";

import { useMemo, useState } from "react";

import { CampoTexto } from "@/components/ui/campo";
import type { InvitadoDelDia } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { normalizar } from "@/lib/texto";

/**
 * BODA-102 (#69) · ¿EN QUÉ MESA ESTOY?
 *
 * Alguien lo pregunta en mitad del cóctel. La respuesta tiene que estar en un
 * toque, y por eso esta pantalla es un campo enorme y nada más: sin tabla que
 * filtrar, sin columnas, sin encabezados que leer antes de encontrar el dato.
 *
 * BUSCA SOBRE LO QUE YA ESTÁ DESCARGADO. La lista entera llega con la página, y
 * escribir no consulta nada. Es el criterio del ticket —«funciona sin conexión
 * con los datos ya descargados»— y también la única forma de que sea de verdad
 * instantáneo: doscientos invitados se filtran en menos de un milisegundo.
 *
 * SIN ACENTOS Y POR CUALQUIERA DE LAS DOS PARTES DEL NOMBRE. Quien busca con
 * una mano escribe «gonzalez», y quien pregunta por «Ainhoa» no siempre sabe el
 * apellido. Se busca sobre «nombre apellidos» junto, así que las dos entran.
 *
 * NO SE ENSEÑA NADA HASTA QUE SE ESCRIBE. Pintar los ciento veinte invitados de
 * salida convertiría la pantalla en la tabla que el ticket quiere evitar.
 */
export function Buscador({ invitados }: { invitados: InvitadoDelDia[] }) {
  const [busqueda, setBusqueda] = useState("");

  /*
    Se normaliza una vez por invitado y no en cada tecla: con la lista entera en
    memoria, normalizar dentro del filtro haría el trabajo doscientas veces por
    pulsación en vez de una sola al cargar.
  */
  const indexados = useMemo(
    () =>
      invitados.map((invitado) => ({
        invitado,
        buscable: normalizar(`${invitado.nombre} ${invitado.apellidos ?? ""}`),
      })),
    [invitados],
  );

  const escrito = busqueda.trim();

  const encontrados = useMemo(() => {
    const buscado = normalizar(escrito);
    if (!buscado) return [];
    return indexados
      .filter((fila) => fila.buscable.includes(buscado))
      .map((fila) => fila.invitado);
  }, [escrito, indexados]);

  return (
    <>
      <div className="mt-bloque max-w-texto">
        {/*
          `autoFocus` a propósito, y es de los pocos sitios donde se justifica:
          esta pantalla no tiene otro contenido que este campo, se llega a ella
          desde un atajo con una pregunta ya hecha en voz alta, y el teclado
          abriéndose solo ahorra el toque que más cuesta con una mano ocupada.
        */}
        <CampoTexto
          etiqueta={t("panel.dia.buscar.campo")}
          ayuda={t("panel.dia.buscar.ayuda")}
          type="search"
          autoFocus
          autoComplete="off"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
      </div>

      <div aria-live="polite" className="mt-bloque">
        {!escrito ? (
          <p className="max-w-texto text-pequeno text-tinta-suave">
            {t("panel.dia.buscar.escribeAlgo")}
          </p>
        ) : encontrados.length === 0 ? (
          /*
            EL CASO DE ERROR DEL TICKET, y se dice con el nombre buscado dentro:
            «nadie se llama así» a secas deja la duda de si la pantalla ha
            entendido lo que se ha escrito.
          */
          <p className="max-w-texto text-cuerpo text-tinta">
            {t("panel.dia.buscar.sinResultados", { texto: escrito })}
          </p>
        ) : (
          <>
            <p className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
              {t("panel.dia.buscar.resultados", {
                numero: encontrados.length,
                total: invitados.length,
              })}
            </p>
            <ul className="mt-elemento grid gap-interno">
              {encontrados.map((invitado) => (
                <li key={invitado.id}>
                  <Resultado invitado={invitado} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Una respuesta, en el orden en que se pregunta: quién, dónde se sienta, qué
 * come y qué no puede comer.
 *
 * LA MESA VA LA PRIMERA Y EN GRANDE porque es lo que se ha preguntado el 90 %
 * de las veces. Lo demás se lee después, si hace falta.
 */
function Resultado({ invitado }: { invitado: InvitadoDelDia }) {
  const nombre = [invitado.nombre, invitado.apellidos].filter(Boolean).join(" ");

  return (
    <article className="rounded-campo border border-borde p-elemento">
      <h2 className="text-titulo-3 text-tinta">{nombre}</h2>

      <p className="mt-pila text-cuerpo text-tinta">
        <span className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
          {t("panel.dia.buscar.mesa")}
        </span>{" "}
        <span className="text-titulo-3 text-tinta">
          {invitado.mesa ?? t("panel.dia.buscar.sinMesa")}
        </span>
      </p>

      <dl className="mt-elemento grid gap-interno-compacto text-pequeno">
        <div className="flex flex-wrap gap-interno-compacto">
          <dt className="text-tinta-suave">{t("panel.dia.buscar.menu")}</dt>
          <dd className="text-tinta">
            {t(`rsvp.menus.${invitado.tipoMenu}` as "rsvp.menus.estandar")}
            {invitado.esNino ? ` · ${t("panel.dia.buscar.nino")}` : ""}
          </dd>
        </div>

        {invitado.alergias ? (
          <div className="flex flex-wrap gap-interno-compacto">
            <dt className="text-tinta-suave">{t("panel.dia.buscar.alergias")}</dt>
            {/*
              LAS ALERGIAS SE PINTAN COMO AVISO Y NO COMO UN DATO MÁS. Es lo
              único de esta ficha que, si se pasa por alto, manda a alguien al
              hospital.
            */}
            <dd className="rounded-etiqueta bg-aviso-fondo px-interno-compacto py-linea text-aviso-tinta">
              {invitado.alergias}
            </dd>
          </div>
        ) : null}
      </dl>

      {!invitado.confirmado ? (
        <p className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.dia.buscar.sinConfirmar")}
        </p>
      ) : null}
    </article>
  );
}
