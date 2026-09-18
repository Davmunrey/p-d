import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO } from "@/config/constants";
import { ORIGEN_DE_LA_SECCION, type Donde } from "@/config/contenido-landing";
import { type Seccion } from "@/config/secciones";
import { obtenerEstadoDeLasSecciones, type EstadoDeSeccion } from "@/lib/bbdd/contenido";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { alternarVisible, moverSeccion } from "./acciones";
import { ESTADOS_DE_ERROR, esEstadoContenido, type EstadoContenido } from "./estado";

/**
 * BODA-128 · QUÉ SE VE EN LA WEB, Y QUÉ LE FALTA PARA VERSE
 *
 * `secciones_landing` lleva desde el primer día decidiendo qué secciones se
 * enseñan y en qué orden, con su `grant update` y su política puestos — y sin
 * una sola pantalla detrás. En producción eso dejó dos secciones apagadas de
 * fábrica que nadie podía encender, y varias encendidas que no salían.
 *
 * EL INTERRUPTOR SOLO NO BASTA, y es la mitad de esta pantalla. La landing
 * oculta lo que está vacío —antes ocultar que dejar un hueco—, así que encender
 * una sección sin contenido no cambia nada. Sin decir al lado qué le falta y
 * dónde se escribe, el interruptor se limita a mentir de otra manera.
 *
 * SIN UNA LÍNEA DE JAVASCRIPT DE CLIENTE. Son `<form>` con Server Actions:
 * encender, apagar y mover funcionan con el bundle a medio cargar, que es como
 * se abre esto desde el móvil con mala cobertura.
 *
 * UN LECTOR VE PERO NO TOCA. La protección es RLS —y cada acción comprueba el
 * recuento de filas, por si alguien manda el formulario a mano—; aquí sólo se
 * evita ofrecer lo que va a fallar.
 */
export const dynamic = "force-dynamic";

const AVISOS: Record<EstadoContenido, string> = {
  mostrada: t("panel.contenido.avisoMostrada"),
  ocultada: t("panel.contenido.avisoOcultada"),
  movida: t("panel.contenido.avisoMovida"),
  "seccion-desconocida": t("panel.contenido.errorSeccion"),
  "sin-permiso": t("panel.contenido.errorSinPermiso"),
  error: t("panel.contenido.errorGuardar"),
};

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaContenido({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const bruto = typeof consulta.estado === "string" ? consulta.estado : "";
  const estado = esEstadoContenido(bruto) ? bruto : null;

  const secciones = await obtenerEstadoDeLasSecciones();
  const puedeEditar = acceso.rol !== "lector";

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.contenido.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.contenido.descripcion")}</Cuerpo>
      </header>

      {estado ? (
        <p
          role={ESTADOS_DE_ERROR.includes(estado) ? "alert" : "status"}
          className={`rounded-campo p-interno text-pequeno ${
            ESTADOS_DE_ERROR.includes(estado)
              ? "bg-error-fondo text-error-tinta"
              : "bg-exito-fondo text-exito-tinta"
          }`}
        >
          {AVISOS[estado]}
        </p>
      ) : null}

      {!puedeEditar ? (
        <Etiqueta className="block">{t("panel.contenido.soloLectura")}</Etiqueta>
      ) : null}

      <section>
        {/*
          `ol` y no `ul`: el orden ES el dato. Quien navega con lector de
          pantalla oye «lista ordenada de dieciséis elementos» y sabe que
          moverse arriba y abajo cambia lo que se ve primero en la web.
        */}
        <h2 className="sr-only">{t("panel.contenido.listaTitulo")}</h2>
        <ol className="grid gap-interno">
          {secciones.map((fila, indice) => (
            <Fila
              key={fila.seccion}
              fila={fila}
              puedeEditar={puedeEditar}
              esLaPrimera={indice === 0}
              esLaUltima={indice === secciones.length - 1}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

function Fila({
  fila,
  puedeEditar,
  esLaPrimera,
  esLaUltima,
}: {
  fila: EstadoDeSeccion;
  puedeEditar: boolean;
  esLaPrimera: boolean;
  esLaUltima: boolean;
}) {
  const nombre = t(`navegacion.secciones.${fila.seccion}`);

  /*
    LO QUE DE VERDAD DECIDE SI SE VE. Encendida y vacía es igual de invisible
    que apagada, y confundirlas es exactamente el desconcierto que esta
    pantalla viene a quitar; por eso la ficha se marca cuando pasa.
  */
  const saleEnLaWeb = fila.visible && fila.llena === true;
  const encendidaPeroVacia = fila.visible && fila.llena === false;

  return (
    <li
      className={`grid gap-interno rounded-tarjeta border p-interno sm:grid-cols-[1fr_auto] sm:items-center ${
        saleEnLaWeb ? "border-borde" : "border-borde-fuerte bg-superficie-tenue"
      }`}
    >
      <div className="grid gap-pila">
        <div className="flex flex-wrap items-center gap-interno-compacto">
          <Titulo3 como="h3">{nombre}</Titulo3>

          <EtiquetaEstado variante={fila.visible ? "marca" : "contorno"} tamano="versalita">
            {fila.visible ? t("panel.contenido.visible") : t("panel.contenido.oculta")}
          </EtiquetaEstado>

          <Contenido fila={fila} destacado={encendidaPeroVacia} />
        </div>

        <DondeSeLlena seccion={fila.seccion} />
      </div>

      {puedeEditar ? (
        <div className="flex flex-wrap gap-interno-compacto sm:justify-end">
          <form action={alternarVisible}>
            <input type="hidden" name="seccion" value={fila.seccion} />
            {/* Viaja el valor que se quiere dejar puesto, no el actual. */}
            <input type="hidden" name="visible" value={fila.visible ? "no" : "si"} />
            <Boton type="submit" jerarquia="terciario">
              {fila.visible ? t("panel.contenido.ocultar") : t("panel.contenido.mostrar")}
              <DeQueSeccion nombre={nombre} />
            </Boton>
          </form>

          {/*
            EL BOTÓN NO SE PINTA CUANDO NO LLEVA A NINGÚN SITIO, en vez de
            pintarse desactivado: un botón apagado en el primero de la lista se
            lee como «esto está roto», y la función de la base ya devuelve sin
            hacer nada si alguien lo manda igualmente.
          */}
          {!esLaPrimera ? (
            <Mover seccion={fila.seccion} nombre={nombre} direccion="subir" />
          ) : null}
          {!esLaUltima ? (
            <Mover seccion={fila.seccion} nombre={nombre} direccion="bajar" />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Mover({
  seccion,
  nombre,
  direccion,
}: {
  seccion: Seccion;
  nombre: string;
  direccion: "subir" | "bajar";
}) {
  return (
    <form action={moverSeccion}>
      <input type="hidden" name="seccion" value={seccion} />
      <input type="hidden" name="direccion" value={direccion} />
      <Boton type="submit" jerarquia="terciario">
        {t(direccion === "subir" ? "panel.contenido.subirOrden" : "panel.contenido.bajarOrden")}
        <DeQueSeccion nombre={nombre} />
      </Boton>
    </form>
  );
}

/**
 * DE QUÉ SECCIÓN ES ESTE BOTÓN.
 *
 * Dieciséis botones que dicen todos «Ocultar de la web» son dieciséis botones
 * indistinguibles para quien navega a oídas: el lector de pantalla los recita
 * uno detrás de otro y ninguno dice de qué.
 *
 * VA COMO TEXTO OCULTO DENTRO DEL BOTÓN Y NO COMO `aria-label`, y la diferencia
 * no es de estilo. Un `aria-label` SUSTITUYE al rótulo visible, así que el
 * nombre accesible pasaría a ser «Subir Preguntas en el orden» mientras en la
 * pantalla pone «Subir en el orden» — y quien maneja el ordenador por voz dice
 * lo que LEE. Añadiéndolo dentro, el rótulo visible sigue entero y en orden
 * dentro del nombre accesible, que es justo lo que pide la regla del nombre en
 * la etiqueta (WCAG 2.5.3).
 */
function DeQueSeccion({ nombre }: { nombre: string }) {
  return <span className="sr-only"> {nombre}</span>;
}

/** Qué tiene dentro la sección: el número, o por qué no hay número. */
function Contenido({ fila, destacado }: { fila: EstadoDeSeccion; destacado: boolean }) {
  const origen = ORIGEN_DE_LA_SECCION[fila.seccion];

  if (origen.clase === "sin-hacer") {
    return (
      <EtiquetaEstado variante="aviso" tamano="versalita">
        {t("panel.contenido.sinHacer")}
      </EtiquetaEstado>
    );
  }

  if (origen.clase === "sola") {
    return <Etiqueta>{t("panel.contenido.noNecesita")}</Etiqueta>;
  }

  if (fila.llena === null) {
    return <Etiqueta>{t("panel.contenido.sinSaber")}</Etiqueta>;
  }

  if (origen.clase === "campo") {
    return fila.llena ? (
      <Etiqueta>{t("panel.contenido.escrito")}</Etiqueta>
    ) : (
      <EtiquetaEstado variante={destacado ? "aviso-marcada" : "aviso"} tamano="versalita">
        {t("panel.contenido.sinEscribir")}
      </EtiquetaEstado>
    );
  }

  const cuantos = fila.elementos ?? 0;

  if (cuantos === 0) {
    return (
      <EtiquetaEstado variante={destacado ? "aviso-marcada" : "aviso"} tamano="versalita">
        {t("panel.contenido.vacia")}
      </EtiquetaEstado>
    );
  }

  return (
    <Etiqueta>
      {cuantos === 1 ? t("panel.contenido.uno") : t("panel.contenido.cuantos", { cuantos })}
    </Etiqueta>
  );
}

/** Dónde se escribe: un enlace cuando hay a dónde ir, y la verdad cuando no. */
function DondeSeLlena({ seccion }: { seccion: Seccion }) {
  const origen = ORIGEN_DE_LA_SECCION[seccion];

  // Una sección sin hacer no tiene dónde llenarse: no hay pantalla que la pinte.
  if (origen.clase === "sin-hacer") return null;

  const donde: Donde = origen.donde;
  if (donde.pantalla === "nada") return null;

  if (donde.pantalla === "sql") {
    return <Etiqueta className="block">{t("panel.contenido.dondeSql")}</Etiqueta>;
  }

  if (donde.pantalla === "invitados") {
    return <Etiqueta className="block">{t("panel.contenido.dondeInvitados")}</Etiqueta>;
  }

  const rotulo = t(
    donde.pantalla === "ajustes"
      ? "panel.contenido.dondeAjustes"
      : "panel.contenido.dondeMedios",
  );

  return (
    <Link
      href={donde.ruta}
      prefetch={false}
      className="justify-self-start text-etiqueta uppercase tracking-etiqueta text-tinta-suave underline decoration-borde-fuerte underline-offset-4 transicion-color hover:text-tinta"
    >
      {t("panel.contenido.seLlenaEn", { donde: rotulo })}
    </Link>
  );
}
