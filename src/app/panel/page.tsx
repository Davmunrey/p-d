import Link from "next/link";

import { AvisoDesvios } from "@/components/panel/aviso-desvios";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, RUTA_INVITADOS, ZONA_HORARIA } from "@/config/constants";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import { desviosDe, obtenerResumenPresupuesto } from "@/lib/bbdd/presupuesto";
import { obtenerResumen, type ResumenBoda } from "@/lib/bbdd/resumen";
import { t } from "@/lib/copy";

/**
 * BODA-43 · RESUMEN — la portada del panel
 *
 * Lo primero que se ve al entrar, así que enseña lo único que se mira todos
 * los días: cuánto falta y cuántos han dicho que sí.
 *
 * LOS NÚMEROS SON DE VERDAD. Salen de `v_estadisticas_invitados` y
 * `v_menus_confirmados`, dos vistas que llevaban desde el primer día en la base
 * sin que nadie las consultara. Antes esta pantalla decía «aquí irán los
 * números de la boda», que es exactamente el tipo de promesa que la regla 3 no
 * permite dejar en pie.
 *
 * NO SE CACHEA: cambia cada vez que alguien contesta, y un panel que enseña
 * cifras de hace una hora es peor que uno que no las enseña.
 *
 * El acceso ya lo ha comprobado el layout: aquí no se repite.
 */
export const dynamic = "force-dynamic";

const formatoNumero = new Intl.NumberFormat(IDIOMA);

/** Días que faltan, contados por fecha y no restando milisegundos. */
function diasHasta(fecha: Date): number {
  const enZona = (instante: Date) =>
    new Date(
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: ZONA_HORARIA,
      }).format(instante),
    );

  const hoy = enZona(new Date());
  const dia = enZona(fecha);
  return Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
}

export default async function PaginaResumen() {
  const [configuracion, resumen, presupuesto] = await Promise.all([
    obtenerConfiguracion().catch(() => null),
    obtenerResumen(),
    obtenerResumenPresupuesto(),
  ]);

  const desvios = desviosDe(presupuesto);

  const dias = configuracion ? diasHasta(configuracion.fechaCeremonia) : null;

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.resumen.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.resumen.descripcion")}</Cuerpo>
        <p className="mt-pila font-titulo text-titulo-3 text-tinta-marca">
          {dias === null
            ? t("panel.resumen.sinFecha")
            : dias > 0
              ? t("panel.resumen.faltan", { dias: formatoNumero.format(dias) })
              : dias === 0
                ? t("panel.resumen.esHoy")
                : t("panel.resumen.yaFue")}
        </p>
      </header>

      {/*
        EL AVISO VA ANTES QUE LAS CIFRAS, y no al final con lo demás. Todo lo
        que hay debajo es información —cuántos vienen, cuántos faltan—; esto es
        lo único de la pantalla sobre lo que hay que hacer algo, y ponerlo tras
        cuatro bloques de números es enterrarlo.
      */}
      <AvisoDesvios desvios={desvios} />

      {resumen.invitados.personas === 0 ? (
        <section>
          <Cuerpo className="max-w-texto">{t("panel.resumen.sinInvitados")}</Cuerpo>
          <Link
            href={RUTA_INVITADOS}
            className="mt-pila inline-block border-b border-borde-fuerte text-cuerpo text-tinta transicion-color hover:text-tinta-marca"
          >
            {t("panel.resumen.irAInvitados")}
          </Link>
        </section>
      ) : (
        <>
          <Bloque titulo={t("panel.resumen.bloqueInvitados")}>
            <Cifra rotulo={t("panel.resumen.personas")} valor={resumen.invitados.personas} />
            <Cifra
              rotulo={t("panel.resumen.confirmados")}
              valor={resumen.invitados.confirmados}
              destacada
            />
            <Cifra
              rotulo={t("panel.resumen.pendientes")}
              valor={resumen.invitados.pendientes}
            />
            <Cifra
              rotulo={t("panel.resumen.rechazados")}
              valor={resumen.invitados.rechazados}
            />
          </Bloque>

          <Bloque titulo={t("panel.resumen.bloqueLogistica")}>
            {/*
              Adultos y niños se cuentan por `es_nino` y no por el tipo de menú:
              un menor puede llevar menú sin gluten, y contarlo por ahí
              descuadraría tronas, autobús y espacio infantil a la vez.
            */}
            <Cifra
              rotulo={t("panel.resumen.adultos")}
              valor={resumen.invitados.adultosConfirmados}
            />
            <Cifra
              rotulo={t("panel.resumen.ninos")}
              valor={resumen.invitados.ninosConfirmados}
            />
            <Cifra
              rotulo={t("panel.resumen.autobus")}
              valor={resumen.invitados.plazasAutobus}
            />
            <Cifra
              rotulo={t("panel.resumen.alojamiento")}
              valor={resumen.invitados.necesitanAlojamiento}
            />
          </Bloque>

          <Menus menus={resumen.menus} />
        </>
      )}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <Titulo3 como="h2">{titulo}</Titulo3>
      <dl className="mt-pila grid gap-interno sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
    </section>
  );
}

/**
 * Una cifra con su rótulo. `dt`/`dd` y no dos `div`: es una lista de
 * definiciones —término y valor—, y así un lector de pantalla los lee
 * emparejados en lugar de recitar ocho números sueltos.
 */
function Cifra({
  rotulo,
  valor,
  destacada = false,
}: {
  rotulo: string;
  valor: number;
  destacada?: boolean;
}) {
  return (
    <div className="rounded-tarjeta border border-borde p-interno">
      <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">{rotulo}</dt>
      <dd
        className={`mt-linea font-titulo text-titulo-2 tabular-nums ${
          destacada ? "text-tinta-marca" : "text-tinta"
        }`}
      >
        {formatoNumero.format(valor)}
      </dd>
    </div>
  );
}

function Menus({ menus }: { menus: ResumenBoda["menus"] }) {
  return (
    <section>
      <Titulo3 como="h2">{t("panel.resumen.bloqueCocina")}</Titulo3>
      {menus.length === 0 ? (
        <Cuerpo className="mt-pila max-w-texto">{t("panel.resumen.sinMenus")}</Cuerpo>
      ) : (
        <dl className="mt-pila grid gap-interno sm:grid-cols-2 lg:grid-cols-3">
          {menus.map((menu) => (
            <div key={menu.tipoMenu} className="rounded-tarjeta border border-borde p-interno">
              <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
                {t(`rsvp.menus.${menu.tipoMenu}` as "rsvp.menus.estandar")}
              </dt>
              <dd className="mt-linea font-titulo text-titulo-2 tabular-nums text-tinta">
                {formatoNumero.format(menu.personas)}
              </dd>
              {menu.conAlergias > 0 ? (
                <Etiqueta className="mt-linea">
                  {t("panel.resumen.conAlergias", {
                    cuantas: formatoNumero.format(menu.conAlergias),
                  })}
                </Etiqueta>
              ) : null}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
