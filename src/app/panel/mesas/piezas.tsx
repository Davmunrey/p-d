import Link from "next/link";

import type { ReactNode } from "react";

import { BotonEnlace } from "@/components/ui/boton";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  LARGOS_DE_CAMPO,
  CAPACIDAD_MAXIMA_MESA,
  CAPACIDAD_MINIMA_MESA,
  LADO_PLANO_MESAS,
  RUTA_MESAS_PLANO,
  RUTA_MESAS_REPARTO,
} from "@/config/constants";
import {
  ESTADO_CONFIRMADO,
  ESTADO_RECHAZADO,
  FORMAS_MESA,
  FORMA_PRESIDENCIA,
  sillasOcupadas,
  type AlergiaEnMesa,
  type Comensal,
  type FormaMesa,
  type GrupoSinSentar,
  type Mesa,
} from "@/lib/bbdd/mesas";
import { t } from "@/lib/copy";

import {
  borrarMesa,
  colocarMesa,
  crearMesa,
  editarMesa,
  empujarMesa,
  sentarGrupo,
  sentarInvitado,
} from "./acciones";
import { AvisoMesas } from "./aviso";
import { ANCLA_NUEVA, ANCLA_PLANO, anclaDeMesa, esAnclaDeMesas } from "./estado";

/**
 * BODA-83 (#59) y BODA-84 (#60) · EL PLANO DE LA SALA Y EL REPARTO
 *
 * LAS PIEZAS DE LAS TRES VISTAS DE LAS MESAS. Eran una sola pantalla de
 * treinta y ocho mil píxeles en un móvil —las dos bolsas, el plano, cada mesa
 * con su gente y el alta— con un índice de anclas para no perderse en ella.
 * Ahora son tres pestañas, cada una con lo suyo: «Por sentar» (`page.tsx`), el
 * plano (`plano/page.tsx`) y «Mesa a mesa» (`reparto/page.tsx`). Lo que
 * comparten vive aquí.
 *
 * LA BOLSA DE «TODAVÍA SIN MESA» ES LO PRIMERO QUE SE VE Y NO SE PUEDE IGNORAR.
 * Es la única pregunta que importa mientras se reparte —«¿me queda alguien?»—
 * y en cualquier otro sitio se contesta contando: recorriendo mesa por mesa a
 * ver quién no aparece, buscando precisamente lo que NO está. Aquí está
 * contestada antes de mirar, y cuando no queda nadie lo dice en vez de
 * desaparecer: un bloque que se esfuma no se distingue de uno que no ha cargado.
 *
 * AGRUPADA POR INVITACIÓN, que es como llega la gente. Una lista alfabética
 * obliga a reconstruir de memoria quién va con quién en cada asignación, y ahí
 * es exactamente donde se separa a un matrimonio sin enterarse.
 *
 * EL PLANO SE COLOCA SIN RATÓN Y SIN JAVASCRIPT: coordenadas escritas a mano y
 * cuatro flechas por mesa, todo dentro de formularios. Arrastrar es más cómodo
 * con un ratón y no funciona con el teclado, con un lector de pantalla ni con
 * el móvil en la finca, que es donde se abre esto el día antes. Y lo que se
 * mueve se guarda en la base: el plano sobrevive a una recarga y se ve igual
 * desde el otro móvil.
 *
 * LAS ALERGIAS SALEN DE `v_alergias_por_mesa` Y NO DE UN FILTRO DE AQUÍ. Es el
 * dato donde equivocarse tiene consecuencias médicas, así que su definición
 * —confirmado, respuesta vigente, texto no vacío— vive en la base, en un único
 * sitio que comparten esta pantalla y la exportación para el catering.
 *
 * SE IMPRIME. El día de la boda esto acaba en papel encima de una mesa, así que
 * los formularios llevan `print:hidden` y lo que queda —el plano y el reparto—
 * se lee sobre fondo blanco: las mesas se dibujan con borde y texto, nunca sólo
 * con color de fondo, que las impresoras no pintan.
 *
 * UN LECTOR VE PERO NO CREA: la protección de verdad es RLS; esto es no ofrecer
 * un formulario que va a fallar al enviarlo.
 */

export interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

function nombreDeLaForma(forma: FormaMesa): string {
  return t(`panel.mesas.formas.${forma}` as "panel.mesas.formas.redonda");
}

function nombreDelMenu(tipo: string): string {
  return t(`panel.menus.${tipo}` as "panel.menus.estandar");
}

/** Cuánta gente hay sentada en cada mesa, para pintar «3 de 8» sin recontar. */
export function ocupacionDe(mesa: Mesa, sentados: number): string {
  return sentados > mesa.capacidad
    ? t("panel.mesas.ocupacionPasada", { sentados, capacidad: mesa.capacidad })
    : t("panel.mesas.ocupacion", { sentados, capacidad: mesa.capacidad });
}

/** El identificador del bloque de una mesa, para saltar a él desde el plano. */
export function anclaDe(mesa: Mesa): string {
  return anclaDeMesa(mesa.id);
}

/** El bloque de una mesa en «Mesa a mesa», desde otra vista. */
function enlaceAlBloque(mesa: Mesa): string {
  return `${RUTA_MESAS_REPARTO}#${anclaDe(mesa)}`;
}

/** La mesa elegida en el plano: sus flechas y su gente, debajo del lienzo. */
function enlaceAlPlano(mesa: Mesa): string {
  return `${RUTA_MESAS_PLANO}?mesa=${mesa.id}#${ANCLA_PLANO}`;
}

const listaDeNombres = new Intl.ListFormat(IDIOMA, { type: "conjunction" });

/** Los estados que vuelven a una mesa con algo que decir de sus datos. */
export const ESTADOS_DE_SUS_DATOS = new Set([
  "nombre",
  "nombre-repetido",
  "capacidad",
  "forma",
  "posicion",
  "presidencia-repetida",
  "editada-pasada",
  "error",
]);

/**
 * LA VERSALITA DE ESTA PANTALLA, Y POR QUÉ NO ES `<Etiqueta>`.
 *
 * `Etiqueta` viste el rótulo con `text-tinta-tenue`, que sobre el fondo claro
 * se queda en 3,6:1 — por debajo del 4,5:1 que exige AA para texto pequeño, y
 * esto es una pantalla que se mira impresa y a contraluz el día de la boda.
 * Aquí el mismo rótulo va en `text-tinta-suave`, que sí llega.
 *
 * No se «arregla» pasándole una clase a `Etiqueta`: dos utilidades de color con
 * la misma especificidad se resuelven por el orden del CSS generado, no por el
 * del atributo, así que el arreglo funcionaría o no según cómo ordenase
 * Tailwind ese día. Cuando toque, se corrige el componente compartido.
 */
function Rotulo({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`block text-etiqueta uppercase tracking-etiqueta ${className}`}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Lo que comparten las tres vistas                                          */
/* -------------------------------------------------------------------------- */

/**
 * EL AVISO DE LA ÚLTIMA ACCIÓN, Y EL SITIO DONDE VA.
 *
 * Va donde vuelve la pantalla: en la bolsa, en el bloque de la mesa o bajo el
 * plano, según de dónde salió la acción. Arriba sólo si no se sabe, o si el
 * sitio ya no existe (la mesa se borró). Cada vista dice qué sitios tiene.
 */
export function avisoDeLaAccion(
  consulta: Record<string, string | string[] | undefined>,
  mesas: Mesa[],
  sitios: readonly string[],
) {
  // El aviso viaja con el `id` de la mesa; el nombre se resuelve aquí contra lo
  // que acaba de leerse, así que nunca enseña un nombre viejo.
  const mesa = mesas.find((candidata) => candidata.id === soloTexto(consulta.mesa));
  const estado = soloTexto(consulta.estado);
  const pedida = soloTexto(consulta.ancla);
  const ancla = esAnclaDeMesas(pedida) && sitios.includes(pedida) ? pedida : null;
  const aviso = (
    <AvisoMesas
      estado={estado}
      detalle={{
        mesa: mesa?.nombre ?? "",
        caben: soloTexto(consulta.caben),
        habria: soloTexto(consulta.habria),
        cuantos: soloTexto(consulta.cuantos),
      }}
    />
  );

  return {
    estado,
    mesa,
    ancla,
    /** El aviso que no tiene sitio propio en esta vista: va arriba. */
    arriba: ancla ? null : aviso,
    /** El aviso, si la acción volvió a este sitio. */
    en: (sitio: string) => (ancla === sitio ? aviso : null),
  };
}

/**
 * SIN MESAS NO HAY NADA QUE REPARTIR. La bolsa enseñaba los nombres sin un solo
 * desplegable y sin decir por qué, y el plano, un lienzo vacío. Se dice, con
 * el camino al alta.
 */
export function SinMesasTodavia() {
  return (
    <p className="mt-elemento max-w-texto rounded-campo border border-borde p-interno text-pequeno text-tinta print:hidden">
      {t("panel.mesas.sinMesasTodavia")}{" "}
      <Link
        href={`${RUTA_MESAS_REPARTO}#${ANCLA_NUEVA}`}
        prefetch={false}
        className="text-tinta-marca underline decoration-borde-marca underline-offset-4"
      >
        {t("panel.mesas.crearPrimera")}
      </Link>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/*  BODA-84 · La bolsa de quien todavía no tiene sitio                        */
/* -------------------------------------------------------------------------- */

export function SinSentar({
  id,
  aviso,
  todos,
  titulo,
  ayuda,
  vacio,
  grupos,
  mesas,
  sentadosPorMesa,
  puedeEditar,
}: {
  /** El ancla de la bolsa: a ella vuelven sus formularios. */
  id: string;
  aviso: ReactNode;
  /** Toda la gente, para decir quién más se mueve al sentar a un grupo. */
  todos: Comensal[];
  titulo: string;
  ayuda: string;
  vacio: string;
  grupos: GrupoSinSentar[];
  mesas: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
  puedeEditar: boolean;
}) {
  const personas = grupos.reduce((total, grupo) => total + grupo.personas.length, 0);

  /*
    SENTAR AL GRUPO ENTERO MUEVE A TODO EL GRUPO, también a quien ya estaba en
    otra mesa. La fila enseñaba «1 persona» y movía a tres: se nombra a los que
    cambian de sitio, con la mesa de la que salen.
  */
  const nombreDeMesa = new Map(mesas.map((mesa) => [mesa.id, mesa.nombre]));
  const seMuevenDe = (grupoId: string) =>
    todos
      .filter(
        (persona) =>
          persona.grupoId === grupoId && persona.mesaId && persona.estado !== ESTADO_RECHAZADO,
      )
      .map((persona) =>
        t("panel.mesas.seMueveDe", {
          quien: persona.nombreCompleto,
          mesa: nombreDeMesa.get(persona.mesaId!) ?? "",
        }),
      );

  return (
    <section
      id={id}
      className="mt-bloque scroll-mt-elemento rounded-tarjeta border border-borde-fuerte p-interno"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <Titulo3 como="h2">{titulo}</Titulo3>
        {personas > 0 ? (
          <EtiquetaEstado variante="aviso" tamano="compacta" className="px-interno">
            {personas === 1
              ? t("panel.mesas.grupoPersonasUna")
              : t("panel.mesas.grupoPersonas", { cuantas: personas })}
          </EtiquetaEstado>
        ) : null}
      </div>

      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">{ayuda}</Cuerpo>

      {aviso}

      {grupos.length === 0 ? (
        <p className="mt-elemento rounded-campo bg-exito-fondo p-interno text-pequeno text-exito-tinta">
          {vacio}
        </p>
      ) : (
        <ul className="mt-elemento grid gap-elemento">
          {grupos.map((grupo) => (
            <li
              key={grupo.id}
              className="@container rounded-campo border border-borde px-interno py-interno-compacto"
            >
              {/*
                UNA FILA POR GRUPO Y OTRA POR PERSONA, con el desplegable al
                lado del nombre. Antes cada persona llevaba encima su rótulo
                «Mesa de …» y debajo un desplegable a todo lo ancho: con
                noventa invitados la pantalla medía treinta mil píxeles. El
                rótulo sigue ahí para el lector de pantalla; a la vista ya lo
                dice el nombre que tiene al lado.
              */}
              <div className={FILA_GRUPO}>
                <div className="flex flex-wrap items-baseline gap-x-interno gap-y-linea">
                  <span className="text-cuerpo text-tinta">{grupo.nombre}</span>
                  <Rotulo className="text-tinta-suave">
                    {grupo.personas.length === 1
                      ? t("panel.mesas.grupoPersonasUna")
                      : t("panel.mesas.grupoPersonas", { cuantas: grupo.personas.length })}
                  </Rotulo>
                </div>

                {/*
                SENTAR AL GRUPO ENTERO ES EL BOTÓN QUE DE VERDAD SE USA, y por
                eso va el primero y con el desplegable propio. Colocar a una
                familia de cinco de uno en uno son cinco viajes en los que es
                facilísimo dejarse a la abuela en otra mesa.
              */}
                {puedeEditar && mesas.length > 0 ? (
                  <div className="@container print:hidden">
                    <form
                      action={sentarGrupo}
                      className="grid items-center gap-interno-compacto formulario-en-linea:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <input type="hidden" name="grupo_id" value={grupo.id} />
                      <input type="hidden" name="ancla" value={id} />
                      <SelectorDeMesa
                        etiqueta={t("panel.mesas.campoMesaGrupo", { grupo: grupo.nombre })}
                        mesas={mesas}
                        sentadosPorMesa={sentadosPorMesa}
                      />
                      <BotonEnvio jerarquia="secundario">
                        {t("panel.mesas.sentarGrupo")}
                      </BotonEnvio>
                    </form>
                  </div>
                ) : null}
              </div>

              {puedeEditar && seMuevenDe(grupo.id).length > 0 ? (
                <p className="mt-pila text-pequeno text-tinta-suave print:hidden">
                  {t("panel.mesas.tambienSeMueven", {
                    quienes: listaDeNombres.format(seMuevenDe(grupo.id)),
                  })}
                </p>
              ) : null}

              <ul className="mt-interno-compacto grid">
                {grupo.personas.map((persona) => (
                  <li
                    key={persona.id}
                    className={`${FILA_REPARTO} border-t border-borde-tenue py-interno-compacto`}
                  >
                    <div className="flex flex-wrap items-baseline gap-interno-compacto">
                      <span className="text-pequeno text-tinta">{persona.nombreCompleto}</span>
                      <span className="text-pequeno text-tinta-suave">
                        {nombreDelMenu(persona.tipoMenu)}
                      </span>
                      {persona.esNino ? (
                        <span className="text-pequeno text-tinta-suave">
                          {t("panel.mesas.esNino")}
                        </span>
                      ) : null}
                    </div>

                    {puedeEditar && mesas.length > 0 ? (
                      <form
                        action={sentarInvitado}
                        className="flex items-center gap-interno-compacto print:hidden"
                      >
                        <input type="hidden" name="invitado_id" value={persona.id} />
                        <input type="hidden" name="ancla" value={id} />
                        <SelectorDeMesa
                          etiqueta={t("panel.mesas.campoMesaDe", {
                            quien: persona.nombreCompleto,
                          })}
                          mesas={mesas}
                          sentadosPorMesa={sentadosPorMesa}
                        />
                        <BotonEnvio jerarquia="terciario">{t("panel.mesas.sentar")}</BotonEnvio>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * El desplegable de mesas, con su ocupación dentro de cada opción.
 *
 * Enseñar «Mesa 4 — 6 de 8» en la propia opción evita el viaje de ida y vuelta
 * a mirar dónde queda hueco. Sin eso, elegir mesa es adivinar y esperar a que
 * la acción diga que no cabe.
 */
function SelectorDeMesa({
  etiqueta,
  mesas,
  sentadosPorMesa,
  actual,
  conSinMesa = false,
}: {
  etiqueta: string;
  mesas: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
  actual?: string;
  conSinMesa?: boolean;
}) {
  return (
    <CampoSeleccion
      etiqueta={etiqueta}
      etiquetaOculta
      // En la fila, el desplegable se queda con lo que no ocupa el botón.
      className="min-w-0 flex-1"
      name="mesa_id"
      defaultValue={actual ?? ""}
    >
      <option value="">
        {conSinMesa ? t("panel.mesas.opcionSinMesa") : t("panel.mesas.opcionElegirMesa")}
      </option>
      {mesas.map((mesa) => (
        <option key={mesa.id} value={mesa.id}>
          {t("panel.mesas.opcionMesa", {
            mesa: mesa.nombre,
            sentados: sillasOcupadas(sentadosPorMesa.get(mesa.id) ?? []),
            capacidad: mesa.capacidad,
          })}
        </option>
      ))}
    </CampoSeleccion>
  );
}

/**
 * La fila del reparto: quién a la izquierda y su desplegable a la derecha
 * cuando caben en la TARJETA —no en la pantalla—, y uno debajo de otro cuando
 * no. Ver `reparto-en-linea` en globals.css: con `sm:` la tableta dejaba los
 * desplegables en 30 px. La tarjeta que la contiene lleva `@container`.
 *
 * MITAD Y MITAD, y no tres quintos para el nombre: con dos quintos, el
 * formulario de «Mesa a mesa» no llegaba a `formulario-en-linea` ni en un
 * escritorio ancho, y cada persona eran dos filas —el desplegable y, debajo,
 * «Cambiar de mesa»—. Un nombre con su menú cabe de sobra en la mitad.
 */
const FILA_REPARTO =
  "grid gap-interno-compacto reparto-en-linea:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] reparto-en-linea:items-center";

/** La del grupo pide más: su botón es «Sentar al grupo entero». */
const FILA_GRUPO =
  "grid gap-interno-compacto grupo-en-linea:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] grupo-en-linea:items-center";

/**
 * La vista de alergias no trae el id de la persona, y dos con el mismo nombre
 * y la misma alergia en una mesa —padre e hijo, los dos Hugo, los dos sin
 * lactosa— repetían la clave: React avisaba y podía pintar una de las dos
 * filas encima de la otra. La posición en la lista las separa.
 */
function claveDeAlergia(fila: AlergiaEnMesa, indice: number): string {
  return `${indice}-${fila.nombre}-${fila.apellidos ?? ""}`;
}

/* -------------------------------------------------------------------------- */
/*  BODA-83 · El plano                                                        */
/* -------------------------------------------------------------------------- */

/**
 * EL LIENZO.
 *
 * Las coordenadas de la base van de 0 a `LADO_PLANO_MESAS` y aquí se convierten
 * a porcentaje, así que el mismo plano vale en un móvil, en un portátil y en el
 * proyector de la finca sin guardar un solo píxel en la base.
 *
 * La proporción sale del token `aspect-mapa`: esto es, literalmente, el mapa de
 * la sala. Los rótulos de cada mesa se dimensionan por su contenido y no en
 * porcentaje, así que la proporción del lienzo no los deforma.
 */
export function Plano({
  mesas,
  sinColocar,
  sentadosPorMesa,
  aviso,
  elegida,
  recienMovida,
  puedeEditar,
}: {
  mesas: Mesa[];
  sinColocar: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
  aviso: ReactNode;
  /** La mesa tocada en el plano, o la que se acaba de colocar o empujar. */
  elegida: Mesa | undefined;
  /** Si la elegida viene de moverse: sus flechas dicen «seguir moviendo». */
  recienMovida: boolean;
  puedeEditar: boolean;
}) {
  return (
    <section id={ANCLA_PLANO} className="scroll-mt-elemento">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.mesas.planoTitulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.mesas.planoAyuda")}</Cuerpo>
      </header>

      {aviso}

      {/*
        `overflow-hidden` no es cosmético: el rótulo de una mesa se centra sobre
        su punto, así que una colocada en el borde asoma por fuera del lienzo.
        Sin recortar, ese trozo empuja el ancho de la página y aparece una barra
        de desplazamiento horizontal en el móvil. Recortado, medio rótulo
        asomando dice justo lo que pasa: esa mesa está pegada a la pared.
      */}
      <div className="relative mt-elemento aspect-plano w-full max-w-plano overflow-hidden rounded-tarjeta border border-borde-fuerte bg-superficie-hundida">
        {/*
          LA PISTA DE BAILE ES UNA REFERENCIA FIJA, no una mesa: no se mueve, no
          se guarda y no se puede tocar. Está para que el plano signifique algo
          —«esta mesa queda pegada a los altavoces»— porque un rectángulo con
          ocho círculos sueltos no dice dónde está nada.

          Va centrada con `flex` sobre una capa a `inset-0` en vez de con
          coordenadas: así no compite con las mesas por el sistema de posiciones
          ni se descoloca al cambiar el tamaño del lienzo.
        */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-campo border border-dashed border-borde-fuerte px-elemento py-interno text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
            {t("panel.mesas.pistaDeBaile")}
          </span>
        </div>

        {mesas.length === 0 ? (
          <p className="absolute inset-0 flex items-end justify-center p-interno text-pequeno text-tinta-suave">
            {t("panel.mesas.planoVacio")}
          </p>
        ) : (
          <ul className="absolute inset-0">
            {mesas.map((mesa) => (
              <MesaEnElPlano
                key={mesa.id}
                mesa={mesa}
                sentados={sillasOcupadas(sentadosPorMesa.get(mesa.id) ?? [])}
                elegida={mesa.id === elegida?.id}
              />
            ))}
          </ul>
        )}
      </div>

      {/*
        LA MESA ELEGIDA, JUNTO AL PLANO: sus flechas y su gente. Las flechas
        vivían sólo en su bloque, a miles de píxeles: cada empujón volvía a la
        cabecera y nunca se veían a la vez la mesa y el botón que la mueve.
      */}
      {elegida ? (
        <MesaElegida
          mesa={elegida}
          sentados={sentadosPorMesa.get(elegida.id) ?? []}
          recienMovida={recienMovida}
          puedeEditar={puedeEditar}
        />
      ) : null}

      {sinColocar.length > 0 ? (
        <div className="mt-elemento max-w-plano rounded-campo border border-borde p-interno print:hidden">
          <Rotulo className="text-tinta-suave">{t("panel.mesas.sinColocarTitulo")}</Rotulo>
          <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
            {t("panel.mesas.sinColocarAyuda")}
          </Cuerpo>
          {/*
            CADA UNA SE COLOCA DESDE AQUÍ. Antes cada nombre era un salto a su
            bloque, miles de píxeles más abajo, porque el botón vivía allí: el
            paso que sobraba. El nombre sigue llevando a su bloque, para ver
            quién se sienta.
          */}
          <ul className="mt-interno-compacto grid">
            {sinColocar.map((mesa) => (
              <li
                key={mesa.id}
                className="flex flex-wrap items-center justify-between gap-interno border-t border-borde-tenue py-linea"
              >
                <Link
                  href={enlaceAlBloque(mesa)}
                  prefetch={false}
                  className="text-pequeno text-tinta underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
                >
                  {mesa.nombre}
                </Link>
                {puedeEditar ? (
                  <form action={colocarMesa}>
                    <input type="hidden" name="id" value={mesa.id} />
                    <input type="hidden" name="ancla" value={ANCLA_PLANO} />
                    {/* «Colocar» a secas sería el mismo nombre en cada fila. */}
                    <BotonEnvio
                      jerarquia="terciario"
                      aria-label={t("panel.mesas.colocarDe", { mesa: mesa.nombre })}
                    >
                      {t("panel.mesas.colocarCorto")}
                    </BotonEnvio>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/**
 * LO QUE SE VE DE LA MESA ELEGIDA: cuántos caben, quién se sienta, sus flechas
 * y el camino a su bloque para cambiar a la gente. Tocar una mesa del plano
 * llevaba a ese bloque, en otra parte de la pantalla, y para volver a moverla
 * había que regresar; ahora se elige aquí y se mueve aquí.
 */
function MesaElegida({
  mesa,
  sentados,
  recienMovida,
  puedeEditar,
}: {
  mesa: Mesa;
  sentados: Comensal[];
  recienMovida: boolean;
  puedeEditar: boolean;
}) {
  // Quien ha dicho que no viene no ocupa silla, y tampoco se le nombra aquí.
  const ocupan = sentados.filter((persona) => persona.estado !== ESTADO_RECHAZADO);

  return (
    <div className="mt-elemento max-w-plano rounded-tarjeta border border-borde-marca p-interno print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <Titulo3 como="h2">{mesa.nombre}</Titulo3>
        <span className="text-pequeno text-tinta">
          {ocupacionDe(mesa, sillasOcupadas(sentados))}
        </span>
      </div>
      <p className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {ocupan.length > 0
          ? t("panel.mesas.seSientan", {
              quienes: listaDeNombres.format(ocupan.map((persona) => persona.nombreCompleto)),
            })
          : t("panel.mesas.mesaVacia")}
      </p>

      {puedeEditar ? (
        <div className="mt-elemento">
          <Empujar
            mesa={mesa}
            rotulo={
              recienMovida
                ? t("panel.mesas.seguirMoviendo", { mesa: mesa.nombre })
                : t("panel.mesas.moverMesa", { mesa: mesa.nombre })
            }
          />
        </div>
      ) : null}

      <Link
        href={enlaceAlBloque(mesa)}
        prefetch={false}
        className="mt-elemento inline-flex min-h-control-compacto items-center text-pequeno text-tinta-marca underline decoration-borde-marca underline-offset-4"
      >
        {t("panel.mesas.verEnElReparto")}
      </Link>
    </div>
  );
}

function MesaEnElPlano({
  mesa,
  sentados,
  elegida,
}: {
  mesa: Mesa;
  sentados: number;
  elegida: boolean;
}) {
  const presidencia = mesa.forma === FORMA_PRESIDENCIA;
  const redondeo =
    mesa.forma === "redonda" || mesa.forma === "ovalada" ? "rounded-etiqueta" : "rounded-campo";

  return (
    <li
      className="absolute"
      style={{
        left: `${((mesa.posicionX ?? 0) / LADO_PLANO_MESAS) * 100}%`,
        top: `${((mesa.posicionY ?? 0) / LADO_PLANO_MESAS) * 100}%`,
        /*
          El rótulo se centra sobre SU punto, y la mitad que hay que descontar
          es la suya propia —no una medida del sistema de diseño—: depende de lo
          largo que sea el nombre de la mesa. Ningún token puede expresar eso,
          y por eso el 50 % va aquí y no en una clase.
        */
        transform: "translate(-50%, -50%)",
      }}
    >
      <Link
        href={enlaceAlPlano(mesa)}
        prefetch={false}
        // La elegida se marca con su borde y su fondo, y para un lector de
        // pantalla con `aria-current`: un color no lo lee nadie más.
        aria-current={elegida ? "true" : undefined}
        /*
          `whitespace-nowrap`: un elemento posicionado se encoge hasta lo que
          quede de lienzo a su derecha, así que sin esto una mesa colocada a la
          derecha del todo partía su nombre letra a letra en una columna
          altísima. El rótulo se mantiene en una línea y, si asoma, lo recorta
          el lienzo — que es lo que dice la verdad: está pegada a la pared.
        */
        className={`flex flex-col items-center whitespace-nowrap border px-interno-compacto py-linea text-center transicion-color hover:border-borde-marca ${redondeo} ${
          presidencia || elegida ? "border-borde-marca" : "border-borde-fuerte"
        } ${elegida ? "bg-marca-tenue" : "bg-superficie"}`}
      >
        <span className={`text-pequeno ${presidencia ? "text-tinta-marca" : "text-tinta"}`}>
          {mesa.nombre}
        </span>
        <span className="text-diminuto text-tinta-suave">{ocupacionDe(mesa, sentados)}</span>
        {/*
          La presidencia se distingue por su rótulo y no sólo por el color del
          borde: un color no lo lee un daltónico, ni un lector de pantalla, ni
          nadie mirando esto impreso en blanco y negro.
        */}
        {presidencia ? (
          <span className="text-diminuto uppercase tracking-etiqueta text-tinta-marca">
            {t("panel.mesas.presidencia")}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  El reparto, mesa a mesa                                                   */
/* -------------------------------------------------------------------------- */

export function BloqueMesa({
  mesa,
  sentados,
  alergias,
  mesas,
  sentadosPorMesa,
  puedeEditar,
  aviso,
  confirmandoBorrado,
  datosAbiertos,
}: {
  mesa: Mesa;
  sentados: Comensal[];
  alergias: AlergiaEnMesa[];
  mesas: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
  puedeEditar: boolean;
  /** El aviso de la acción que acaba de volver a esta mesa. */
  aviso: ReactNode;
  confirmandoBorrado: boolean;
  datosAbiertos: boolean;
}) {
  const presidencia = mesa.forma === FORMA_PRESIDENCIA;

  return (
    // `break-inside-avoid`: en papel, la gente de una mesa no se parte entre
    // dos hojas. Media mesa al final de una página es media mesa que nadie lee.
    <section
      id={anclaDe(mesa)}
      className="@container scroll-mt-elemento break-inside-avoid rounded-tarjeta border border-borde p-interno"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-interno-compacto">
        <Titulo3>{mesa.nombre}</Titulo3>
        <div className="flex flex-wrap items-baseline gap-interno text-pequeno text-tinta-suave">
          <span>{nombreDeLaForma(mesa.forma)}</span>
          {presidencia ? (
            <span className="text-tinta-marca">{t("panel.mesas.presidencia")}</span>
          ) : null}
          {/*
            Pasarse de capacidad es un aviso, y por eso ahí —y sólo ahí— la
            ocupación se pinta como etiqueta. Dentro de capacidad es un dato
            más de la fila y sigue siendo texto suelto: ponerle píldora a todo
            dejaría de distinguir lo que hay que mirar.
          */}
          {sillasOcupadas(sentados) > mesa.capacidad ? (
            <EtiquetaEstado variante="aviso" tamano="compacta" className="px-interno">
              {ocupacionDe(mesa, sillasOcupadas(sentados))}
            </EtiquetaEstado>
          ) : (
            <span className="text-tinta">{ocupacionDe(mesa, sillasOcupadas(sentados))}</span>
          )}
        </div>
      </div>

      {mesa.notas ? (
        <p className="mt-pila max-w-texto text-pequeno text-tinta-suave">{mesa.notas}</p>
      ) : null}

      {aviso}

      {sentados.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.mesas.mesaVacia")}
        </Cuerpo>
      ) : (
        <ul className="mt-interno-compacto grid">
          {sentados.map((persona) => (
            <li
              key={persona.id}
              className={`${FILA_REPARTO} border-b border-borde-tenue py-interno-compacto`}
            >
              <div className="flex flex-wrap items-baseline gap-interno-compacto">
                <span className="text-cuerpo text-tinta">{persona.nombreCompleto}</span>
                <span className="text-pequeno text-tinta-suave">
                  {nombreDelMenu(persona.tipoMenu)}
                </span>
                {persona.esNino ? (
                  <span className="text-pequeno text-tinta-suave">
                    {t("panel.mesas.esNino")}
                  </span>
                ) : null}
                {/*
                  TRES ESTADOS, NO DOS. Quien dijo que no salía como «Sin
                  contestar», la misma etiqueta que quien todavía no ha
                  respondido, mientras la hoja exportada decía «No viene».
                */}
                {persona.estado === ESTADO_RECHAZADO ? (
                  <EtiquetaEstado variante="error" tamano="compacta" className="px-interno">
                    {t("panel.mesas.noViene")}
                  </EtiquetaEstado>
                ) : persona.estado !== ESTADO_CONFIRMADO ? (
                  <EtiquetaEstado variante="aviso" tamano="compacta" className="px-interno">
                    {t("panel.invitados.pendienteRespuesta")}
                  </EtiquetaEstado>
                ) : null}
              </div>

              {/* Cambiar de mesa y levantarse salen del mismo desplegable: son
                  la misma decisión, y separarlas obligaría a dos viajes. */}
              {puedeEditar ? (
                <div className="@container print:hidden">
                  <form
                    action={sentarInvitado}
                    className="grid items-center gap-interno-compacto formulario-en-linea:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <input type="hidden" name="invitado_id" value={persona.id} />
                    <input type="hidden" name="ancla" value={anclaDe(mesa)} />
                    <SelectorDeMesa
                      etiqueta={t("panel.mesas.campoMesaDe", { quien: persona.nombreCompleto })}
                      mesas={mesas}
                      sentadosPorMesa={sentadosPorMesa}
                      actual={mesa.id}
                      conSinMesa
                    />
                    {/* «Sentar» sería raro sobre alguien que ya está sentado: lo
                        que se hace aquí es cambiarle de sitio o levantarle. */}
                    <BotonEnvio jerarquia="terciario" className="justify-self-start">
                      {t("panel.mesas.mover")}
                    </BotonEnvio>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {alergias.length > 0 ? (
        <div className="mt-elemento rounded-campo bg-aviso-fondo p-interno">
          <Rotulo className="text-aviso-tinta">{t("panel.mesas.alergiasTitulo")}</Rotulo>
          <ul className="mt-pila grid gap-linea">
            {alergias.map((fila, indice) => (
              <li key={claveDeAlergia(fila, indice)} className="text-pequeno text-aviso-tinta">
                {t("panel.mesas.alergiaDe", {
                  quien: [fila.nombre, fila.apellidos].filter(Boolean).join(" "),
                  alergias: fila.alergias,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {puedeEditar ? (
        <FormularioMesa
          mesa={mesa}
          confirmandoBorrado={confirmandoBorrado}
          abierto={datosAbiertos}
        />
      ) : null}
    </section>
  );
}

/**
 * SALTAR A UNA MESA. «Mesa a mesa» sigue siendo larga —doce mesas con su gente
 * son doce bloques— y el plano, que hacía de índice, está en otra pestaña.
 * Cada mesa con su ocupación, para ir derecho a la que tiene hueco, y el alta
 * al final, que sin esto quedaba debajo de todas.
 */
export function IrAUnaMesa({
  mesas,
  sentadosPorMesa,
  conAlta,
}: {
  mesas: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
  conAlta: boolean;
}) {
  const ficha =
    "inline-flex min-h-control-compacto items-center rounded-etiqueta border border-borde px-interno text-pequeno transicion-color hover:border-borde-marca";

  return (
    <nav aria-label={t("panel.mesas.irAMesa")} className="mt-elemento print:hidden">
      <ul className="flex flex-wrap gap-interno-compacto">
        {mesas.map((mesa) => (
          <li key={mesa.id}>
            <a href={`#${anclaDe(mesa)}`} className={`${ficha} text-tinta`}>
              {t("panel.mesas.indiceConCuenta", {
                titulo: mesa.nombre,
                cuantas: ocupacionDe(mesa, sillasOcupadas(sentadosPorMesa.get(mesa.id) ?? [])),
              })}
            </a>
          </li>
        ))}
        {conAlta ? (
          <li>
            <a href={`#${ANCLA_NUEVA}`} className={`${ficha} text-tinta-marca`}>
              {t("panel.mesas.nuevaTitulo")}
            </a>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

/**
 * Las alergias de quien todavía no está sentado.
 *
 * Es la fila más importante de `v_alergias_por_mesa` y por eso tiene su propio
 * bloque: recuerda que falta colocar a alguien de quien hay que avisar a la
 * cocina. Escondida entre las mesas se pierde justo mientras el reparto está a
 * medias, que es cuando se mira esta pantalla.
 */
export function AlergiasSinMesa({ alergias }: { alergias: AlergiaEnMesa[] }) {
  if (alergias.length === 0) return null;

  return (
    <div className="mt-elemento rounded-campo bg-aviso-fondo p-interno">
      <Rotulo className="text-aviso-tinta">{t("panel.mesas.alergiasSinMesaTitulo")}</Rotulo>
      <ul className="mt-pila grid gap-linea">
        {alergias.map((fila, indice) => (
          <li key={claveDeAlergia(fila, indice)} className="text-pequeno text-aviso-tinta">
            {t("panel.mesas.alergiaDe", {
              quien: [fila.nombre, fila.apellidos].filter(Boolean).join(" "),
              alergias: fila.alergias,
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Formularios de mesa                                                       */
/* -------------------------------------------------------------------------- */

function FormularioMesa({
  mesa,
  confirmandoBorrado,
  abierto,
}: {
  mesa: Mesa;
  confirmandoBorrado: boolean;
  abierto: boolean;
}) {
  const colocada = mesa.posicionX !== null && mesa.posicionY !== null;

  return (
    <div className="mt-elemento border-t border-borde pt-interno print:hidden">
      {/*
        LOS DATOS DE LA MESA VAN PLEGADOS. Se escriben una vez y se miran
        pocas: abiertos en cada mesa eran seis campos por doce mesas entre
        quien se sienta dónde, que es lo que se viene a hacer aquí. Se abren
        solos cuando la acción vuelve con algo que decir de esta mesa.
      */}
      <details open={abierto}>
        <summary
          aria-label={t("panel.mesas.editarDe", { mesa: mesa.nombre })}
          className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-suave underline decoration-borde-fuerte underline-offset-4 transicion-color hover:text-tinta hover:decoration-borde-marca"
        >
          {t("panel.mesas.editarTitulo")}
        </summary>

        <form
          action={editarMesa}
          className="mt-interno-compacto grid gap-interno sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={mesa.id} />

          <CampoTexto
            etiqueta={t("panel.mesas.campoNombre")}
            name="nombre"
            type="text"
            required
            maxLength={LARGOS_DE_CAMPO["mesas.nombre"]}
            defaultValue={mesa.nombre}
          />
          <CampoTexto
            etiqueta={t("panel.mesas.campoCapacidad")}
            ayuda={t("panel.mesas.campoCapacidadAyuda", {
              minima: CAPACIDAD_MINIMA_MESA,
              maxima: CAPACIDAD_MAXIMA_MESA,
            })}
            name="capacidad"
            type="number"
            required
            min={CAPACIDAD_MINIMA_MESA}
            max={CAPACIDAD_MAXIMA_MESA}
            step={1}
            defaultValue={mesa.capacidad}
          />
          <CampoSeleccion
            etiqueta={t("panel.mesas.campoForma")}
            ayuda={t("panel.mesas.campoFormaAyuda")}
            name="forma"
            defaultValue={mesa.forma}
          >
            {FORMAS_MESA.map((forma) => (
              <option key={forma} value={forma}>
                {nombreDeLaForma(forma)}
              </option>
            ))}
          </CampoSeleccion>

          {/*
          LAS COORDENADAS SE PUEDEN ESCRIBIR, y no sólo empujar. Colocar doce
          mesas en dos filas rectas a base de flechas es media hora; escribiendo
          el mismo número en la vertical de las seis de arriba, un minuto.
        */}
          <CampoTexto
            etiqueta={t("panel.mesas.campoPosicionX")}
            ayuda={t("panel.mesas.campoPosicionXAyuda", { lado: LADO_PLANO_MESAS })}
            name="posicion_x"
            type="number"
            min={0}
            max={LADO_PLANO_MESAS}
            defaultValue={mesa.posicionX ?? ""}
          />
          <CampoTexto
            etiqueta={t("panel.mesas.campoPosicionY")}
            ayuda={t("panel.mesas.campoPosicionYAyuda", { lado: LADO_PLANO_MESAS })}
            name="posicion_y"
            type="number"
            min={0}
            max={LADO_PLANO_MESAS}
            defaultValue={mesa.posicionY ?? ""}
          />

          <div className="sm:col-span-2">
            <CampoTextoLargo
              etiqueta={t("panel.mesas.campoNotas")}
              ayuda={t("panel.mesas.campoNotasAyuda")}
              name="notas"
              rows={2}
              maxLength={LARGOS_DE_CAMPO["mesas.notas"]}
              defaultValue={mesa.notas ?? ""}
            />
          </div>

          <div className="sm:col-span-2">
            <BotonEnvio jerarquia="secundario">{t("panel.mesas.guardar")}</BotonEnvio>
          </div>
        </form>
      </details>

      <div className="mt-elemento flex flex-wrap items-end gap-interno">
        {/*
          MOVERLA SE HACE EN EL PLANO, que es donde se ve moverse. Cuatro
          flechas en cada bloque eran cuarenta y ocho botones entre la gente, y
          cada empujón mandaba al plano igualmente.
        */}
        {colocada ? (
          <BotonEnlace href={enlaceAlPlano(mesa)} prefetch={false} jerarquia="secundario">
            {t("panel.mesas.moverEnElPlano")}
          </BotonEnlace>
        ) : (
          <form action={colocarMesa}>
            <input type="hidden" name="id" value={mesa.id} />
            <BotonEnvio jerarquia="secundario">{t("panel.mesas.colocar")}</BotonEnvio>
          </form>
        )}

        {/*
          BORRAR EN DOS PASOS. El primer envío no borra: vuelve con el aviso y
          con cuánta gente se quedaría de pie, y entonces —y sólo entonces—
          aparece el botón que trae la confirmación dentro.
        */}
        <form action={borrarMesa}>
          <input type="hidden" name="id" value={mesa.id} />
          {confirmandoBorrado ? <input type="hidden" name="confirmar" value="si" /> : null}
          <BotonEnvio jerarquia="terciario">
            {confirmandoBorrado ? t("panel.mesas.confirmarBorrado") : t("panel.mesas.borrar")}
          </BotonEnvio>
        </form>
      </div>
    </div>
  );
}

/** Las cuatro flechas. Cada una es un formulario: funcionan sin JavaScript. */
function Empujar({ mesa, rotulo }: { mesa: Mesa; rotulo: string }) {
  const sentidos = [
    {
      sentido: "arriba",
      glifo: t("panel.mesas.flechaArriba"),
      nombre: t("panel.mesas.empujarArriba", { mesa: mesa.nombre }),
    },
    {
      sentido: "abajo",
      glifo: t("panel.mesas.flechaAbajo"),
      nombre: t("panel.mesas.empujarAbajo", { mesa: mesa.nombre }),
    },
    {
      sentido: "izquierda",
      glifo: t("panel.mesas.flechaIzquierda"),
      nombre: t("panel.mesas.empujarIzquierda", { mesa: mesa.nombre }),
    },
    {
      sentido: "derecha",
      glifo: t("panel.mesas.flechaDerecha"),
      nombre: t("panel.mesas.empujarDerecha", { mesa: mesa.nombre }),
    },
  ];

  return (
    <div>
      <Rotulo className="text-tinta-suave">{rotulo}</Rotulo>
      {/*
        EN CUATRO COLUMNAS EN EL MÓVIL: en fila suelta, la cuarta flecha caía
        sola a la línea de abajo, y la que se buscaba nunca estaba en su sitio.
      */}
      <div className="mt-interno-compacto grid grid-cols-4 gap-interno-compacto sm:flex sm:flex-wrap">
        {sentidos.map((flecha) => (
          <form key={flecha.sentido} action={empujarMesa} className="flex">
            <input type="hidden" name="id" value={mesa.id} />
            <input type="hidden" name="sentido" value={flecha.sentido} />
            {/*
              El nombre accesible lleva la mesa dentro —«Subir Mesa 4»— porque
              en una pantalla con doce mesas hay cuarenta y ocho flechas, y
              «Arriba» a secas no dice de cuál.
            */}
            <BotonEnvio
              jerarquia="secundario"
              aria-label={flecha.nombre}
              className="w-full sm:w-auto"
            >
              {flecha.glifo}
            </BotonEnvio>
          </form>
        ))}
      </div>
    </div>
  );
}

export function FormularioNuevaMesa({ aviso }: { aviso: ReactNode }) {
  return (
    <section
      id={ANCLA_NUEVA}
      className="mt-bloque scroll-mt-elemento rounded-tarjeta border border-borde p-interno print:hidden"
    >
      <Titulo3 como="h2">{t("panel.mesas.nuevaTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.mesas.nuevaAyuda")}
      </Cuerpo>

      {aviso}

      <form action={crearMesa} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <CampoTexto
          etiqueta={t("panel.mesas.campoNombre")}
          name="nombre"
          type="text"
          required
          maxLength={LARGOS_DE_CAMPO["mesas.nombre"]}
        />
        <CampoTexto
          etiqueta={t("panel.mesas.campoCapacidad")}
          ayuda={t("panel.mesas.campoCapacidadAyuda", {
            minima: CAPACIDAD_MINIMA_MESA,
            maxima: CAPACIDAD_MAXIMA_MESA,
          })}
          name="capacidad"
          type="number"
          required
          min={CAPACIDAD_MINIMA_MESA}
          max={CAPACIDAD_MAXIMA_MESA}
          step={1}
        />
        <CampoSeleccion
          etiqueta={t("panel.mesas.campoForma")}
          ayuda={t("panel.mesas.campoFormaAyuda")}
          name="forma"
        >
          {FORMAS_MESA.map((forma) => (
            <option key={forma} value={forma}>
              {nombreDeLaForma(forma)}
            </option>
          ))}
        </CampoSeleccion>

        <div className="sm:col-span-2">
          <CampoTextoLargo
            etiqueta={t("panel.mesas.campoNotas")}
            ayuda={t("panel.mesas.campoNotasAyuda")}
            name="notas"
            rows={2}
            maxLength={LARGOS_DE_CAMPO["mesas.notas"]}
          />
        </div>

        <div className="sm:col-span-2">
          <BotonEnvio>{t("panel.mesas.crear")}</BotonEnvio>
        </div>
      </form>
    </section>
  );
}
