import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  LARGOS_DE_CAMPO,
  RUTA_ACCESO,
  RUTA_COMPARADOR,
  RUTA_PROVEEDORES,
} from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import {
  contarPorCategoria,
  ESTADOS_PROVEEDOR,
  obtenerCategoriasProveedor,
  obtenerCategoriasSinCerrar,
  obtenerProveedoresConContactos,
  type CategoriaSinCerrar,
  type CategoriaProveedor,
  type Proveedor,
  type ProveedorConContactos,
} from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { normalizar } from "@/lib/texto";

import {
  borrarCategoria,
  crearCategoria,
  crearProveedor,
  editarCategoria,
  moverCategoria,
} from "./acciones";
import { AvisoProveedores } from "./aviso";
import { anclaDeCategoria } from "./estado";
import { formateadorDeImporte } from "@/lib/importe";

import { nombreDelEstado } from "./formato";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.proveedores.titulo") };

/**
 * BODA-70 · PROVEEDORES
 *
 * AGRUPADO POR CATEGORÍA Y NO EN UNA TABLA PLANA. Una boda no se organiza por
 * orden alfabético de proveedor: se organiza por «¿ya tenemos fotógrafo?». Con
 * las categorías como cabecera, la pregunta se contesta mirando, y una
 * categoría vacía —que es la respuesta más importante— salta a la vista en
 * lugar de esconderse siendo una ausencia.
 *
 * LA BÚSQUEDA VA POR `GET` Y AGUANTA ACENTOS. Un `<form method="get">` deja el
 * filtro en la URL, así que se puede compartir y recargar sin perderlo, y
 * funciona antes de que cargue el JavaScript. Se filtra en memoria porque son
 * decenas de filas: ir a la base por cada letra sería un viaje para nada.
 *
 * UN LECTOR VE PERO NO CREA. La protección de verdad es RLS; esto es no
 * ofrecer un formulario que va a fallar al enviarlo.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

/**
 * Encuentra por nombre, por contacto —también la gente de «Su gente»— y por lo
 * apuntado en las notas.
 */
function coincide(proveedor: ProveedorConContactos, busqueda: string): boolean {
  if (!busqueda) return true;
  const aguja = normalizar(busqueda);
  return [
    proveedor.nombre,
    proveedor.personaContacto,
    proveedor.correoElectronico,
    proveedor.telefono,
    proveedor.notas,
    ...proveedor.contactos,
  ].some((campo) => campo && normalizar(campo).includes(aguja));
}

/** El `id` del formulario de alta, a donde llevan los «Añadir uno en…». */
const ANCLA_ALTA = "alta";

export default async function PaginaProveedores({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const busqueda = soloTexto(consulta.buscar);
  const filtroEstado = soloTexto(consulta.estado_filtro);
  const filtrando = Boolean(busqueda || filtroEstado);

  const [categorias, proveedores, moneda, sinCerrar] = await Promise.all([
    obtenerCategoriasProveedor(),
    obtenerProveedoresConContactos(),
    obtenerMonedaBoda(),
    obtenerCategoriasSinCerrar(),
  ]);

  /*
    Sin moneda configurada no se enseñan importes: escribir «8600» a secas al
    lado de un proveedor invita a leerlo como euros, y si la boda se paga en
    otra cosa eso es peor que no decir nada. El resto de la pantalla funciona.
  */
  const euros = moneda ? formateadorDeImporte(moneda) : null;

  const puedeEditar = acceso.rol !== "lector";
  const totales = contarPorCategoria(proveedores);

  const visibles = proveedores.filter(
    (proveedor) =>
      coincide(proveedor, busqueda) && (!filtroEstado || proveedor.estado === filtroEstado),
  );

  /*
    BUSCANDO, SÓLO LO QUE ENCAJA. Antes se pintaban las doce categorías y el
    único resultado quedaba enterrado entre once «ninguno encaja», a dos mil
    píxeles en el móvil. Se dice cuántos hay y cómo quitar el filtro.
  */
  const categoriasAPintar = filtrando
    ? categorias.filter((categoria) =>
        visibles.some((proveedor) => proveedor.categoriaId === categoria.id),
      )
    : categorias;

  // La categoría con la que llega el alta desde «Añadir uno en…».
  const categoriaDelAlta = categorias.some(
    (categoria) => categoria.id === soloTexto(consulta.categoria),
  )
    ? soloTexto(consulta.categoria)
    : undefined;

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.proveedores.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.proveedores.descripcion")}</Cuerpo>
      </header>

      <AvisoProveedores estado={soloTexto(consulta.estado)} />

      {categorias.length > 0 ? (
        <SinCerrar categorias={sinCerrar} puedeEditar={puedeEditar} />
      ) : null}

      <form
        method="get"
        className="mt-bloque grid items-end gap-interno sm:grid-cols-[1fr_auto_auto]"
      >
        {/* La ayuda bajo la fila y no bajo el campo, para que no lo suba por
            encima del desplegable y del botón (ver el buscador de invitados). */}
        <CampoTexto
          etiqueta={t("panel.proveedores.buscar")}
          aria-describedby="ayuda-buscar-proveedores"
          name="buscar"
          type="search"
          defaultValue={busqueda}
        />
        <CampoSeleccion
          etiqueta={t("panel.proveedores.filtroEstado")}
          name="estado_filtro"
          defaultValue={filtroEstado}
        >
          <option value="">{t("panel.proveedores.filtroTodos")}</option>
          {ESTADOS_PROVEEDOR.map((estado) => (
            <option key={estado} value={estado}>
              {nombreDelEstado(estado)}
            </option>
          ))}
        </CampoSeleccion>
        <BotonEnvio jerarquia="secundario">{t("panel.proveedores.buscar")}</BotonEnvio>
        <p
          id="ayuda-buscar-proveedores"
          className="text-pequeno text-tinta-suave sm:col-span-3"
        >
          {t("panel.proveedores.buscarAyuda")}
        </p>
      </form>

      {filtrando ? (
        <div
          role="status"
          className="mt-elemento flex flex-wrap items-center justify-between gap-interno"
        >
          <Cuerpo className="text-pequeno">
            {visibles.length === 0
              ? t("panel.proveedores.buscarNinguno")
              : visibles.length === 1
                ? t("panel.proveedores.buscarResultadoUno")
                : t("panel.proveedores.buscarResultados", { cuantos: visibles.length })}
          </Cuerpo>
          <EnlaceSuave href={RUTA_PROVEEDORES}>
            {t("panel.proveedores.quitarFiltro")}
          </EnlaceSuave>
        </div>
      ) : null}

      {categorias.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">
          {t("panel.proveedores.sinCategorias")}
        </Cuerpo>
      ) : (
        <div className="mt-bloque grid gap-bloque">
          {categoriasAPintar.map((categoria, indice) => (
            <SeccionCategoria
              key={categoria.id}
              categoria={categoria}
              // Mover sólo tiene sentido viendo la lista entera.
              puesto={
                filtrando
                  ? null
                  : { primera: indice === 0, ultima: indice === categoriasAPintar.length - 1 }
              }
              abierta={soloTexto(consulta.abierta) === categoria.id}
              proveedores={visibles.filter(
                (proveedor) => proveedor.categoriaId === categoria.id,
              )}
              /* Cuántos hay DE VERDAD, no cuántos pasan el filtro: es lo que
                 decide si se puede borrar la categoría, y decirlo sobre la
                 lista filtrada ofrecería borrar una que sí tiene gente. */
              total={totales.get(categoria.id) ?? 0}
              filtrando={filtrando}
              euros={euros}
              puedeEditar={puedeEditar}
            />
          ))}
        </div>
      )}

      {puedeEditar && categorias.length > 0 ? (
        <FormularioProveedor categorias={categorias} categoriaElegida={categoriaDelAlta} />
      ) : null}

      {puedeEditar ? <FormularioCategoria /> : null}
    </>
  );
}

function SeccionCategoria({
  categoria,
  puesto,
  abierta,
  proveedores,
  total,
  filtrando,
  euros,
  puedeEditar,
}: {
  categoria: CategoriaProveedor;
  /** Si su «Corregir» va abierto: se vuelve así de mover o de corregirla. */
  abierta: boolean;
  /** Dónde está en la lista, para ofrecer moverla; `null` si no se ofrece. */
  puesto: { primera: boolean; ultima: boolean } | null;
  proveedores: Proveedor[];
  total: number;
  filtrando: boolean;
  euros: ((importe: number) => string) | null;
  puedeEditar: boolean;
}) {
  return (
    <section id={anclaDeCategoria(categoria.id)} className="scroll-mt-elemento">
      <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-interno-compacto">
        <Titulo3 como="h2">{categoria.nombre}</Titulo3>
        <div className="flex items-baseline gap-interno">
          <Etiqueta>
            {total === 1
              ? t("panel.proveedores.cuantosUno")
              : t("panel.proveedores.cuantos", { cuantos: total })}
          </Etiqueta>

          {/*
            BODA-73 · COMPARAR, DESDE DONDE SE MIRA.

            EL ENLACE APARECE A PARTIR DE DOS, y no es una sutileza: una
            comparativa de un solo candidato es una tabla de una columna, o sea
            la ficha con más pasos. Ofrecerla siempre enseñaría a no pulsarla.

            El nombre de la categoría va en el nombre accesible porque hay un
            «Comparar» por cabecera y, en una lista de nueve categorías, nueve
            enlaces con el mismo texto no dicen a dónde van.
          */}
          {total > 1 ? (
            <Link
              href={`${RUTA_COMPARADOR}?categoria=${categoria.id}`}
              aria-label={t("panel.proveedores.compararCategoria", {
                categoria: categoria.nombre,
              })}
              /*
                EL ÁREA QUE SE PUEDE TOCAR ES LA BARRA ENTERA, no la altura de
                su texto. Nació con 21 px de alto —el cuerpo de la letra— y eso
                es la mitad de los 44 que hace falta acertar con el pulgar; el
                repaso táctil del panel lo cazó el mismo día. Estirarlo no
                cambia nada de lo que se ve: cambia lo que se puede pulsar.
              */
              className="inline-flex min-h-control-compacto items-center text-pequeno text-tinta-marca underline"
            >
              {t("panel.proveedores.comparar")}
            </Link>
          ) : null}

          {/*
            BORRAR SÓLO SI ESTÁ VACÍA, y el botón se quita en vez de
            deshabilitarse. La base lo impide igualmente —`on delete restrict`
            desde `proveedores`— pero ofrecer un botón que sólo puede dar un
            error es peor que no ofrecerlo: obliga a probarlo para saberlo.
          */}
          {puedeEditar && total === 0 ? (
            <form action={borrarCategoria}>
              <input type="hidden" name="id" value={categoria.id} />
              <BotonEnvio
                jerarquia="terciario"
                aria-label={t("panel.proveedores.borrarCategoriaDe", {
                  categoria: categoria.nombre,
                })}
              >
                {t("panel.proveedores.borrarCategoria")}
              </BotonEnvio>
            </form>
          ) : null}
        </div>
      </div>

      {categoria.descripcion ? (
        <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
          {categoria.descripcion}
        </Cuerpo>
      ) : null}

      {puedeEditar ? (
        <CorregirCategoria categoria={categoria} puesto={puesto} abierta={abierta} />
      ) : null}

      {proveedores.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {/*
            «No hay ninguno» y «el filtro no deja ver ninguno» son cosas
            distintas, y confundirlas hace creer que falta por contratar algo
            que ya está contratado.
          */}
          {filtrando && total > 0
            ? t("panel.proveedores.sinResultados")
            : t("panel.proveedores.categoriaVacia")}{" "}
          {/* Vacía, se ofrece llenarla: el alta llega con esta categoría puesta. */}
          {puedeEditar && total === 0 ? (
            <EnlaceSuave href={`${RUTA_PROVEEDORES}?categoria=${categoria.id}#${ANCLA_ALTA}`}>
              {t("panel.proveedores.anadirEn", { categoria: categoria.nombre })}
            </EnlaceSuave>
          ) : null}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno-compacto">
          {proveedores.map((proveedor) => (
            <li key={proveedor.id}>
              <Link
                href={`${RUTA_PROVEEDORES}/${proveedor.id}`}
                className="flex flex-wrap items-baseline justify-between gap-interno rounded-tarjeta border border-borde px-interno py-interno-compacto transicion-color hover:border-borde-marca hover:bg-superficie-hundida"
              >
                <span className="text-cuerpo text-tinta">{proveedor.nombre}</span>
                <span className="flex flex-wrap items-baseline gap-interno text-pequeno text-tinta-suave">
                  <span>{nombreDelEstado(proveedor.estado)}</span>
                  {euros && proveedor.importeAcordado !== null ? (
                    <span className="tabular-nums text-tinta">
                      {euros(proveedor.importeAcordado)}
                    </span>
                  ) : euros && proveedor.importePresupuestado !== null ? (
                    <span className="tabular-nums">
                      {t("panel.proveedores.presupuestado", {
                        importe: euros(proveedor.importePresupuestado),
                      })}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * CORREGIR Y MOVER UNA CATEGORÍA, plegado como corregir un servicio: es lo que
 * se hace de vez en cuando, y suelto en cada cabecera serían doce juegos de
 * botones encima de la lista. Tras mover se vuelve con el plegable abierto,
 * para poder seguir moviendo sin buscarlo otra vez.
 */
function CorregirCategoria({
  categoria,
  puesto,
  abierta,
}: {
  categoria: CategoriaProveedor;
  puesto: { primera: boolean; ultima: boolean } | null;
  abierta: boolean;
}) {
  return (
    <details className="mt-pila" open={abierta}>
      <summary
        aria-label={t("panel.proveedores.corregirCategoriaDe", { categoria: categoria.nombre })}
        className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
      >
        {t("panel.proveedores.corregirCategoria")}
      </summary>

      <form
        action={editarCategoria}
        className="mt-pila grid max-w-texto gap-interno sm:grid-cols-2 sm:items-end"
      >
        <input type="hidden" name="id" value={categoria.id} />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoNombreCategoria")}
          name="nombre"
          type="text"
          required
          maxLength={LARGOS_DE_CAMPO["categorias_proveedor.nombre"]}
          defaultValue={categoria.nombre}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoDescripcionCategoria")}
          name="descripcion"
          type="text"
          maxLength={LARGOS_DE_CAMPO["categorias_proveedor.descripcion"]}
          defaultValue={categoria.descripcion ?? ""}
        />
        <div className="sm:col-span-2">
          <BotonEnvio jerarquia="secundario">
            {t("panel.proveedores.guardarCategoria")}
          </BotonEnvio>
        </div>
      </form>

      {/* Mover sólo tiene sentido viendo la lista entera: buscando, no se ofrece. */}
      {puesto && !(puesto.primera && puesto.ultima) ? (
        <div className="mt-elemento flex flex-wrap items-center gap-x-interno">
          <span className="text-pequeno text-tinta-suave">
            {t("panel.proveedores.moverCategoria")}
          </span>
          {!puesto.primera ? (
            <form action={moverCategoria}>
              <input type="hidden" name="id" value={categoria.id} />
              <input type="hidden" name="hacia" value="arriba" />
              <BotonEnvio
                jerarquia="terciario"
                aria-label={t("panel.proveedores.subirCategoriaDe", {
                  categoria: categoria.nombre,
                })}
              >
                {t("panel.proveedores.subirCategoria")}
              </BotonEnvio>
            </form>
          ) : null}
          {!puesto.ultima ? (
            <form action={moverCategoria}>
              <input type="hidden" name="id" value={categoria.id} />
              <input type="hidden" name="hacia" value="abajo" />
              <BotonEnvio
                jerarquia="terciario"
                aria-label={t("panel.proveedores.bajarCategoriaDe", {
                  categoria: categoria.nombre,
                })}
              >
                {t("panel.proveedores.bajarCategoria")}
              </BotonEnvio>
            </form>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

/** Alta de proveedor. Sin `<details>`: el formulario está, y se ve que está. */
function FormularioProveedor({
  categorias,
  categoriaElegida,
}: {
  categorias: CategoriaProveedor[];
  /** La de «Añadir uno en…»: sin ella, el desplegable proponía la primera. */
  categoriaElegida: string | undefined;
}) {
  /*
    NO HAY DESPLEGABLE DE ESTADO AQUÍ, y no es un olvido. Un proveedor que
    acabas de apuntar está, por definición, en «investigando». Ofrecer el
    desplegable abría además un segundo camino hasta «contratado» que se
    saltaba el aviso de contratar a dos de la misma categoría — y un aviso con
    una puerta de atrás no es un aviso.
  */
  return (
    <section
      id={ANCLA_ALTA}
      className="mt-bloque scroll-mt-elemento rounded-tarjeta border border-borde p-interno"
    >
      <Titulo3 como="h2">{t("panel.proveedores.nuevoTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.proveedores.nuevoAyuda")}
      </Cuerpo>

      <form action={crearProveedor} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <CampoTexto
          etiqueta={t("panel.proveedores.campoNombre")}
          name="nombre"
          type="text"
          required
          maxLength={LARGOS_DE_CAMPO["proveedores.nombre"]}
        />
        <CampoSeleccion
          etiqueta={t("panel.proveedores.campoCategoria")}
          name="categoria_id"
          required
          // `key` para que el navegador no conserve la elegida antes al llegar
          // desde otro «Añadir uno en…».
          key={categoriaElegida ?? ""}
          defaultValue={categoriaElegida}
        >
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </CampoSeleccion>
        <CampoTexto
          etiqueta={t("panel.proveedores.campoPersona")}
          name="persona_contacto"
          type="text"
          maxLength={LARGOS_DE_CAMPO["proveedores.persona_contacto"]}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoCorreo")}
          name="correo_electronico"
          type="email"
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoTelefono")}
          name="telefono"
          type="tel"
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoWeb")}
          ayuda={t("panel.proveedores.campoWebAyuda")}
          name="sitio_web"
          type="text"
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoPresupuestado")}
          ayuda={t("panel.proveedores.campoImporteAyuda")}
          name="importe_presupuestado"
          type="text"
          inputMode="decimal"
        />

        <div className="sm:col-span-2">
          <CampoTextoLargo
            etiqueta={t("panel.proveedores.campoNotas")}
            name="notas"
            rows={3}
            maxLength={LARGOS_DE_CAMPO["proveedores.notas"]}
          />
        </div>

        <div className="sm:col-span-2">
          <BotonEnvio>{t("panel.proveedores.crear")}</BotonEnvio>
        </div>
      </form>
    </section>
  );
}

function FormularioCategoria() {
  return (
    <section className="mt-elemento rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.proveedores.nuevaCategoriaTitulo")}</Titulo3>

      <form
        action={crearCategoria}
        className="mt-elemento grid gap-interno sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <CampoTexto
          etiqueta={t("panel.proveedores.campoNombreCategoria")}
          name="nombre"
          type="text"
          required
          maxLength={LARGOS_DE_CAMPO["categorias_proveedor.nombre"]}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoDescripcionCategoria")}
          name="descripcion"
          type="text"
          maxLength={LARGOS_DE_CAMPO["categorias_proveedor.descripcion"]}
        />
        <BotonEnvio jerarquia="secundario">{t("panel.proveedores.crearCategoria")}</BotonEnvio>
      </form>
    </section>
  );
}

/**
 * BODA-71 · LO QUE FALTA POR CERRAR, ARRIBA DEL TODO
 *
 * Es la pregunta que se hace quien organiza al abrir esta pantalla, y una
 * lista de proveedores no la contesta: hay que recorrerla entera comprobando
 * categoría por categoría si alguno está contratado, buscando precisamente lo
 * que NO está. Aquí está contestada antes de mirar.
 *
 * DISTINGUE «SIN EMPEZAR» DE «HAY QUE DECIDIR», que son dos problemas
 * distintos con dos remedios distintos: una categoría con cero candidatos
 * necesita ponerse a buscar, y una con tres necesita una tarde de decidir. Un
 * único «te falta esto» los confunde y hace que el segundo parezca urgente
 * cuando el urgente es el primero.
 *
 * Y CUANDO NO FALTA NADA LO DICE, en vez de desaparecer. Un bloque que se
 * esfuma no se distingue de un bloque que no ha cargado.
 */
function SinCerrar({
  categorias,
  puedeEditar,
}: {
  categorias: CategoriaSinCerrar[];
  puedeEditar: boolean;
}) {
  if (categorias.length === 0) {
    return (
      <p className="mt-elemento rounded-campo bg-exito-fondo p-interno text-pequeno text-exito-tinta">
        {t("panel.proveedores.todoCerrado")}
      </p>
    );
  }

  return (
    <section className="mt-elemento rounded-tarjeta border border-borde bg-superficie-tenue p-interno">
      <Titulo3 como="h2">{t("panel.proveedores.sinCerrarTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.proveedores.sinCerrarAyuda")}
      </Cuerpo>

      <ul className="mt-elemento flex flex-wrap gap-interno-compacto">
        {categorias.map((categoria) => (
          <EtiquetaEstado
            como="li"
            key={categoria.id}
            variante="superficie"
            tamano="compacta"
            className="px-interno"
          >
            {/*
              CADA CHIP LLEVA A DONDE SE ARREGLA: la sin empezar, al alta con
              su categoría puesta; la que tiene candidatos, a su sección. Antes
              no llevaban a ninguna parte y había que bajar a buscarlo.
            */}
            <Link
              href={
                categoria.candidatos === 0 && puedeEditar
                  ? `${RUTA_PROVEEDORES}?categoria=${categoria.id}#${ANCLA_ALTA}`
                  : `#${anclaDeCategoria(categoria.id)}`
              }
              className="inline-flex min-h-control-compacto items-center underline decoration-borde-fuerte underline-offset-4"
            >
              {categoria.nombre}
            </Link>{" "}
            <span className="text-tinta-suave">
              ·{" "}
              {categoria.candidatos === 0
                ? t("panel.proveedores.sinCerrarSinEmpezar")
                : categoria.candidatos === 1
                  ? t("panel.proveedores.sinCerrarCandidatoUno")
                  : t("panel.proveedores.sinCerrarCandidatos", {
                      cuantos: categoria.candidatos,
                    })}
            </span>
          </EtiquetaEstado>
        ))}
      </ul>
    </section>
  );
}
