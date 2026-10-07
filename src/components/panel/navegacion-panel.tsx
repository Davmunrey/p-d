"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { cerrarSesion } from "@/app/acceso/acciones";
import { IconoPanel, type ClaveIcono } from "@/components/panel/iconos-panel";
import { BotonEnvio } from "@/components/ui/boton-envio";
import {
  GRUPOS_DE_MODULOS,
  MODULOS_EN_LA_BARRA,
  MODULOS_ENTREGADOS,
  modulosDe,
  moduloActivo,
  type ClaveModulo,
  type LugarEnElMenu,
} from "@/config/modulos";
import { t } from "@/lib/copy";

/**
 * NAVEGACIÓN DEL PANEL
 *
 * DOS SITIOS MUY DISTINTOS. En el portátil se planifica: sesiones largas,
 * saltando entre módulos, y el lateral fijo permite hacerlo sin perder de
 * vista dónde está uno. En el móvil se consulta, con una mano y a menudo de
 * pie, así que lo que más se mira baja al alcance del pulgar.
 *
 * EN GRUPOS, NO EN UNA COLUMNA DE TRECE. Los módulos se agrupan por la
 * pregunta que contestan (ver `config/modulos.ts`), con el resumen suelto
 * arriba y ajustes, la cuenta y la sesión al pie. El rótulo va en minúscula y
 * a tamaño de lectura: la versalita espaciada de antes es la de una etiqueta,
 * y trece seguidas se leían como un bloque gris.
 *
 * EN EL MÓVIL, CUATRO DESTINOS Y «MÁS». La barra era una tira de trece rótulos
 * que había que arrastrar para encontrar cada uno. Ahora lleva fijos los
 * cuatro que se miran con el móvil en la mano, con su icono, y el quinto hueco
 * abre una hoja con el menú entero agrupado. Si el módulo abierto no está en la
 * barra, «Más» se marca: siempre se ve en qué zona está uno.
 *
 * LA SESIÓN BAJA AL PIE DEL MENÚ. «Has entrado como… · Cerrar sesión» ocupaba
 * una franja encima de cada pantalla —dos renglones en el móvil— para decir
 * algo que se mira una vez al día. Ahora vive al final del lateral y de la
 * hoja, y cada pantalla empieza por su título.
 *
 *
 * SIN PRECARGA, Y NO ES UN AJUSTE FINO: ES DEJAR DE PEDIR PÁGINAS ENTERAS POR
 * CADA VISITA.
 *
 * Todas las rutas del panel son `force-dynamic` —leen de la base en cada
 * petición—, así que precargar un enlace del menú **no** es leer un fichero
 * estático: es renderizar esa pantalla entera en el servidor, con sus
 * consultas, para tirarla si no se pulsa. En Vercel eso son invocaciones que se
 * pagan y que no las pide nadie, y la sospecha de #126 es que una tanda de esas
 * peticiones en vuelo es lo que hace que el enrutador no aplique la respuesta
 * de una acción.
 */

export interface SesionDelPanel {
  /** El nombre del perfil o, si no tiene, el correo. */
  nombre: string;
}

const ICONO_DE: Record<(typeof MODULOS_EN_LA_BARRA)[number], ClaveIcono> = {
  resumen: "resumen",
  invitados: "invitados",
  tareas: "tareas",
  dia: "dia",
};

/** Los destinos fijos de la barra, con su ruta: sólo los que estén entregados. */
const DESTINOS_DE_LA_BARRA = MODULOS_EN_LA_BARRA.flatMap((clave) => {
  const modulo = MODULOS_ENTREGADOS.find((candidato) => candidato.clave === clave);
  return modulo ? [{ clave, ruta: modulo.ruta }] : [];
});

/**
 * `marca` son los nombres de los novios, leídos de la base por el layout: aquí
 * no se escriben, que es un componente de cliente y la base no llega.
 */
export function NavegacionPanel({ marca, sesion }: { marca: string; sesion: SesionDelPanel }) {
  const ruta = usePathname();
  const activo = moduloActivo(ruta);
  const hoja = useRef<HTMLDialogElement>(null);
  const botonMas = useRef<HTMLButtonElement>(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const idTituloHoja = useId();

  // El módulo abierto no tiene hueco propio en la barra: «Más» lo representa.
  const masMarcado =
    activo !== null && !DESTINOS_DE_LA_BARRA.some((destino) => destino.clave === activo);

  /*
    AL CAMBIAR DE PANTALLA, LA HOJA SE CIERRA. Pulsar un destino ya la cierra;
    esto cubre el resto —«atrás» del navegador con la hoja abierta—, que la
    dejaba encima de una pantalla que no era la suya.
  */
  useEffect(() => {
    if (hoja.current?.open) hoja.current.close();
  }, [ruta]);

  /*
    Y SI LA BARRA DESAPARECE, TAMBIÉN. La hoja sólo existe en el móvil; abierta
    en una tableta en vertical y girada a horizontal, quedaba oculta pero
    seguía siendo modal, y la página entera se quedaba sin responder. Se cierra
    en cuanto «Más» deja de verse, que es lo mismo que decir que manda el
    lateral, sin repetir aquí el punto de corte.
  */
  useEffect(() => {
    const alCambiarElTamano = () => {
      if (hoja.current?.open && botonMas.current?.offsetParent === null) hoja.current.close();
    };
    window.addEventListener("resize", alCambiarElTamano);
    return () => window.removeEventListener("resize", alCambiarElTamano);
  }, []);

  const abrirHoja = () => {
    hoja.current?.showModal();
    setHojaAbierta(true);
  };
  const cerrarHoja = () => hoja.current?.close();

  return (
    <>
      {/* Lateral, en escritorio */}
      <nav
        aria-label={t("panel.navegacion")}
        className="fixed inset-y-0 left-0 capa-lateral hidden w-lateral flex-col overflow-y-auto overscroll-contain border-r border-borde bg-superficie px-interno py-elemento md:flex print:hidden"
      >
        <p className="px-interno-compacto font-titulo text-titulo-3 leading-titulo-corto text-tinta-marca">
          {marca}
        </p>

        <MenuAgrupado activo={activo} className="mt-elemento" />

        <PieDelMenu sesion={sesion} activo={activo} className="mt-auto pt-elemento" />
      </nav>

      {/* Barra inferior, en móvil */}
      <nav
        aria-label={t("panel.navegacion")}
        className="fixed inset-x-0 bottom-0 capa-lateral border-t border-borde bg-superficie barra-inferior md:hidden print:hidden"
      >
        <ul className="flex h-barra-movil items-stretch px-interno-compacto">
          {DESTINOS_DE_LA_BARRA.map((destino) => (
            <li key={destino.clave} className="flex flex-1 basis-0">
              <DestinoDeLaBarra
                ruta={destino.ruta}
                icono={ICONO_DE[destino.clave]}
                rotulo={t(`panel.barra.${destino.clave}`)}
                activo={destino.clave === activo}
              />
            </li>
          ))}
          <li className="flex flex-1 basis-0">
            <button
              ref={botonMas}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={hojaAbierta}
              onClick={abrirHoja}
              className={claseDestino(masMarcado)}
            >
              <IconoDeDestino icono="mas" activo={masMarcado} />
              <span>{t("panel.barra.mas")}</span>
            </button>
          </li>
        </ul>
      </nav>

      {/*
        LA HOJA DEL MÓVIL ES UN `<dialog>` NATIVO, y no un `div` con estado: el
        navegador ya atrapa el foco dentro, lo devuelve al botón al cerrar,
        cierra con Escape y deja inerte lo de detrás. Escribirlo a mano es
        reescribir lo que ya funciona, y peor.

        Pulsar fuera —en el velo— también cierra: el contenido llena la hoja,
        así que el único clic que llega al `<dialog>` mismo es el del velo.
      */}
      <dialog
        ref={hoja}
        aria-labelledby={idTituloHoja}
        onClose={() => setHojaAbierta(false)}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) cerrarHoja();
        }}
        className="hoja-menu fixed inset-x-0 top-auto bottom-0 m-0 max-h-hoja-menu w-full max-w-full rounded-t-tarjeta bg-superficie p-0 text-tinta backdrop:bg-velo md:hidden print:hidden"
      >
        <div className="flex max-h-hoja-menu flex-col overflow-y-auto overscroll-contain px-interno pt-interno barra-inferior">
          <div className="flex items-center justify-between gap-interno">
            <p
              id={idTituloHoja}
              className="font-titulo text-titulo-3 leading-titulo-corto text-tinta-marca"
            >
              {t("panel.menu.titulo")}
            </p>
            <button
              type="button"
              onClick={cerrarHoja}
              className="inline-flex size-control-compacto items-center justify-center rounded-campo text-tinta-suave transicion-color hover:bg-superficie-hundida hover:text-tinta"
            >
              <IconoPanel icono="cerrar" className="size-icono-barra" />
              <span className="sr-only">{t("panel.menu.cerrar")}</span>
            </button>
          </div>

          <MenuAgrupado
            activo={activo}
            alElegir={cerrarHoja}
            enDosColumnas
            className="mt-interno"
          />

          <PieDelMenu
            sesion={sesion}
            activo={activo}
            alElegir={cerrarHoja}
            enDosColumnas
            className="mt-elemento pb-elemento"
          />
        </div>
      </dialog>
    </>
  );
}

/** El resumen suelto y los cuatro grupos, cada uno con su rótulo. */
function MenuAgrupado({
  activo,
  alElegir,
  enDosColumnas = false,
  className = "",
}: {
  activo: ClaveModulo | null;
  alElegir?: () => void;
  /** En la hoja del móvil: el menú entero cabe en una pantalla sin desplazarse. */
  enDosColumnas?: boolean;
  className?: string;
}) {
  const idBase = useId();
  const lugares: LugarEnElMenu[] = ["inicio", ...GRUPOS_DE_MODULOS];

  return (
    <div className={`grid gap-elemento ${className}`}>
      {lugares.map((lugar) => {
        const modulos = modulosDe(lugar);
        if (modulos.length === 0 || lugar === "pie") return null;
        const idRotulo = `${idBase}-${lugar}`;

        return (
          <div key={lugar}>
            {/*
              EL RÓTULO DEL GRUPO NO ES UN ENCABEZADO. Un `<h2>` dentro del menú
              se colaba en el índice de la página por delante de su título, en
              todas las pantallas. Nombra la lista con `aria-labelledby`, que es
              lo que oye quien la recorre: «Preparativos, lista, 4 elementos».
            */}
            {lugar === "inicio" ? null : (
              <p
                id={idRotulo}
                className="px-interno-compacto pb-linea text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
              >
                {t(`panel.grupos.${lugar}`)}
              </p>
            )}
            <ul
              aria-labelledby={lugar === "inicio" ? undefined : idRotulo}
              className={`grid gap-linea ${enDosColumnas ? "grid-cols-2" : ""}`}
            >
              {modulos.map((modulo) => (
                <li key={modulo.clave}>
                  <EnlaceDelMenu
                    ruta={modulo.ruta}
                    rotulo={t(`panel.modulos.${modulo.clave}`)}
                    activo={modulo.clave === activo}
                    alElegir={alElegir}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Quién ha entrado, ajustes y cuenta, la web y cerrar sesión. */
function PieDelMenu({
  sesion,
  activo,
  alElegir,
  enDosColumnas = false,
  className = "",
}: {
  sesion: SesionDelPanel;
  activo: ClaveModulo | null;
  alElegir?: () => void;
  enDosColumnas?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid gap-interno-compacto border-t border-borde ${className}`}>
      <p className="px-interno-compacto pt-interno-compacto text-pequeno text-tinta-suave">
        {t("panel.sesionDe")}{" "}
        <strong className="font-normal text-tinta">{sesion.nombre}</strong>
      </p>

      <ul className={`grid gap-linea ${enDosColumnas ? "grid-cols-2" : ""}`}>
        {modulosDe("pie").map((modulo) => (
          <li key={modulo.clave}>
            <EnlaceDelMenu
              ruta={modulo.ruta}
              rotulo={t(`panel.modulos.${modulo.clave}`)}
              activo={modulo.clave === activo}
              alElegir={alElegir}
            />
          </li>
        ))}
        <li>
          {/*
            LA WEB, CON SU NOMBRE. Antes se llegaba pulsando los nombres de los
            novios en lo alto del lateral, que no decía a dónde llevaba. Se abre
            en otra pestaña —se va a mirar un cambio y a volver— y se avisa.
          */}
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="flex min-h-control-compacto items-center gap-interno-compacto rounded-campo px-interno-compacto text-pequeno text-tinta transicion-color hover:bg-superficie-hundida md:min-h-0 md:py-linea"
          >
            {t("panel.menu.verLaWeb")}
            <IconoPanel icono="externo" className="size-icono text-tinta-suave" />
            <span className="sr-only"> {t("panel.menu.otraPestana")}</span>
          </a>
        </li>
      </ul>

      <form action={cerrarSesion}>
        <BotonEnvio jerarquia="terciario">{t("acceso.cerrarSesion")}</BotonEnvio>
      </form>
    </div>
  );
}

function EnlaceDelMenu({
  ruta,
  rotulo,
  activo,
  alElegir,
}: {
  ruta: string;
  rotulo: string;
  activo: boolean;
  alElegir?: () => void;
}) {
  return (
    <Link
      href={ruta}
      // Ver la cabecera del fichero: precargar una ruta `force-dynamic` es
      // renderizarla entera para tirarla.
      prefetch={false}
      onClick={alElegir}
      // `aria-current` es lo que hace que un lector de pantalla diga «página
      // actual». El color solo no lo cuenta.
      aria-current={activo ? "page" : undefined}
      className={[
        // En el lateral, más juntos: con ratón no hace falta el mínimo táctil, y
        // así los trece módulos y el pie caben en la pantalla de un portátil.
        "flex min-h-control-compacto w-full items-center rounded-campo px-interno-compacto text-pequeno transicion-color md:min-h-0 md:py-linea",
        activo ? "bg-marca-tenue text-tinta-marca" : "text-tinta hover:bg-superficie-hundida",
      ].join(" ")}
    >
      {rotulo}
    </Link>
  );
}

/** Icono encima y rótulo debajo: el mismo molde para los destinos y «Más». */
function claseDestino(activo: boolean): string {
  return [
    "flex w-full flex-col items-center justify-center gap-linea rounded-campo text-etiqueta transicion-color",
    activo ? "text-tinta-marca" : "text-tinta-suave hover:text-tinta",
  ].join(" ");
}

/**
 * EL DIBUJO, SOBRE UNA PASTILLA SI ES DONDE SE ESTÁ. El color solo no basta
 * para ver de un vistazo cuál de los cinco está encendido —menos aún al sol—,
 * y la pastilla marca el sitio sin mover nada de la barra.
 */
function IconoDeDestino({ icono, activo }: { icono: ClaveIcono; activo: boolean }) {
  return (
    <span
      className={`inline-flex rounded-boton px-interno py-linea transicion-color ${
        activo ? "bg-marca-tenue" : ""
      }`}
    >
      <IconoPanel icono={icono} className="size-icono-barra" />
    </span>
  );
}

function DestinoDeLaBarra({
  ruta,
  icono,
  rotulo,
  activo,
}: {
  ruta: string;
  icono: ClaveIcono;
  rotulo: string;
  activo: boolean;
}) {
  return (
    <Link
      href={ruta}
      prefetch={false}
      aria-current={activo ? "page" : undefined}
      className={claseDestino(activo)}
    >
      <IconoDeDestino icono={icono} activo={activo} />
      <span>{rotulo}</span>
    </Link>
  );
}
