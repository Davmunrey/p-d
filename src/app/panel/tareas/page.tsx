import type { Metadata } from "next";
import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { BotonEnlace } from "@/components/ui/boton";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { LARGOS_DE_CAMPO, RUTA_ACCESO, RUTA_TAREAS } from "@/config/constants";
import { obtenerProveedores, type Proveedor } from "@/lib/bbdd/proveedores";
import {
  deLaColumna,
  estaVencida,
  ESTADO_HECHA,
  ESTADO_INICIAL_TAREA,
  ESTADOS_TAREA,
  obtenerGruposPlantilla,
  obtenerResponsables,
  obtenerTareas,
  PRIORIDAD_INICIAL_TAREA,
  PRIORIDADES_TAREA,
  vencePronto,
  type GrupoPlantilla,
  type Responsable,
  type Tarea,
} from "@/lib/bbdd/tareas";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import {
  borrarTarea,
  cambiarEstadoTarea,
  crearTarea,
  duplicarTarea,
  editarTarea,
  generarDesdePlantilla,
  moverTarea,
} from "./acciones";
import { AvisoTareas } from "./aviso";
import { ANCLA_ALTA_TAREA, ANCLA_PLANTILLA, anclaDeTarea, DESDE } from "./estado";
import { comoDia, nombreDeLaPrioridad, nombreDelEstado, nombreDelGrupo } from "./formato";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.tareas.titulo") };

/**
 * BODA-80/81/82 · TAREAS
 *
 * DOS VISTAS DE LA MISMA LISTA, Y CADA UNA CONTESTA UNA PREGUNTA DISTINTA. La
 * lista contesta «¿qué es lo siguiente?» —todo junto, por urgencia—; el tablero
 * contesta «¿por dónde vamos?». Son la misma consulta y el mismo orden: lo
 * único que cambia es si se reparte en columnas. Por eso la vista viaja en la
 * URL y no en una cookie: se comparte, se recarga y se vuelve a ella.
 *
 * EL TABLERO SE MUEVE SIN RATÓN Y SIN JAVASCRIPT. Cada tarjeta lleva un botón
 * por columna de destino, dentro de su `<form>`: se llega con el tabulador y se
 * dispara con Enter. Arrastrar es cómodo con ratón y es sencillamente imposible
 * sin él — y esta pantalla se usa la víspera, con el móvil, de pie.
 *
 * LO VENCIDO Y LO QUE VENCE PRONTO SE DISTINGUEN CON PALABRAS, no sólo con
 * color: «Vencida» y «Vence pronto» se leen con el sol de junio dando en la
 * pantalla, se leen en un lector de pantalla y se leen siendo daltónico. Y los
 * días los cuenta la BASE, no el navegador: un reloj mal puesto no puede
 * decidir qué llega tarde.
 *
 * UN LECTOR VE PERO NO CREA. La protección de verdad es RLS; esto es no ofrecer
 * un formulario que va a fallar al enviarlo.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

/** El valor de `?vista=` que enseña las columnas. Cualquier otro es la lista. */
const VISTA_TABLERO = "tablero";

export default async function PaginaTareas({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const vista = soloTexto(consulta.vista) === VISTA_TABLERO ? VISTA_TABLERO : "";
  const editando = soloTexto(consulta.editar);
  const confirmando =
    soloTexto(consulta.estado) === "confirmar-borrado" ? soloTexto(consulta.tarea) : "";

  const [tareas, responsables, proveedores, grupos] = await Promise.all([
    obtenerTareas(),
    obtenerResponsables(),
    obtenerProveedores(),
    obtenerGruposPlantilla(),
  ]);

  const puedeEditar = acceso.rol !== "lector";

  /*
    EL AVISO VA DONDE SE HIZO LA ACCIÓN: en la tarjeta que se tocó, en el alta
    o en la plantilla, que están al final. Arriba sólo si no se sabe, o si la
    tarea ya no está.
  */
  const estado = soloTexto(consulta.estado);
  const aviso = <AvisoTareas estado={estado} creadas={soloTexto(consulta.creadas)} />;
  const deLaTarea = soloTexto(consulta.tarea);
  const enUnaTarea = tareas.some((tarea) => tarea.id === deLaTarea) ? deLaTarea : "";
  const desde = puedeEditar ? soloTexto(consulta.desde) : "";
  const enElAlta = desde === DESDE.alta;
  const enLaPlantilla = desde === DESDE.plantilla;

  const contexto: Contexto = {
    vista,
    editando,
    confirmando: enUnaTarea && confirmando === enUnaTarea ? confirmando : "",
    puedeEditar,
    responsables,
    proveedores,
    enUnaTarea,
    aviso,
  };

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.tareas.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.tareas.descripcion")}</Cuerpo>
        <div className="mt-pila flex flex-wrap gap-interno">
          {vista === VISTA_TABLERO ? (
            <EnlaceSuave href={RUTA_TAREAS}>{t("panel.tareas.verLista")}</EnlaceSuave>
          ) : (
            <EnlaceSuave href={`${RUTA_TAREAS}?vista=${VISTA_TABLERO}`}>
              {t("panel.tareas.verTablero")}
            </EnlaceSuave>
          )}
        </div>
      </header>

      {enUnaTarea || enElAlta || enLaPlantilla ? null : aviso}

      {tareas.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">{t("panel.tareas.vacio")}</Cuerpo>
      ) : vista === VISTA_TABLERO ? (
        <Tablero tareas={tareas} contexto={contexto} />
      ) : (
        <Lista tareas={tareas} contexto={contexto} />
      )}

      {puedeEditar ? (
        <FormularioAlta
          responsables={responsables}
          proveedores={proveedores}
          vista={vista}
          aviso={enElAlta ? aviso : null}
        />
      ) : null}

      {puedeEditar ? (
        <Plantilla grupos={grupos} vista={vista} aviso={enLaPlantilla ? aviso : null} />
      ) : null}
    </>
  );
}

/**
 * Lo que necesita cada tarjeta y que no cambia entre ellas. Va junto para que
 * añadir un dato no obligue a pasarlo por cuatro componentes de uno en uno.
 */
interface Contexto {
  vista: string;
  editando: string;
  confirmando: string;
  puedeEditar: boolean;
  responsables: Responsable[];
  proveedores: Proveedor[];
  /** La tarea a la que vuelve la última acción: su aviso se pinta en ella. */
  enUnaTarea: string;
  aviso: ReactNode;
}

/* -------------------------------------------------------------------------- */
/*  La lista                                                                  */
/* -------------------------------------------------------------------------- */

function Lista({ tareas, contexto }: { tareas: Tarea[]; contexto: Contexto }) {
  return (
    <section className="mt-bloque">
      <Titulo3 como="h2" className="border-b border-borde pb-linea">
        {t("panel.tareas.listaTitulo")}
      </Titulo3>

      <ul className="mt-elemento grid gap-interno">
        {tareas.map((tarea) => (
          <Tarjeta key={tarea.id} tarea={tarea} contexto={contexto} enTablero={false} />
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  El tablero                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Una columna por estado, apiladas en el móvil y en fila desde tablet.
 *
 * EN EL MÓVIL NO SE ESCONDE NINGUNA COLUMNA: se ponen una debajo de otra, con
 * su título y su cuenta. Un tablero que en móvil sólo enseña «pendiente»
 * obligaría a cambiar de vista para saber si algo está en marcha, que es la
 * mitad de la pregunta que el tablero viene a contestar.
 */
function Tablero({ tareas, contexto }: { tareas: Tarea[]; contexto: Contexto }) {
  return (
    /*
      TRES COLUMNAS SÓLO DONDE CABEN. Con `md`, a 820 px y con el lateral del
      panel, cada columna medía 147 px y las tarjetas 183: invadían la de al
      lado y la de «Hecha» salía cortada. Hasta escritorio van apiladas, como
      en el móvil, y cada columna puede encogerse sin que su contenido la rompa.
    */
    <div className="mt-bloque grid gap-bloque lg:grid-cols-3">
      {ESTADOS_TAREA.map((estado) => {
        const columna = deLaColumna(tareas, estado);

        return (
          <section key={estado} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-interno-compacto">
              <Titulo3 como="h2">{nombreDelEstado(estado)}</Titulo3>
              <span className="text-pequeno text-tinta-suave">
                {columna.length === 1
                  ? t("panel.tareas.cuantasUna")
                  : t("panel.tareas.cuantas", { cuantas: columna.length })}
              </span>
            </div>

            {columna.length === 0 ? (
              <Cuerpo className="mt-elemento text-pequeno">
                {t("panel.tareas.columnaVacia")}
              </Cuerpo>
            ) : (
              <ul className="mt-elemento grid gap-interno">
                {columna.map((tarea, posicion) => (
                  <Tarjeta
                    key={tarea.id}
                    tarea={tarea}
                    contexto={contexto}
                    enTablero
                    puedeSubir={posicion > 0}
                    puedeBajar={posicion < columna.length - 1}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  La tarjeta                                                                */
/* -------------------------------------------------------------------------- */

function Tarjeta({
  tarea,
  contexto,
  enTablero,
  puedeSubir = false,
  puedeBajar = false,
}: {
  tarea: Tarea;
  contexto: Contexto;
  enTablero: boolean;
  puedeSubir?: boolean;
  puedeBajar?: boolean;
}) {
  const vencida = estaVencida(tarea);
  const pronto = vencePronto(tarea);
  const editandoEsta = contexto.puedeEditar && contexto.editando === tarea.id;

  return (
    <li
      id={anclaDeTarea(tarea.id)}
      className={`min-w-0 scroll-mt-elemento rounded-tarjeta border bg-superficie p-interno ${
        vencida ? "border-error" : pronto ? "border-aviso" : "border-borde"
      }`}
    >
      {editandoEsta ? (
        <FormularioEdicion tarea={tarea} contexto={contexto} />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-interno">
            {/*
              LO HECHO SE APAGA. Una tarea terminada pesaba lo mismo que una por
              hacer, y en la lista había que leer la línea de abajo para saber
              cuál era cuál. El estado sigue escrito: el tachado no es lo único.
            */}
            {/*
              EL TÍTULO ES UN ENCABEZADO: se navega de tarjeta en tarjeta con
              el lector de pantalla, igual que en el resto del panel.
            */}
            <h3
              className={
                tarea.estado === ESTADO_HECHA
                  ? "min-w-0 font-cuerpo peso-cuerpo text-cuerpo leading-cuerpo tracking-normal text-tinta-suave line-through wrap-anywhere"
                  : "min-w-0 font-cuerpo peso-cuerpo text-cuerpo leading-cuerpo tracking-normal text-tinta wrap-anywhere"
              }
            >
              {tarea.titulo}
            </h3>
            <Plazo tarea={tarea} vencida={vencida} pronto={pronto} />
          </div>

          <p className="mt-linea text-pequeno text-tinta-suave">
            {[
              nombreDeLaPrioridad(tarea.prioridad),
              tarea.categoria,
              tarea.responsable,
              tarea.proveedor,
              // En la lista, la columna en la que está: sin ella no se sabe
              // qué está en marcha y qué ni se ha empezado.
              enTablero ? null : nombreDelEstado(tarea.estado),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {tarea.descripcion ? (
            <p className="mt-linea max-w-texto text-pequeno text-tinta-suave">
              {tarea.descripcion}
            </p>
          ) : null}

          {contexto.puedeEditar ? (
            <Controles
              tarea={tarea}
              contexto={contexto}
              enTablero={enTablero}
              puedeSubir={puedeSubir}
              puedeBajar={puedeBajar}
            />
          ) : null}
        </>
      )}

      {contexto.enUnaTarea === tarea.id ? contexto.aviso : null}

      {/* La salida de la pregunta de borrar, junto al botón que la contesta. */}
      {contexto.confirmando === tarea.id ? (
        <EnlaceSuave
          href={`${RUTA_TAREAS}${contexto.vista ? `?vista=${contexto.vista}` : ""}#${anclaDeTarea(tarea.id)}`}
          className="mt-interno-compacto"
        >
          {t("panel.tareas.noBorrar")}
        </EnlaceSuave>
      ) : null}
    </li>
  );
}

/**
 * PARA CUÁNDO ES, Y SI YA ES TARDE.
 *
 * Las tres respuestas son distintas y las tres llevan palabra: «Vencida» no es
 * un borde rojo, «Vence pronto» no es un borde ámbar y una tarea sin fecha lo
 * dice en lugar de dejar el hueco vacío — un hueco no se distingue de un dato
 * que no ha cargado.
 */
function Plazo({
  tarea,
  vencida,
  pronto,
}: {
  tarea: Tarea;
  vencida: boolean;
  pronto: boolean;
}) {
  if (tarea.estado === ESTADO_HECHA) {
    return (
      <span className="text-pequeno text-tinta-suave">
        {tarea.fechaLimite
          ? t("panel.tareas.para", { fecha: comoDia(tarea.fechaLimite) })
          : t("panel.tareas.sinFechaLimite")}
      </span>
    );
  }

  if (!tarea.fechaLimite) {
    return (
      <span className="text-pequeno text-tinta-suave">{t("panel.tareas.sinFechaLimite")}</span>
    );
  }

  const fecha = (
    <span className="text-pequeno text-tinta-suave">
      {t("panel.tareas.para", { fecha: comoDia(tarea.fechaLimite) })}
    </span>
  );

  if (!vencida && !pronto) return fecha;

  return (
    <span className="flex flex-wrap items-baseline gap-interno-compacto">
      {fecha}
      <Distintivo alarmante={vencida}>
        {vencida
          ? t("panel.tareas.vencida")
          : tarea.diasParaVencer === 0
            ? t("panel.tareas.venceHoy")
            : t("panel.tareas.vencePronto")}
      </Distintivo>
    </span>
  );
}

/**
 * El distintivo escribe en TINTA y no en el color de su estado.
 *
 * El rojo del sistema sobre su propio fondo rosa da 4,1:1 y el ámbar sobre el
 * suyo, 2,9: los dos por debajo del 4,5 que exige AA para texto pequeño, y este
 * texto es de los más pequeños de la pantalla. El estado lo dicen el fondo y el
 * borde —que no tienen que llegar a ese listón— y la palabra de dentro se lee
 * en tinta, a 16:1.
 *
 * Eso es exactamente lo que son las variantes «marcadas» de `EtiquetaEstado`:
 * nacieron de esta pantalla, que era la única del panel que ya había hecho bien
 * la cuenta. Aquí queda el envoltorio con el nombre que usa el tablero, y la
 * píldora la pinta el componente como todas las demás.
 */
function Distintivo({ alarmante, children }: { alarmante: boolean; children: ReactNode }) {
  return (
    <EtiquetaEstado
      variante={alarmante ? "error-marcada" : "aviso-marcada"}
      tamano="versalita-compacta"
    >
      {children}
    </EtiquetaEstado>
  );
}

/**
 * LOS BOTONES DE LA TARJETA
 *
 * En el tablero mandan los de mover —es a lo que se viene— y en la lista, los
 * de gestionar. Enseñar los ocho en los dos sitios convertiría cada tarjeta en
 * una barra de herramientas, y con veinte tareas eso es ciento sesenta botones.
 */
function Controles({
  tarea,
  contexto,
  enTablero,
  puedeSubir,
  puedeBajar,
}: {
  tarea: Tarea;
  contexto: Contexto;
  enTablero: boolean;
  puedeSubir: boolean;
  puedeBajar: boolean;
}) {
  const confirmandoEsta = contexto.confirmando === tarea.id;

  return (
    <div className="mt-interno-compacto flex flex-wrap items-center gap-interno">
      {enTablero ? (
        <>
          {ESTADOS_TAREA.filter((estado) => estado !== tarea.estado).map((estado) => (
            <form key={estado} action={cambiarEstadoTarea}>
              <input type="hidden" name="id" value={tarea.id} />
              <input type="hidden" name="estado" value={estado} />
              <input type="hidden" name="vista" value={contexto.vista} />
              <BotonEnvio jerarquia="secundario">
                {t("panel.tareas.moverA", { estado: nombreDelEstado(estado) })}
                <DeQueTarea tarea={tarea} />
              </BotonEnvio>
            </form>
          ))}

          {/*
            El botón de subir NO SE PINTA en la primera tarjeta de la columna, ni
            el de bajar en la última: no hay a dónde ir. Un botón que sólo puede
            contestar «ya está arriba» obliga a pulsarlo para saberlo.
          */}
          {puedeSubir ? (
            <FormularioMover tarea={tarea} vista={contexto.vista} direccion="subir" />
          ) : null}
          {puedeBajar ? (
            <FormularioMover tarea={tarea} vista={contexto.vista} direccion="bajar" />
          ) : null}
        </>
      ) : (
        <form action={cambiarEstadoTarea}>
          <input type="hidden" name="id" value={tarea.id} />
          <input
            type="hidden"
            name="estado"
            value={tarea.estado === ESTADO_HECHA ? ESTADO_INICIAL_TAREA : ESTADO_HECHA}
          />
          <input type="hidden" name="vista" value={contexto.vista} />
          <BotonEnvio jerarquia="secundario">
            {tarea.estado === ESTADO_HECHA
              ? t("panel.tareas.reabrir")
              : t("panel.tareas.completar")}
            <DeQueTarea tarea={tarea} />
          </BotonEnvio>
        </form>
      )}

      {/* Con el mismo aspecto que «Duplicar» y «Borrar»: son tres acciones de
          la misma fila y cada una iba vestida de una forma distinta. */}
      <BotonEnlace
        href={`${RUTA_TAREAS}?${contexto.vista ? `vista=${contexto.vista}&` : ""}editar=${tarea.id}#tarea-${tarea.id}`}
        jerarquia="terciario"
      >
        {t("panel.tareas.editar")}
        <DeQueTarea tarea={tarea} />
      </BotonEnlace>

      {enTablero ? null : (
        <>
          <form action={duplicarTarea}>
            <input type="hidden" name="id" value={tarea.id} />
            <input type="hidden" name="vista" value={contexto.vista} />
            <BotonEnvio jerarquia="terciario">
              {t("panel.tareas.duplicar")}
              <DeQueTarea tarea={tarea} />
            </BotonEnvio>
          </form>

          <form action={borrarTarea}>
            <input type="hidden" name="id" value={tarea.id} />
            <input type="hidden" name="vista" value={contexto.vista} />
            {/*
              El segundo paso del borrado. El mismo formulario y la misma acción:
              lo único que cambia es que ahora lleva la confirmación dentro, así
              que no hay dos caminos que puedan discrepar.
            */}
            {confirmandoEsta ? <input type="hidden" name="confirmar" value="si" /> : null}
            <BotonEnvio jerarquia={confirmandoEsta ? "secundario" : "terciario"}>
              {confirmandoEsta ? t("panel.tareas.confirmarBorrado") : t("panel.tareas.borrar")}
              <DeQueTarea tarea={tarea} />
            </BotonEnvio>
          </form>
        </>
      )}
    </div>
  );
}

function FormularioMover({
  tarea,
  vista,
  direccion,
}: {
  tarea: Tarea;
  vista: string;
  direccion: "subir" | "bajar";
}) {
  return (
    <form action={moverTarea}>
      <input type="hidden" name="id" value={tarea.id} />
      <input type="hidden" name="direccion" value={direccion} />
      <input type="hidden" name="vista" value={vista} />
      <BotonEnvio jerarquia="terciario">
        {direccion === "subir" ? t("panel.tareas.subirOrden") : t("panel.tareas.bajarOrden")}
        <DeQueTarea tarea={tarea} />
      </BotonEnvio>
    </form>
  );
}

/**
 * DE QUÉ TAREA ES CADA BOTÓN, PARA QUIEN NO LO VE. Un lector de pantalla oía
 * «Marcar hecha» ocho veces seguidas sin saber de cuál. El rótulo visible
 * queda al principio del nombre accesible —quien dicta «pulsa Marcar hecha»
 * sigue acertando (WCAG 2.5.3)— y la tarea va detrás, oculta a la vista. Es el
 * mismo arreglo que el de las secciones del contenido.
 */
function DeQueTarea({ tarea }: { tarea: Tarea }) {
  return <span className="sr-only"> {tarea.titulo}</span>;
}

/* -------------------------------------------------------------------------- */
/*  Formularios                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Los campos que comparten el alta y la edición.
 *
 * Escritos una vez porque son los mismos: dos copias del mismo formulario
 * acaban divergiendo en el `maxLength` o en el orden de las opciones, y quien
 * edita ve otra pantalla que quien crea sin que nadie lo haya decidido.
 */
function CamposTarea({
  tarea,
  responsables,
  proveedores,
}: {
  tarea?: Tarea;
  responsables: Responsable[];
  proveedores: Proveedor[];
}) {
  return (
    <>
      <div className="sm:col-span-2">
        <CampoTexto
          etiqueta={t("panel.tareas.campoTitulo")}
          ayuda={t("panel.tareas.campoTituloAyuda")}
          name="titulo"
          type="text"
          required
          maxLength={LARGOS_DE_CAMPO["tareas.titulo"]}
          defaultValue={tarea?.titulo ?? ""}
        />
      </div>

      {/*
        NACE EN «MEDIA», COMO EN LA BASE. Con `""` y sin opción vacía el
        navegador marcaba la primera —«Baja»— y la tarea apuntada sólo con su
        título caía al fondo de la lista.
      */}
      <CampoSeleccion
        etiqueta={t("panel.tareas.campoPrioridad")}
        name="prioridad"
        defaultValue={tarea?.prioridad ?? PRIORIDAD_INICIAL_TAREA}
      >
        {PRIORIDADES_TAREA.map((prioridad) => (
          <option key={prioridad} value={prioridad}>
            {nombreDeLaPrioridad(prioridad)}
          </option>
        ))}
      </CampoSeleccion>

      <CampoTexto
        etiqueta={t("panel.tareas.campoFechaLimite")}
        ayuda={t("panel.tareas.campoFechaLimiteAyuda")}
        name="fecha_limite"
        type="date"
        defaultValue={tarea?.fechaLimite ?? ""}
      />

      <CampoTexto
        etiqueta={t("panel.tareas.campoCategoria")}
        ayuda={t("panel.tareas.campoCategoriaAyuda")}
        name="categoria"
        type="text"
        maxLength={LARGOS_DE_CAMPO["tareas.categoria"]}
        defaultValue={tarea?.categoria ?? ""}
      />

      <CampoSeleccion
        etiqueta={t("panel.tareas.campoResponsable")}
        name="responsable_id"
        defaultValue={tarea?.responsableId ?? ""}
      >
        {/* Sin asignar es un estado legítimo y frecuente, y por eso va primero. */}
        <option value="">{t("panel.tareas.sinResponsable")}</option>
        {responsables.map((responsable) => (
          <option key={responsable.id} value={responsable.id}>
            {responsable.nombre}
          </option>
        ))}
        {/*
          QUIEN YA NO TIENE ACCESO SIGUE SIENDO EL RESPONSABLE hasta que alguien
          lo cambie a propósito. No estaba en la lista, el navegador marcaba
          «Sin asignar» y guardar sólo para cambiar la fecha le quitaba la tarea.
        */}
        {tarea?.responsableId &&
        !responsables.some((responsable) => responsable.id === tarea.responsableId) ? (
          <option value={tarea.responsableId}>
            {t("panel.tareas.responsableSinAcceso", {
              nombre: tarea.responsable ?? t("panel.tareas.sinResponsable"),
            })}
          </option>
        ) : null}
      </CampoSeleccion>

      <CampoSeleccion
        etiqueta={t("panel.tareas.campoProveedor")}
        name="proveedor_id"
        defaultValue={tarea?.proveedorId ?? ""}
      >
        <option value="">{t("panel.tareas.sinProveedor")}</option>
        {proveedores.map((proveedor) => (
          <option key={proveedor.id} value={proveedor.id}>
            {proveedor.nombre}
          </option>
        ))}
      </CampoSeleccion>

      <div className="sm:col-span-2">
        <CampoTextoLargo
          etiqueta={t("panel.tareas.campoDescripcion")}
          ayuda={t("panel.tareas.campoDescripcionAyuda")}
          name="descripcion"
          rows={3}
          maxLength={LARGOS_DE_CAMPO["tareas.descripcion"]}
          defaultValue={tarea?.descripcion ?? ""}
        />
      </div>
    </>
  );
}

function FormularioAlta({
  responsables,
  proveedores,
  vista,
  aviso,
}: {
  responsables: Responsable[];
  proveedores: Proveedor[];
  vista: string;
  aviso: ReactNode;
}) {
  return (
    <section
      id={ANCLA_ALTA_TAREA}
      className="mt-bloque scroll-mt-elemento rounded-tarjeta border border-borde p-interno"
    >
      <Titulo3 como="h2">{t("panel.tareas.nuevaTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.tareas.nuevaAyuda")}
      </Cuerpo>

      {aviso}

      <form action={crearTarea} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <input type="hidden" name="vista" value={vista} />
        <CamposTarea responsables={responsables} proveedores={proveedores} />
        <div className="sm:col-span-2">
          <BotonEnvio>{t("panel.tareas.crear")}</BotonEnvio>
        </div>
      </form>
    </section>
  );
}

/** La edición vive DENTRO de la tarjeta: se edita donde se estaba mirando. */
function FormularioEdicion({ tarea, contexto }: { tarea: Tarea; contexto: Contexto }) {
  return (
    <>
      <Titulo3 como="h3">{t("panel.tareas.editarTitulo")}</Titulo3>

      <form action={editarTarea} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <input type="hidden" name="id" value={tarea.id} />
        <input type="hidden" name="vista" value={contexto.vista} />
        <CamposTarea
          tarea={tarea}
          responsables={contexto.responsables}
          proveedores={contexto.proveedores}
        />
        <div className="flex flex-wrap items-center gap-interno sm:col-span-2">
          <BotonEnvio>{t("panel.tareas.guardar")}</BotonEnvio>
          <EnlaceSuave
            href={`${RUTA_TAREAS}${contexto.vista ? `?vista=${contexto.vista}` : ""}`}
            discreto
          >
            {t("panel.tareas.cancelar")}
          </EnlaceSuave>
        </div>
      </form>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  La plantilla                                                              */
/* -------------------------------------------------------------------------- */

/**
 * BODA-82 · EMPEZAR CON LA LISTA PUESTA
 *
 * Los grupos salen de `plantilla_tareas`, no de una lista escrita aquí: el
 * grupo es texto en la base para que añadir «boda en el extranjero» sea una
 * fila y no un despliegue. Si algún día llega uno sin traducción, se enseña su
 * nombre crudo — feo, pero cierto.
 *
 * SE PUEDE PULSAR DOS VECES SIN MIEDO, y eso es media funcionalidad: la
 * generación es idempotente por `plantilla_id`, así que la segunda vez no
 * duplica nada y lo dice con su cifra («0 creadas»). Sin ese aviso, quien
 * genera dos veces se queda sin saber si acaba de duplicar veinte tareas.
 */
function Plantilla({
  grupos,
  vista,
  aviso,
}: {
  grupos: GrupoPlantilla[];
  vista: string;
  aviso: ReactNode;
}) {
  return (
    <section
      id={ANCLA_PLANTILLA}
      className="mt-elemento scroll-mt-elemento rounded-tarjeta border border-borde p-interno"
    >
      <Titulo3 como="h2">{t("panel.tareas.plantillaTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.tareas.plantillaAyuda")}
      </Cuerpo>

      {aviso}

      {grupos.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno">{t("panel.tareas.plantillaVacia")}</Cuerpo>
      ) : (
        <form action={generarDesdePlantilla} className="mt-elemento grid gap-interno">
          <input type="hidden" name="vista" value={vista} />

          <fieldset className="grid gap-interno-compacto">
            <legend className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
              {t("panel.tareas.plantillaGrupos")}
            </legend>

            {grupos.map((grupo) => (
              <label
                key={grupo.grupo}
                className="flex min-h-control-compacto items-center gap-interno-compacto text-pequeno text-tinta"
              >
                <input
                  type="checkbox"
                  name="grupos"
                  value={grupo.grupo}
                  className="casilla-marca transicion-color"
                />
                {nombreDelGrupo(grupo.grupo)}
                <span className="text-tinta-suave">
                  {grupo.cuantas === 1
                    ? t("panel.tareas.plantillaCuantasUna")
                    : t("panel.tareas.plantillaCuantas", { cuantas: grupo.cuantas })}
                  {/*
                    LO QUE YA SALIÓ DE CADA GRUPO. La pantalla enseñaba los
                    grupos igual el primer día que el centésimo, y no se sabía
                    cuáles se habían generado.
                  */}
                  {grupo.yaEnLaLista > 0
                    ? ` · ${t("panel.tareas.plantillaYaEnLaLista", { cuantas: grupo.yaEnLaLista })}`
                    : ""}
                </span>
              </label>
            ))}
          </fieldset>

          {/* Lo que pasa de verdad al repetir, para que nadie se lleve una sorpresa. */}
          {grupos.some((grupo) => grupo.yaEnLaLista > 0) ? (
            <p className="max-w-texto text-pequeno text-tinta-suave">
              {t("panel.tareas.plantillaRepone")}
            </p>
          ) : null}

          <div>
            <BotonEnvio jerarquia="secundario">{t("panel.tareas.generar")}</BotonEnvio>
          </div>
        </form>
      )}
    </section>
  );
}
