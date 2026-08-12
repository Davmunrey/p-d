import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_TAREAS } from "@/config/constants";
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
import { comoDia, nombreDeLaPrioridad, nombreDelEstado, nombreDelGrupo } from "./formato";

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

  const contexto: Contexto = {
    vista,
    editando,
    confirmando,
    puedeEditar,
    responsables,
    proveedores,
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

      <AvisoTareas estado={soloTexto(consulta.estado)} creadas={soloTexto(consulta.creadas)} />

      {tareas.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">{t("panel.tareas.vacio")}</Cuerpo>
      ) : vista === VISTA_TABLERO ? (
        <Tablero tareas={tareas} contexto={contexto} />
      ) : (
        <Lista tareas={tareas} contexto={contexto} />
      )}

      {puedeEditar ? (
        <FormularioAlta responsables={responsables} proveedores={proveedores} vista={vista} />
      ) : null}

      {puedeEditar ? <Plantilla grupos={grupos} vista={vista} /> : null}
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
    <div className="mt-bloque grid gap-bloque md:grid-cols-3">
      {ESTADOS_TAREA.map((estado) => {
        const columna = deLaColumna(tareas, estado);

        return (
          <section key={estado}>
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
      id={`tarea-${tarea.id}`}
      className={`rounded-tarjeta border bg-superficie p-interno ${
        vencida ? "border-error" : pronto ? "border-aviso" : "border-borde"
      }`}
    >
      {editandoEsta ? (
        <FormularioEdicion tarea={tarea} contexto={contexto} />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-interno">
            <span className="text-cuerpo text-tinta">{tarea.titulo}</span>
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
 */
function Distintivo({ alarmante, children }: { alarmante: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-etiqueta border px-interno-compacto py-linea text-diminuto uppercase tracking-etiqueta text-tinta ${
        alarmante ? "border-error bg-error-fondo" : "border-aviso bg-aviso-fondo"
      }`}
    >
      {children}
    </span>
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
    <div className="mt-elemento flex flex-wrap items-center gap-interno">
      {enTablero ? (
        <>
          {ESTADOS_TAREA.filter((estado) => estado !== tarea.estado).map((estado) => (
            <form key={estado} action={cambiarEstadoTarea}>
              <input type="hidden" name="id" value={tarea.id} />
              <input type="hidden" name="estado" value={estado} />
              <input type="hidden" name="vista" value={contexto.vista} />
              <Boton type="submit" jerarquia="secundario">
                {t("panel.tareas.moverA", { estado: nombreDelEstado(estado) })}
              </Boton>
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
          <Boton type="submit" jerarquia="secundario">
            {tarea.estado === ESTADO_HECHA
              ? t("panel.tareas.reabrir")
              : t("panel.tareas.completar")}
          </Boton>
        </form>
      )}

      <EnlaceSuave
        href={`${RUTA_TAREAS}?${contexto.vista ? `vista=${contexto.vista}&` : ""}editar=${tarea.id}#tarea-${tarea.id}`}
      >
        {t("panel.tareas.editar")}
      </EnlaceSuave>

      {enTablero ? null : (
        <>
          <form action={duplicarTarea}>
            <input type="hidden" name="id" value={tarea.id} />
            <input type="hidden" name="vista" value={contexto.vista} />
            <Boton type="submit" jerarquia="terciario">
              {t("panel.tareas.duplicar")}
            </Boton>
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
            <Boton type="submit" jerarquia={confirmandoEsta ? "secundario" : "terciario"}>
              {confirmandoEsta ? t("panel.tareas.confirmarBorrado") : t("panel.tareas.borrar")}
            </Boton>
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
      <Boton type="submit" jerarquia="terciario">
        {direccion === "subir" ? t("panel.tareas.subirOrden") : t("panel.tareas.bajarOrden")}
      </Boton>
    </form>
  );
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
          maxLength={160}
          defaultValue={tarea?.titulo ?? ""}
        />
      </div>

      <CampoSeleccion
        etiqueta={t("panel.tareas.campoPrioridad")}
        name="prioridad"
        defaultValue={tarea?.prioridad ?? ""}
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
        maxLength={60}
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
          maxLength={4000}
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
}: {
  responsables: Responsable[];
  proveedores: Proveedor[];
  vista: string;
}) {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.tareas.nuevaTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.tareas.nuevaAyuda")}
      </Cuerpo>

      <form action={crearTarea} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <input type="hidden" name="vista" value={vista} />
        <CamposTarea responsables={responsables} proveedores={proveedores} />
        <div className="sm:col-span-2">
          <Boton type="submit">{t("panel.tareas.crear")}</Boton>
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
          <Boton type="submit">{t("panel.tareas.guardar")}</Boton>
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
function Plantilla({ grupos, vista }: { grupos: GrupoPlantilla[]; vista: string }) {
  return (
    <section className="mt-elemento rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.tareas.plantillaTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.tareas.plantillaAyuda")}
      </Cuerpo>

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
                className="flex items-center gap-interno-compacto text-pequeno text-tinta"
              >
                <input
                  type="checkbox"
                  name="grupos"
                  value={grupo.grupo}
                  className="size-casilla accent-marca"
                />
                {nombreDelGrupo(grupo.grupo)}
                <span className="text-tinta-suave">
                  {grupo.cuantas === 1
                    ? t("panel.tareas.plantillaCuantasUna")
                    : t("panel.tareas.plantillaCuantas", { cuantas: grupo.cuantas })}
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <Boton type="submit" jerarquia="secundario">
              {t("panel.tareas.generar")}
            </Boton>
          </div>
        </form>
      )}
    </section>
  );
}
