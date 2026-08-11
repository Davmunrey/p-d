import Link from "next/link";
import { redirect } from "next/navigation";

import { EnlaceSuave } from "@/components/ui/enlace-suave";
import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_GASTOS, RUTA_PRESUPUESTO } from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import {
  loQueVaCostando,
  obtenerCategoriasPresupuesto,
  obtenerGastos,
  obtenerResumenPresupuesto,
  porCategoria,
  type CategoriaPresupuesto,
  type Gasto,
  type ResumenCategoria,
} from "@/lib/bbdd/presupuesto";
import { obtenerProveedores, type Proveedor } from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";
import { formateadorDeImporte } from "@/lib/importe";
import { accesoActual } from "@/lib/sesion";

import { borrarGasto, crearGasto, editarGasto } from "./acciones";
import { AvisoGastos } from "./aviso";

/**
 * BODA-61 · LOS GASTOS, UNO A UNO
 *
 * DOS IMPORTES Y NO UNO, porque son dos preguntas distintas: lo estimado es lo
 * que se calcula que costará —y con eso se decide si la boda cabe— y lo acordado
 * es lo que ya está cerrado con el proveedor. Mientras no hay acuerdo, la
 * columna dice «sin cerrar» y no «0,00 €»: un cero ahí sería un proveedor que
 * sale gratis, y ese ahorro inventado se colaría en la desviación.
 *
 * LOS TOTALES LOS SUMA LA BASE. Están arriba, encima de la lista, y se leen de
 * `v_resumen_presupuesto` en la misma carga: apuntar un gasto y ver cómo cambia
 * el total sin ir a buscarlo a otra pantalla es toda la razón de que esta lista
 * exista. Sumarlos aquí con los importes ya convertidos a coma flotante daría
 * «21.399,999999999996 €» en la pantalla que decide si esto cabe.
 *
 * AGRUPADOS POR CATEGORÍA, no en una lista plana. Cuarenta gastos seguidos no
 * responden a la única pregunta que trae a alguien aquí, que es en qué se está
 * yendo el dinero.
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

export default async function PaginaGastos({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const estado = soloTexto(consulta.estado);

  /*
    CUÁL ESTÁ ABIERTO VIVE EN LA URL Y NO EN EL NAVEGADOR.

    Así funciona sin una línea de JavaScript, se puede compartir el enlace de un
    gasto concreto, y el botón de atrás lo cierra — que es lo que espera quien lo
    pulsa. Guardarlo en estado de cliente costaría hidratación en una pantalla
    que se abre desde el móvil, en el pueblo donde es la boda.
  */
  const editando = soloTexto(consulta.editar);

  const [categorias, resumen, gastos, proveedores, moneda] = await Promise.all([
    obtenerCategoriasPresupuesto(),
    obtenerResumenPresupuesto(),
    obtenerGastos(),
    obtenerProveedores(),
    obtenerMonedaBoda(),
  ]);

  const puedeEditar = acceso.rol !== "lector";

  /*
    Sin moneda configurada no se enseñan importes. Un «8.600» a secas invita a
    leerlo en euros, y si esta boda se paga en otra cosa eso es peor que no
    decir nada. El resto de la pantalla funciona.
  */
  const euros = moneda ? formateadorDeImporte(moneda) : null;

  const totales = resumen.reduce(
    (suma, fila) => ({
      previsto: suma.previsto + fila.importePrevisto,
      real: suma.real + loQueVaCostando(fila),
    }),
    { previsto: 0, real: 0 },
  );

  const agrupados = porCategoria(gastos);

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.presupuesto.gastos.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.presupuesto.gastos.descripcion")}</Cuerpo>
        <EnlaceSuave href={RUTA_PRESUPUESTO} className="mt-pila">
          {t("panel.presupuesto.gastos.volver")}
        </EnlaceSuave>
      </header>

      <AvisoGastos estado={estado} />

      <Totales totales={totales} euros={euros} />

      {categorias.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">
          {t("panel.presupuesto.gastos.sinCategorias")}
        </Cuerpo>
      ) : (
        <>
          {gastos.length === 0 ? (
            <Cuerpo className="mt-bloque max-w-texto">
              {t("panel.presupuesto.gastos.vacio")}
            </Cuerpo>
          ) : (
            <div className="mt-bloque grid gap-bloque">
              {/*
                UN `div` Y NO UN `section`: esto sólo coloca las categorías en
                rejilla y no tiene título propio. Un `section` sin encabezado es
                un hito de navegación sin nombre —el lector de pantalla anuncia
                «región» y no dice de qué— y además envuelve a los `section` de
                cada categoría, así que buscar «la sección de Flores»
                encontraría dos: la de Flores y la que la contiene.
              */}
              {resumen.map((fila) => (
                <Categoria
                  key={fila.categoriaId}
                  fila={fila}
                  gastos={agrupados.get(fila.categoriaId) ?? []}
                  categorias={categorias}
                  proveedores={proveedores}
                  puedeEditar={puedeEditar}
                  editando={editando}
                  euros={euros}
                />
              ))}
            </div>
          )}

          {puedeEditar ? <Alta categorias={categorias} proveedores={proveedores} /> : null}
        </>
      )}
    </>
  );
}

/**
 * EL TOTAL, ARRIBA Y NO AL FINAL.
 *
 * Es la cifra por la que se entra a esta pantalla, y ponerla debajo de cuarenta
 * gastos la esconde justo cuando más se mira: después de apuntar uno.
 */
function Totales({
  totales,
  euros,
}: {
  totales: { previsto: number; real: number };
  euros: ((valor: number) => string) | null;
}) {
  if (!euros) return null;

  return (
    <section className="mt-elemento rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.presupuesto.gastos.totalTitulo")}</Titulo3>
      <dl className="mt-elemento flex flex-wrap gap-bloque">
        <div>
          <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
            {t("panel.presupuesto.gastos.totalPrevisto")}
          </dt>
          <dd className="mt-linea text-titulo-3 tabular-nums text-tinta-suave">
            {euros(totales.previsto)}
          </dd>
        </div>
        <div>
          <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
            {t("panel.presupuesto.gastos.totalReal")}
          </dt>
          <dd className="mt-linea text-titulo-3 tabular-nums text-tinta">
            {euros(totales.real)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * Una categoría con sus gastos dentro, y su subtotal al lado del nombre.
 *
 * El subtotal sale de `loQueVaCostando`, que se despeja de la desviación que
 * calcula la vista: sumar aquí las partidas con otro criterio es exactamente
 * cómo dos cifras de la misma pantalla acaban sin cuadrar.
 */
function Categoria({
  fila,
  gastos,
  categorias,
  proveedores,
  puedeEditar,
  editando,
  euros,
}: {
  fila: ResumenCategoria;
  gastos: Gasto[];
  categorias: CategoriaPresupuesto[];
  proveedores: Proveedor[];
  puedeEditar: boolean;
  editando: string;
  euros: ((valor: number) => string) | null;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-linea">
        <Titulo3 como="h2">{fila.categoria}</Titulo3>
        {euros ? (
          <Etiqueta className="tabular-nums">
            {t("panel.presupuesto.gastos.subtotal")} {euros(loQueVaCostando(fila))}
          </Etiqueta>
        ) : null}
      </div>

      {gastos.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-tenue">
          {t("panel.presupuesto.gastos.sinGastos")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno">
          {gastos.map((gasto) => (
            <li
              key={gasto.id}
              id={`gasto-${gasto.id}`}
              className="rounded-tarjeta border border-borde p-interno"
            >
              {puedeEditar && editando === gasto.id ? (
                <Edicion gasto={gasto} categorias={categorias} proveedores={proveedores} />
              ) : (
                <Fila gasto={gasto} puedeEditar={puedeEditar} euros={euros} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * UN GASTO, EN UNA LÍNEA QUE SE LEE DE UN VISTAZO.
 *
 * Y NO EL FORMULARIO ABIERTO. Una boda tiene cuarenta gastos: cuarenta
 * formularios desplegados son casi trescientos campos en una sola página, y
 * entonces la lista ya no contesta la pregunta por la que se entra —«¿en qué se
 * me está yendo el dinero?»— porque no se puede recorrer. Se abre el que se va a
 * tocar, con `?editar=`, y los demás siguen siendo una lista.
 *
 * QUIEN NO PUEDE EDITAR VE EXACTAMENTE ESTO, sin los dos enlaces. No un
 * formulario en gris: un campo que no se deja tocar es una promesa incumplida, y
 * la misma información sin la promesa es mejor.
 *
 * LO ACORDADO VA GRANDE Y LO ESTIMADO DEBAJO porque la pregunta es «cuánto
 * cuesta»; el estimado es el contexto de por qué esa cifra no está todavía. Y
 * mientras no hay acuerdo se dice «sin cerrar», nunca «0,00 €».
 */
function Fila({
  gasto,
  puedeEditar,
  euros,
}: {
  gasto: Gasto;
  puedeEditar: boolean;
  euros: ((valor: number) => string) | null;
}) {
  const importe = (valor: number | null) =>
    valor === null ? t("panel.presupuesto.gastos.sinCerrar") : euros ? euros(valor) : "";

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-interno">
      <div>
        <span className="text-cuerpo text-tinta">{gasto.concepto}</span>
        <span className="mt-linea block text-pequeno text-tinta-tenue">
          {gasto.proveedor ?? t("panel.presupuesto.gastos.sinProveedor")}
          {/* Pagada lleva su palabra y no sólo un color: un punto verde no lo
              lee ni un daltónico ni un lector de pantalla. */}
          {gasto.pagada ? ` · ${t("panel.presupuesto.gastos.pagada")}` : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-interno">
        <div className="text-right">
          <span className="block text-cuerpo tabular-nums text-tinta">
            {importe(gasto.importeReal)}
          </span>
          <span className="mt-linea block text-pequeno tabular-nums text-tinta-tenue">
            {t("panel.presupuesto.gastos.columnaEstimado")} {importe(gasto.importeEstimado)}
          </span>
        </div>

        {puedeEditar ? (
          <div className="flex items-baseline gap-interno">
            {/*
              UN ENLACE Y NO UN BOTÓN: abrir la edición es ir a otra dirección
              —la misma lista con este gasto abierto— y eso se puede compartir,
              abrir en otra pestaña y deshacer con el botón de atrás. El ancla
              devuelve la vista al gasto en vez de al principio de la página.
            */}
            <Link
              href={`${RUTA_GASTOS}?editar=${gasto.id}#gasto-${gasto.id}`}
              className="inline-flex min-h-control-compacto items-center text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
            >
              {t("panel.presupuesto.gastos.editar")}
            </Link>
            <form action={borrarGasto}>
              <input type="hidden" name="id" value={gasto.id} />
              <Boton type="submit" jerarquia="terciario">
                {t("panel.presupuesto.gastos.borrar")}
              </Boton>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * El gasto abierto: sus seis datos, y la salida sin guardar.
 */
function Edicion({
  gasto,
  categorias,
  proveedores,
}: {
  gasto: Gasto;
  categorias: CategoriaPresupuesto[];
  proveedores: Proveedor[];
}) {
  return (
    <>
      <form action={editarGasto} className="grid gap-interno sm:grid-cols-2">
        <input type="hidden" name="id" value={gasto.id} />

        <CampoTexto
          etiqueta={t("panel.presupuesto.gastos.campoConcepto")}
          name="concepto"
          type="text"
          required
          maxLength={160}
          defaultValue={gasto.concepto}
        />
        <CampoSeleccion
          etiqueta={t("panel.presupuesto.gastos.campoCategoria")}
          name="categoria_id"
          required
          defaultValue={gasto.categoriaId}
        >
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </CampoSeleccion>

        <CampoTexto
          etiqueta={t("panel.presupuesto.gastos.campoEstimado")}
          name="importe_estimado"
          type="text"
          inputMode="decimal"
          defaultValue={String(gasto.importeEstimado)}
        />
        <CampoTexto
          etiqueta={t("panel.presupuesto.gastos.campoAcordado")}
          name="importe_real"
          type="text"
          inputMode="decimal"
          defaultValue={gasto.importeReal === null ? "" : String(gasto.importeReal)}
        />

        <CampoSeleccion
          etiqueta={t("panel.presupuesto.gastos.campoProveedor")}
          name="proveedor_id"
          defaultValue={gasto.proveedorId ?? ""}
        >
          <option value="">{t("panel.presupuesto.gastos.sinProveedor")}</option>
          {proveedores.map((proveedor) => (
            <option key={proveedor.id} value={proveedor.id}>
              {proveedor.nombre}
            </option>
          ))}
        </CampoSeleccion>

        <label className="flex items-center gap-interno-compacto text-pequeno text-tinta">
          <input
            type="checkbox"
            name="pagada"
            value="si"
            defaultChecked={gasto.pagada}
            className="size-casilla accent-marca"
          />
          {t("panel.presupuesto.gastos.campoPagada")}
        </label>

        <CampoTextoLargo
          etiqueta={t("panel.presupuesto.gastos.campoDescripcion")}
          name="descripcion"
          rows={2}
          maxLength={2000}
          defaultValue={gasto.descripcion ?? ""}
        />

        <div className="flex flex-wrap items-baseline gap-interno sm:col-span-2">
          <Boton type="submit" jerarquia="secundario">
            {t("panel.presupuesto.gastos.guardar")}
          </Boton>
          {/*
            SALIR SIN GUARDAR TIENE QUE ESTAR. Sin esta salida, quien abre la
            edición por curiosidad sólo puede cerrarla guardando o retrocediendo
            en el navegador — y lo primero escribe lo que hubiera tocado sin
            querer.
          */}
          <Link
            href={`${RUTA_GASTOS}#gasto-${gasto.id}`}
            className="inline-flex min-h-control-compacto items-center text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca"
          >
            {t("panel.presupuesto.gastos.cancelar")}
          </Link>
        </div>
      </form>

      <form action={borrarGasto} className="mt-interno-compacto">
        <input type="hidden" name="id" value={gasto.id} />
        <Boton type="submit" jerarquia="terciario">
          {t("panel.presupuesto.gastos.borrar")}
        </Boton>
      </form>
    </>
  );
}

function Alta({
  categorias,
  proveedores,
}: {
  categorias: CategoriaPresupuesto[];
  proveedores: Proveedor[];
}) {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.presupuesto.gastos.nuevaTitulo")}</Titulo3>
      <Etiqueta className="mt-pila block">{t("panel.presupuesto.gastos.nuevaAyuda")}</Etiqueta>

      <form action={crearGasto} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <CampoTexto
          etiqueta={t("panel.presupuesto.gastos.campoConcepto")}
          name="concepto"
          type="text"
          required
          maxLength={160}
        />
        <CampoSeleccion
          etiqueta={t("panel.presupuesto.gastos.campoCategoria")}
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
          etiqueta={t("panel.presupuesto.gastos.campoEstimado")}
          ayuda={t("panel.presupuesto.gastos.campoEstimadoAyuda")}
          name="importe_estimado"
          type="text"
          inputMode="decimal"
        />
        <CampoTexto
          etiqueta={t("panel.presupuesto.gastos.campoAcordado")}
          ayuda={t("panel.presupuesto.gastos.campoAcordadoAyuda")}
          name="importe_real"
          type="text"
          inputMode="decimal"
        />

        <CampoSeleccion
          etiqueta={t("panel.presupuesto.gastos.campoProveedor")}
          name="proveedor_id"
        >
          <option value="">{t("panel.presupuesto.gastos.sinProveedor")}</option>
          {proveedores.map((proveedor) => (
            <option key={proveedor.id} value={proveedor.id}>
              {proveedor.nombre}
            </option>
          ))}
        </CampoSeleccion>

        <CampoTextoLargo
          etiqueta={t("panel.presupuesto.gastos.campoDescripcion")}
          name="descripcion"
          rows={2}
          maxLength={2000}
        />

        <div className="sm:col-span-2">
          <Boton type="submit">{t("panel.presupuesto.gastos.crear")}</Boton>
        </div>
      </form>
    </section>
  );
}
