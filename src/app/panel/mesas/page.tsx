import { redirect } from "next/navigation";

import type { ReactNode } from "react";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  CAPACIDAD_MAXIMA_MESA,
  CAPACIDAD_MINIMA_MESA,
  LADO_PLANO_MESAS,
  RUTA_ACCESO,
  RUTA_MESAS_EXPORTAR,
} from "@/config/constants";
import {
  agruparAlergias,
  agruparPorGrupo,
  agruparPorMesa,
  ESTADO_CONFIRMADO,
  ESTADO_RECHAZADO,
  FORMAS_MESA,
  FORMA_PRESIDENCIA,
  obtenerAlergiasPorMesa,
  obtenerComensales,
  obtenerMesas,
  type AlergiaEnMesa,
  type Comensal,
  type FormaMesa,
  type GrupoSinSentar,
  type Mesa,
} from "@/lib/bbdd/mesas";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

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

/**
 * BODA-83 (#59) y BODA-84 (#60) · EL PLANO DE LA SALA Y EL REPARTO
 *
 * LA BOLSA DE «TODAVÍA SIN MESA» VA ARRIBA DEL TODO Y NO SE PUEDE IGNORAR. Es
 * la única pregunta que importa mientras se reparte —«¿me queda alguien?»— y en
 * cualquier otro sitio se contesta contando: recorriendo mesa por mesa a ver
 * quién no aparece, buscando precisamente lo que NO está. Aquí está contestada
 * antes de mirar, y cuando no queda nadie lo dice en vez de desaparecer: un
 * bloque que se esfuma no se distingue de un bloque que no ha cargado.
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
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

function nombreDeLaForma(forma: FormaMesa): string {
  return t(`panel.mesas.formas.${forma}` as "panel.mesas.formas.redonda");
}

function nombreDelMenu(tipo: string): string {
  return t(`rsvp.menus.${tipo}` as "rsvp.menus.estandar");
}

/** Cuánta gente hay sentada en cada mesa, para pintar «3 de 8» sin recontar. */
function ocupacionDe(mesa: Mesa, sentados: number): string {
  return sentados > mesa.capacidad
    ? t("panel.mesas.ocupacionPasada", { sentados, capacidad: mesa.capacidad })
    : t("panel.mesas.ocupacion", { sentados, capacidad: mesa.capacidad });
}

/** El identificador del bloque de una mesa, para saltar a él desde el plano. */
function anclaDe(mesa: Mesa): string {
  return `mesa-${mesa.id}`;
}

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

export default async function PaginaMesas({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;

  const [mesas, comensales, alergias] = await Promise.all([
    obtenerMesas(),
    obtenerComensales(),
    obtenerAlergiasPorMesa(),
  ]);

  const puedeEditar = acceso.rol !== "lector";

  const sentadosPorMesa = agruparPorMesa(comensales);
  const alergiasPorMesa = agruparAlergias(alergias);

  const sinMesa = comensales.filter((persona) => !persona.mesaId);
  const confirmadosSinMesa = agruparPorGrupo(
    sinMesa.filter((persona) => persona.estado === ESTADO_CONFIRMADO),
  );
  /*
    Quien ha dicho que no viene NO sale por ninguna parte: no es que le falte
    mesa, es que no hay que ponerle ninguna. Mezclarlo con los que aún no han
    contestado inflaría la lista de pendientes con gente que ya está resuelta.
  */
  const sinRespuestaSinMesa = agruparPorGrupo(
    sinMesa.filter(
      (persona) => persona.estado !== ESTADO_CONFIRMADO && persona.estado !== ESTADO_RECHAZADO,
    ),
  );

  const colocadas = mesas.filter((mesa) => mesa.posicionX !== null && mesa.posicionY !== null);
  const sinColocar = mesas.filter((mesa) => mesa.posicionX === null);

  // El aviso viaja con el `id` de la mesa; el nombre se resuelve aquí contra lo
  // que acaba de leerse, así que nunca enseña un nombre viejo.
  const mesaDelAviso = mesas.find((mesa) => mesa.id === soloTexto(consulta.mesa));

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.mesas.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.mesas.descripcion")}</Cuerpo>
        {/* En papel esta frase sobra: quien lo tiene impreso ya lo sabe. */}
        <p className="mt-pila text-pequeno text-tinta-suave print:hidden">
          {t("panel.mesas.imprimir")}
        </p>
      </header>

      <AvisoMesas
        estado={soloTexto(consulta.estado)}
        detalle={{
          mesa: mesaDelAviso?.nombre ?? "",
          caben: soloTexto(consulta.caben),
          habria: soloTexto(consulta.habria),
          cuantos: soloTexto(consulta.cuantos),
        }}
      />

      <SinSentar
        titulo={t("panel.mesas.sinMesaTitulo")}
        ayuda={t("panel.mesas.sinMesaAyuda")}
        vacio={t("panel.mesas.sinMesaVacio")}
        grupos={confirmadosSinMesa}
        mesas={mesas}
        sentadosPorMesa={sentadosPorMesa}
        puedeEditar={puedeEditar}
      />

      {/*
        Este bloque también se pinta vacío, con su frase. Un bloque que
        desaparece no se distingue de uno que no ha cargado, y aquí eso se lee
        como «no queda nadie sin contestar» — que es justo lo contrario de lo
        que significaría un fallo de lectura.
      */}
      <SinSentar
        titulo={t("panel.mesas.sinRespuestaTitulo")}
        ayuda={t("panel.mesas.sinRespuestaAyuda")}
        vacio={t("panel.mesas.sinRespuestaVacio")}
        grupos={sinRespuestaSinMesa}
        mesas={mesas}
        sentadosPorMesa={sentadosPorMesa}
        puedeEditar={puedeEditar}
      />

      <Plano mesas={colocadas} sinColocar={sinColocar} sentadosPorMesa={sentadosPorMesa} />

      <div className="mt-bloque">
        <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-interno-compacto">
          <Titulo3 como="h2">{t("panel.mesas.repartoTitulo")}</Titulo3>

          {/*
            UN `GET` A UNA RUTA Y NO UN ENLACE DEL ENRUTADOR: el resultado es un
            fichero, no una pantalla, y hace falta que el navegador lo descargue
            con sus cabeceras en vez de que el enrutador intente pintarlo.

            Lo ve también un lector: exportar es leer, y quien puede mirar el
            reparto puede llevárselo a la finca.
          */}
          <form method="get" action={RUTA_MESAS_EXPORTAR} className="print:hidden">
            <Boton type="submit" jerarquia="terciario">
              {t("panel.mesas.exportar")}
            </Boton>
          </form>
        </div>

        <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
          {t("panel.mesas.repartoAyuda")}
        </Cuerpo>

        {mesas.length === 0 ? (
          <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
            {t("panel.mesas.repartoVacio")}
          </Cuerpo>
        ) : (
          <div className="mt-elemento grid gap-bloque">
            {mesas.map((mesa) => (
              <BloqueMesa
                key={mesa.id}
                mesa={mesa}
                sentados={sentadosPorMesa.get(mesa.id) ?? []}
                alergias={alergiasPorMesa.get(mesa.id) ?? []}
                mesas={mesas}
                sentadosPorMesa={sentadosPorMesa}
                puedeEditar={puedeEditar}
                confirmandoBorrado={
                  soloTexto(consulta.estado) === "confirmar-borrado" &&
                  mesaDelAviso?.id === mesa.id
                }
              />
            ))}
          </div>
        )}

        <AlergiasSinMesa alergias={alergiasPorMesa.get(null) ?? []} />
      </div>

      {puedeEditar ? <FormularioNuevaMesa /> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  BODA-84 · La bolsa de quien todavía no tiene sitio                        */
/* -------------------------------------------------------------------------- */

function SinSentar({
  titulo,
  ayuda,
  vacio,
  grupos,
  mesas,
  sentadosPorMesa,
  puedeEditar,
}: {
  titulo: string;
  ayuda: string;
  vacio: string;
  grupos: GrupoSinSentar[];
  mesas: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
  puedeEditar: boolean;
}) {
  const personas = grupos.reduce((total, grupo) => total + grupo.personas.length, 0);

  return (
    <section className="mt-bloque rounded-tarjeta border border-borde-fuerte p-interno">
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <Titulo3 como="h2">{titulo}</Titulo3>
        {personas > 0 ? (
          <span className="rounded-etiqueta bg-aviso-fondo px-interno py-linea text-pequeno text-aviso-tinta">
            {personas === 1
              ? t("panel.mesas.grupoPersonasUna")
              : t("panel.mesas.grupoPersonas", { cuantas: personas })}
          </span>
        ) : null}
      </div>

      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">{ayuda}</Cuerpo>

      {grupos.length === 0 ? (
        <p className="mt-elemento rounded-campo bg-exito-fondo p-interno text-pequeno text-exito-tinta">
          {vacio}
        </p>
      ) : (
        <ul className="mt-elemento grid gap-elemento">
          {grupos.map((grupo) => (
            <li
              key={grupo.id}
              className="rounded-campo border border-borde px-interno py-interno-compacto"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-interno">
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
                <form
                  action={sentarGrupo}
                  className="mt-interno-compacto grid items-end gap-interno-compacto print:hidden sm:grid-cols-[1fr_auto]"
                >
                  <input type="hidden" name="grupo_id" value={grupo.id} />
                  <SelectorDeMesa
                    etiqueta={t("panel.mesas.campoMesaGrupo", { grupo: grupo.nombre })}
                    mesas={mesas}
                    sentadosPorMesa={sentadosPorMesa}
                  />
                  <Boton type="submit" jerarquia="secundario">
                    {t("panel.mesas.sentarGrupo")}
                  </Boton>
                </form>
              ) : null}

              <ul className="mt-interno-compacto grid gap-interno-compacto">
                {grupo.personas.map((persona) => (
                  <li key={persona.id}>
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
                        className="mt-interno-compacto grid items-end gap-interno-compacto print:hidden sm:grid-cols-[1fr_auto]"
                      >
                        <input type="hidden" name="invitado_id" value={persona.id} />
                        <SelectorDeMesa
                          etiqueta={t("panel.mesas.campoMesaDe", {
                            quien: persona.nombreCompleto,
                          })}
                          mesas={mesas}
                          sentadosPorMesa={sentadosPorMesa}
                        />
                        <Boton type="submit" jerarquia="terciario">
                          {t("panel.mesas.sentar")}
                        </Boton>
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
    <CampoSeleccion etiqueta={etiqueta} name="mesa_id" defaultValue={actual ?? ""}>
      <option value="">
        {conSinMesa ? t("panel.mesas.opcionSinMesa") : t("panel.mesas.opcionElegirMesa")}
      </option>
      {mesas.map((mesa) => (
        <option key={mesa.id} value={mesa.id}>
          {t("panel.mesas.opcionMesa", {
            mesa: mesa.nombre,
            sentados: sentadosPorMesa.get(mesa.id)?.length ?? 0,
            capacidad: mesa.capacidad,
          })}
        </option>
      ))}
    </CampoSeleccion>
  );
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
function Plano({
  mesas,
  sinColocar,
  sentadosPorMesa,
}: {
  mesas: Mesa[];
  sinColocar: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
}) {
  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.mesas.planoTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.mesas.planoAyuda")}
      </Cuerpo>

      {/*
        `overflow-hidden` no es cosmético: el rótulo de una mesa se centra sobre
        su punto, así que una colocada en el borde asoma por fuera del lienzo.
        Sin recortar, ese trozo empuja el ancho de la página y aparece una barra
        de desplazamiento horizontal en el móvil. Recortado, medio rótulo
        asomando dice justo lo que pasa: esa mesa está pegada a la pared.
      */}
      <div className="relative mt-elemento aspect-mapa w-full overflow-hidden rounded-tarjeta border border-borde-fuerte bg-superficie-hundida">
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
                sentados={sentadosPorMesa.get(mesa.id)?.length ?? 0}
              />
            ))}
          </ul>
        )}
      </div>

      {sinColocar.length > 0 ? (
        <div className="mt-elemento rounded-campo border border-borde p-interno print:hidden">
          <Rotulo className="text-tinta-suave">{t("panel.mesas.sinColocarTitulo")}</Rotulo>
          <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
            {t("panel.mesas.sinColocarAyuda")}
          </Cuerpo>
          {/*
            Cada nombre es un salto a su bloque, que es donde está el botón de
            colocarla. Una lista de nombres sin salida obligaría a buscarlas a
            mano más abajo, que es justo el paso que sobra.
          */}
          <ul className="mt-interno-compacto flex flex-wrap gap-interno-compacto">
            {sinColocar.map((mesa) => (
              <li key={mesa.id}>
                <a
                  href={`#${anclaDe(mesa)}`}
                  className="inline-block rounded-etiqueta border border-borde px-interno py-linea text-pequeno text-tinta-marca transicion-color hover:border-borde-marca"
                >
                  {mesa.nombre}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function MesaEnElPlano({ mesa, sentados }: { mesa: Mesa; sentados: number }) {
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
      <a
        href={`#${anclaDe(mesa)}`}
        /*
          `whitespace-nowrap`: un elemento posicionado se encoge hasta lo que
          quede de lienzo a su derecha, así que sin esto una mesa colocada a la
          derecha del todo partía su nombre letra a letra en una columna
          altísima. El rótulo se mantiene en una línea y, si asoma, lo recorta
          el lienzo — que es lo que dice la verdad: está pegada a la pared.
        */
        className={`flex flex-col items-center whitespace-nowrap border bg-superficie px-interno-compacto py-linea text-center transicion-color hover:border-borde-marca ${redondeo} ${
          presidencia ? "border-borde-marca" : "border-borde-fuerte"
        }`}
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
      </a>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  El reparto, mesa a mesa                                                   */
/* -------------------------------------------------------------------------- */

function BloqueMesa({
  mesa,
  sentados,
  alergias,
  mesas,
  sentadosPorMesa,
  puedeEditar,
  confirmandoBorrado,
}: {
  mesa: Mesa;
  sentados: Comensal[];
  alergias: AlergiaEnMesa[];
  mesas: Mesa[];
  sentadosPorMesa: Map<string, Comensal[]>;
  puedeEditar: boolean;
  confirmandoBorrado: boolean;
}) {
  const presidencia = mesa.forma === FORMA_PRESIDENCIA;

  return (
    // `break-inside-avoid`: en papel, la gente de una mesa no se parte entre
    // dos hojas. Media mesa al final de una página es media mesa que nadie lee.
    <section
      id={anclaDe(mesa)}
      className="break-inside-avoid rounded-tarjeta border border-borde p-interno"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-interno-compacto">
        <Titulo3>{mesa.nombre}</Titulo3>
        <div className="flex flex-wrap items-baseline gap-interno text-pequeno text-tinta-suave">
          <span>{nombreDeLaForma(mesa.forma)}</span>
          {presidencia ? (
            <span className="text-tinta-marca">{t("panel.mesas.presidencia")}</span>
          ) : null}
          <span
            className={
              sentados.length > mesa.capacidad
                ? "rounded-etiqueta bg-aviso-fondo px-interno py-linea text-aviso-tinta"
                : "text-tinta"
            }
          >
            {ocupacionDe(mesa, sentados.length)}
          </span>
        </div>
      </div>

      {mesa.notas ? (
        <p className="mt-pila max-w-texto text-pequeno text-tinta-suave">{mesa.notas}</p>
      ) : null}

      {sentados.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.mesas.mesaVacia")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno-compacto">
          {sentados.map((persona) => (
            <li key={persona.id} className="border-b border-borde-tenue pb-interno-compacto">
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
                {persona.estado !== ESTADO_CONFIRMADO ? (
                  <span className="rounded-etiqueta bg-aviso-fondo px-interno py-linea text-pequeno text-aviso-tinta">
                    {t("panel.invitados.pendienteRespuesta")}
                  </span>
                ) : null}
              </div>

              {/* Cambiar de mesa y levantarse salen del mismo desplegable: son
                  la misma decisión, y separarlas obligaría a dos viajes. */}
              {puedeEditar ? (
                <form
                  action={sentarInvitado}
                  className="mt-interno-compacto grid items-end gap-interno-compacto print:hidden sm:grid-cols-[1fr_auto]"
                >
                  <input type="hidden" name="invitado_id" value={persona.id} />
                  <SelectorDeMesa
                    etiqueta={t("panel.mesas.campoMesaDe", { quien: persona.nombreCompleto })}
                    mesas={mesas}
                    sentadosPorMesa={sentadosPorMesa}
                    actual={mesa.id}
                    conSinMesa
                  />
                  {/* «Sentar» sería raro sobre alguien que ya está sentado: lo
                      que se hace aquí es cambiarle de sitio o levantarle. */}
                  <Boton type="submit" jerarquia="terciario">
                    {t("panel.mesas.mover")}
                  </Boton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {alergias.length > 0 ? (
        <div className="mt-elemento rounded-campo bg-aviso-fondo p-interno">
          <Rotulo className="text-aviso-tinta">{t("panel.mesas.alergiasTitulo")}</Rotulo>
          <ul className="mt-pila grid gap-linea">
            {alergias.map((fila) => (
              <li
                key={`${fila.nombre}-${fila.alergias}`}
                className="text-pequeno text-aviso-tinta"
              >
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
        <FormularioMesa mesa={mesa} confirmandoBorrado={confirmandoBorrado} />
      ) : null}
    </section>
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
function AlergiasSinMesa({ alergias }: { alergias: AlergiaEnMesa[] }) {
  if (alergias.length === 0) return null;

  return (
    <div className="mt-elemento rounded-campo bg-aviso-fondo p-interno">
      <Rotulo className="text-aviso-tinta">{t("panel.mesas.alergiasSinMesaTitulo")}</Rotulo>
      <ul className="mt-pila grid gap-linea">
        {alergias.map((fila) => (
          <li key={`${fila.nombre}-${fila.alergias}`} className="text-pequeno text-aviso-tinta">
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
}: {
  mesa: Mesa;
  confirmandoBorrado: boolean;
}) {
  const colocada = mesa.posicionX !== null && mesa.posicionY !== null;

  return (
    <div className="mt-elemento border-t border-borde pt-interno print:hidden">
      <Rotulo className="text-tinta-suave">{t("panel.mesas.editarTitulo")}</Rotulo>

      <form action={editarMesa} className="mt-interno-compacto grid gap-interno sm:grid-cols-2">
        <input type="hidden" name="id" value={mesa.id} />

        <CampoTexto
          etiqueta={t("panel.mesas.campoNombre")}
          name="nombre"
          type="text"
          required
          maxLength={60}
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
            maxLength={1000}
            defaultValue={mesa.notas ?? ""}
          />
        </div>

        <div className="sm:col-span-2">
          <Boton type="submit" jerarquia="secundario">
            {t("panel.mesas.guardar")}
          </Boton>
        </div>
      </form>

      <div className="mt-elemento flex flex-wrap items-end gap-interno">
        {colocada ? (
          <Empujar mesa={mesa} />
        ) : (
          <form action={colocarMesa}>
            <input type="hidden" name="id" value={mesa.id} />
            <Boton type="submit" jerarquia="secundario">
              {t("panel.mesas.colocar")}
            </Boton>
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
          <Boton type="submit" jerarquia="terciario">
            {confirmandoBorrado ? t("panel.mesas.confirmarBorrado") : t("panel.mesas.borrar")}
          </Boton>
        </form>
      </div>
    </div>
  );
}

/** Las cuatro flechas. Cada una es un formulario: funcionan sin JavaScript. */
function Empujar({ mesa }: { mesa: Mesa }) {
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
      <Rotulo className="text-tinta-suave">{t("panel.mesas.moverTitulo")}</Rotulo>
      <div className="mt-interno-compacto flex flex-wrap gap-interno-compacto">
        {sentidos.map((flecha) => (
          <form key={flecha.sentido} action={empujarMesa}>
            <input type="hidden" name="id" value={mesa.id} />
            <input type="hidden" name="sentido" value={flecha.sentido} />
            {/*
              El nombre accesible lleva la mesa dentro —«Subir Mesa 4»— porque
              en una pantalla con doce mesas hay cuarenta y ocho flechas, y
              «Arriba» a secas no dice de cuál.
            */}
            <Boton type="submit" jerarquia="secundario" aria-label={flecha.nombre}>
              {flecha.glifo}
            </Boton>
          </form>
        ))}
      </div>
    </div>
  );
}

function FormularioNuevaMesa() {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno print:hidden">
      <Titulo3 como="h2">{t("panel.mesas.nuevaTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.mesas.nuevaAyuda")}
      </Cuerpo>

      <form action={crearMesa} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <CampoTexto
          etiqueta={t("panel.mesas.campoNombre")}
          name="nombre"
          type="text"
          required
          maxLength={60}
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
            maxLength={1000}
          />
        </div>

        <div className="sm:col-span-2">
          <Boton type="submit">{t("panel.mesas.crear")}</Boton>
        </div>
      </form>
    </section>
  );
}
