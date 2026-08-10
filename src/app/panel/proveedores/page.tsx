import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_PROVEEDORES } from "@/config/constants";
import {
  contarPorCategoria,
  ESTADOS_PROVEEDOR,
  obtenerCategoriasProveedor,
  obtenerMonedaBoda,
  obtenerProveedores,
  type CategoriaProveedor,
  type Proveedor,
} from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { normalizar } from "@/lib/texto";

import { borrarCategoria, crearCategoria, crearProveedor } from "./acciones";
import { AvisoProveedores } from "./aviso";
import { formateadorDeImporte, nombreDelEstado } from "./formato";

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

/** Encuentra por nombre, por contacto y por lo apuntado en las notas. */
function coincide(proveedor: Proveedor, busqueda: string): boolean {
  if (!busqueda) return true;
  const aguja = normalizar(busqueda);
  return [
    proveedor.nombre,
    proveedor.personaContacto,
    proveedor.correoElectronico,
    proveedor.telefono,
    proveedor.notas,
  ].some((campo) => campo && normalizar(campo).includes(aguja));
}

export default async function PaginaProveedores({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const busqueda = soloTexto(consulta.buscar);
  const filtroEstado = soloTexto(consulta.estado_filtro);

  const [categorias, proveedores, moneda] = await Promise.all([
    obtenerCategoriasProveedor(),
    obtenerProveedores(),
    obtenerMonedaBoda(),
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

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.proveedores.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.proveedores.descripcion")}</Cuerpo>
      </header>

      <AvisoProveedores estado={soloTexto(consulta.estado)} />

      <form
        method="get"
        className="mt-bloque grid items-end gap-interno sm:grid-cols-[1fr_auto_auto]"
      >
        <CampoTexto
          etiqueta={t("panel.proveedores.buscar")}
          ayuda={t("panel.proveedores.buscarAyuda")}
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
        <Boton type="submit" jerarquia="secundario">
          {t("panel.proveedores.buscar")}
        </Boton>
      </form>

      {categorias.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">
          {t("panel.proveedores.sinCategorias")}
        </Cuerpo>
      ) : (
        <div className="mt-bloque grid gap-bloque">
          {categorias.map((categoria) => (
            <SeccionCategoria
              key={categoria.id}
              categoria={categoria}
              proveedores={visibles.filter(
                (proveedor) => proveedor.categoriaId === categoria.id,
              )}
              /* Cuántos hay DE VERDAD, no cuántos pasan el filtro: es lo que
                 decide si se puede borrar la categoría, y decirlo sobre la
                 lista filtrada ofrecería borrar una que sí tiene gente. */
              total={totales.get(categoria.id) ?? 0}
              filtrando={Boolean(busqueda || filtroEstado)}
              euros={euros}
              puedeEditar={puedeEditar}
            />
          ))}
        </div>
      )}

      {puedeEditar && categorias.length > 0 ? (
        <FormularioProveedor categorias={categorias} />
      ) : null}

      {puedeEditar ? <FormularioCategoria /> : null}
    </>
  );
}

function SeccionCategoria({
  categoria,
  proveedores,
  total,
  filtrando,
  euros,
  puedeEditar,
}: {
  categoria: CategoriaProveedor;
  proveedores: Proveedor[];
  total: number;
  filtrando: boolean;
  euros: ((importe: number) => string) | null;
  puedeEditar: boolean;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-interno-compacto">
        <Titulo3 como="h2">{categoria.nombre}</Titulo3>
        <div className="flex items-baseline gap-interno">
          <Etiqueta>
            {total === 1
              ? t("panel.proveedores.cuantosUno")
              : t("panel.proveedores.cuantos", { cuantos: total })}
          </Etiqueta>

          {/*
            BORRAR SÓLO SI ESTÁ VACÍA, y el botón se quita en vez de
            deshabilitarse. La base lo impide igualmente —`on delete restrict`
            desde `proveedores`— pero ofrecer un botón que sólo puede dar un
            error es peor que no ofrecerlo: obliga a probarlo para saberlo.
          */}
          {puedeEditar && total === 0 ? (
            <form action={borrarCategoria}>
              <input type="hidden" name="id" value={categoria.id} />
              <Boton type="submit" jerarquia="terciario">
                {t("panel.proveedores.borrarCategoria")}
              </Boton>
            </form>
          ) : null}
        </div>
      </div>

      {categoria.descripcion ? (
        <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-tenue">
          {categoria.descripcion}
        </Cuerpo>
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
            : t("panel.proveedores.categoriaVacia")}
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

/** Alta de proveedor. Sin `<details>`: el formulario está, y se ve que está. */
function FormularioProveedor({ categorias }: { categorias: CategoriaProveedor[] }) {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.proveedores.nuevoTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-tenue">
        {t("panel.proveedores.nuevoAyuda")}
      </Cuerpo>

      <form action={crearProveedor} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <CampoTexto
          etiqueta={t("panel.proveedores.campoNombre")}
          name="nombre"
          type="text"
          required
          maxLength={160}
        />
        <CampoSeleccion
          etiqueta={t("panel.proveedores.campoCategoria")}
          name="categoria_id"
          required
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
          maxLength={120}
        />
        <CampoSeleccion etiqueta={t("panel.proveedores.campoEstado")} name="estado">
          {ESTADOS_PROVEEDOR.map((estado) => (
            <option key={estado} value={estado}>
              {nombreDelEstado(estado)}
            </option>
          ))}
        </CampoSeleccion>
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
            maxLength={4000}
          />
        </div>

        <div className="sm:col-span-2">
          <Boton type="submit">{t("panel.proveedores.crear")}</Boton>
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
          maxLength={80}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoDescripcionCategoria")}
          name="descripcion"
          type="text"
          maxLength={500}
        />
        <Boton type="submit" jerarquia="secundario">
          {t("panel.proveedores.crearCategoria")}
        </Boton>
      </form>
    </section>
  );
}
