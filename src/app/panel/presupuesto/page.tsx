import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO } from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import {
  loQueVaCostando,
  obtenerCategoriasPresupuesto,
  obtenerResumenPresupuesto,
  type CategoriaPresupuesto,
  type ResumenCategoria,
} from "@/lib/bbdd/presupuesto";
import { t } from "@/lib/copy";
import { formateadorDeImporte } from "@/lib/importe";
import { accesoActual } from "@/lib/sesion";

import { borrarCategoria, crearCategoria, editarCategoria } from "./acciones";
import { AvisoPresupuesto } from "./aviso";

/**
 * BODA-60 · CATEGORÍAS DE PRESUPUESTO
 *
 * El armazón del presupuesto: banquete, fotografía, música, flores, trajes. Sin
 * ellas los gastos son una lista plana de cuarenta líneas en la que no se ve
 * nada — y lo que hay que ver no es cuántas líneas hay, es en qué se está
 * yendo el dinero.
 *
 * PREVISTO ENFRENTE DE LO QUE VA COSTANDO, en la misma fila. Una tabla de
 * presupuestos sin la realidad al lado es una lista de deseos: se mira una vez
 * al empezar y no se vuelve a abrir.
 *
 * LA DESVIACIÓN USA EL IMPORTE REAL CUANDO EXISTE Y EL ESTIMADO MIENTRAS NO, y
 * la calcula la base. Es la cifra que de verdad interesa —«¿me estoy
 * pasando?»— y no la suma de lo ya pagado, que la semana antes de la boda es
 * siempre tranquilizadora y siempre falsa.
 *
 * UN LECTOR VE PERO NO CREA: la protección de verdad es RLS; esto es no
 * ofrecer un formulario que va a fallar al enviarlo.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

export default async function PaginaPresupuesto({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const estado = soloTexto(consulta.estado);

  const [categorias, resumen, moneda] = await Promise.all([
    obtenerCategoriasPresupuesto(),
    obtenerResumenPresupuesto(),
    obtenerMonedaBoda(),
  ]);

  const puedeEditar = acceso.rol !== "lector";

  /*
    Sin moneda configurada no se enseñan importes. Un «21.400» a secas en una
    pantalla de presupuesto invita a leerlo en euros, y si esta boda se paga en
    otra cosa eso es peor que no decir nada. El resto de la pantalla funciona.
  */
  const euros = moneda ? formateadorDeImporte(moneda) : null;

  const totales = resumen.reduce(
    (suma, fila) => ({
      previsto: suma.previsto + fila.importePrevisto,
      real: suma.real + loQueVaCostando(fila),
    }),
    { previsto: 0, real: 0 },
  );

  const aDecidir = estado === "decidir-gastos" ? soloTexto(consulta.categoria) : "";

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.presupuesto.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.presupuesto.descripcion")}</Cuerpo>
      </header>

      <AvisoPresupuesto estado={estado} />

      {aDecidir && puedeEditar ? (
        <DecidirGastos
          categoriaId={aDecidir}
          categorias={categorias.filter((categoria) => categoria.id !== aDecidir)}
        />
      ) : null}

      {resumen.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto">{t("panel.presupuesto.vacio")}</Cuerpo>
      ) : (
        <Tabla resumen={resumen} totales={totales} euros={euros} />
      )}

      {puedeEditar ? (
        <>
          <Edicion categorias={categorias} />
          <Alta />
        </>
      ) : null}
    </>
  );
}

/**
 * LA TABLA, CON SU EQUIVALENTE LEGIBLE EN MÓVIL.
 *
 * Es una sola tabla y no dos maquetaciones: en móvil se desplaza en horizontal
 * dentro de su contenedor. Duplicar la tabla en tarjetas para pantallas
 * pequeñas duplica también el sitio donde una cifra puede quedarse vieja.
 */
function Tabla({
  resumen,
  totales,
  euros,
}: {
  resumen: ResumenCategoria[];
  totales: { previsto: number; real: number };
  euros: ((valor: number) => string) | null;
}) {
  const importe = (valor: number) => (euros ? euros(valor) : "");

  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.presupuesto.resumenTitulo")}</Titulo3>

      <div className="mt-elemento overflow-x-auto">
        <table className="w-full border-collapse text-pequeno">
          <thead>
            <tr className="border-b border-borde text-left">
              <th className="py-linea pr-interno font-normal text-tinta-tenue">
                {t("panel.presupuesto.columnaCategoria")}
              </th>
              <th className="py-linea pr-interno text-right font-normal text-tinta-tenue">
                {t("panel.presupuesto.columnaPrevisto")}
              </th>
              <th className="py-linea pr-interno text-right font-normal text-tinta-tenue">
                {t("panel.presupuesto.columnaGastado")}
              </th>
              <th className="py-linea pr-interno text-right font-normal text-tinta-tenue">
                {t("panel.presupuesto.columnaPagado")}
              </th>
              <th className="py-linea text-right font-normal text-tinta-tenue">
                {t("panel.presupuesto.columnaDesviacion")}
              </th>
            </tr>
          </thead>
          <tbody>
            {resumen.map((fila) => (
              <tr key={fila.categoriaId} className="border-b border-borde">
                <td className="py-linea pr-interno text-tinta">{fila.categoria}</td>
                <td className="py-linea pr-interno text-right tabular-nums text-tinta-suave">
                  {importe(fila.importePrevisto)}
                </td>
                <td className="py-linea pr-interno text-right tabular-nums text-tinta">
                  {importe(loQueVaCostando(fila))}
                </td>
                <td className="py-linea pr-interno text-right tabular-nums text-tinta-suave">
                  {importe(fila.pagado)}
                </td>
                {/*
                  PASARSE NO SE MARCA SÓLO CON COLOR. El signo ya lo dice —la
                  desviación negativa es lo que sobra— y además lleva su
                  palabra, porque un rojo no lo lee ni un daltónico ni un lector
                  de pantalla ni nadie con el sol de junio en la pantalla.
                */}
                <td
                  className={`py-linea text-right tabular-nums ${
                    fila.desviacion < 0 ? "text-error" : "text-tinta-suave"
                  }`}
                >
                  {importe(fila.desviacion)}
                  {fila.desviacion < 0 ? (
                    <span className="ml-interno-compacto text-etiqueta uppercase tracking-etiqueta">
                      {t("panel.presupuesto.pasado")}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="py-interno-compacto pr-interno text-left font-normal text-tinta">
                {t("panel.presupuesto.total")}
              </th>
              <td className="py-interno-compacto pr-interno text-right tabular-nums text-tinta">
                {importe(totales.previsto)}
              </td>
              <td className="py-interno-compacto pr-interno text-right tabular-nums text-tinta">
                {importe(totales.real)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/**
 * A DÓNDE VAN LOS GASTOS, QUE ES LA PREGUNTA DE VERDAD.
 *
 * Borrar una categoría con gastos no es «¿seguro?»: la base se niega —
 * `on delete restrict`— y hace bien, porque arrastrarlos falsearía el
 * presupuesto y dejarlos sueltos no es posible. Lo único que hay que decidir es
 * dónde se quedan.
 */
function DecidirGastos({
  categoriaId,
  categorias,
}: {
  categoriaId: string;
  categorias: CategoriaPresupuesto[];
}) {
  return (
    <section className="mt-elemento rounded-tarjeta border border-error bg-error-fondo p-interno">
      <Titulo3 como="h2">{t("panel.presupuesto.decidirTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.presupuesto.decidirAyuda")}
      </Cuerpo>

      {categorias.length === 0 ? (
        // Sin otra categoría a la que moverlos no hay decisión que ofrecer, y
        // un desplegable vacío sería una trampa: se pulsa y no puede pasar nada.
        <Cuerpo className="mt-elemento max-w-texto text-pequeno">
          {t("panel.presupuesto.decidirSinDestino")}
        </Cuerpo>
      ) : (
        <form
          action={borrarCategoria}
          className="mt-elemento grid gap-interno sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <input type="hidden" name="id" value={categoriaId} />
          <CampoSeleccion
            etiqueta={t("panel.presupuesto.campoDestino")}
            name="destino"
            required
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </CampoSeleccion>
          <Boton type="submit">{t("panel.presupuesto.moverYBorrar")}</Boton>
        </form>
      )}
    </section>
  );
}

/**
 * Editar y borrar, una fila por categoría.
 *
 * El orden se teclea en lugar de arrastrarse: arrastrar deja fuera al teclado y
 * al lector de pantalla si es la única forma, y aquí lo que se ordena son ocho
 * filas que se colocan una vez y no se vuelven a tocar.
 */
function Edicion({ categorias }: { categorias: CategoriaPresupuesto[] }) {
  if (categorias.length === 0) return null;

  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.presupuesto.editarTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-tenue">
        {t("panel.presupuesto.editarAyuda")}
      </Cuerpo>

      <ul className="mt-elemento grid gap-interno">
        {categorias.map((categoria) => (
          <li key={categoria.id} className="rounded-tarjeta border border-borde p-interno">
            <form
              action={editarCategoria}
              className="grid gap-interno sm:grid-cols-[2fr_1fr_auto_auto] sm:items-end"
            >
              <input type="hidden" name="id" value={categoria.id} />
              <CampoTexto
                etiqueta={t("panel.presupuesto.campoNombre")}
                name="nombre"
                type="text"
                required
                maxLength={80}
                defaultValue={categoria.nombre}
              />
              <CampoTexto
                etiqueta={t("panel.presupuesto.campoPrevisto")}
                name="importe_previsto"
                type="text"
                inputMode="decimal"
                defaultValue={String(categoria.importePrevisto)}
              />
              <CampoTexto
                etiqueta={t("panel.presupuesto.campoOrden")}
                name="orden"
                type="number"
                min={0}
                defaultValue={String(categoria.orden)}
              />
              <Boton type="submit" jerarquia="secundario">
                {t("panel.presupuesto.guardar")}
              </Boton>
            </form>

            <form action={borrarCategoria} className="mt-interno-compacto">
              <input type="hidden" name="id" value={categoria.id} />
              <Boton type="submit" jerarquia="terciario">
                {t("panel.presupuesto.borrar")}
              </Boton>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Alta() {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.presupuesto.nuevaTitulo")}</Titulo3>
      <Etiqueta className="mt-pila block">{t("panel.presupuesto.nuevaAyuda")}</Etiqueta>

      <form
        action={crearCategoria}
        className="mt-elemento grid gap-interno sm:grid-cols-[2fr_1fr_auto_auto] sm:items-end"
      >
        <CampoTexto
          etiqueta={t("panel.presupuesto.campoNombre")}
          name="nombre"
          type="text"
          required
          maxLength={80}
        />
        <CampoTexto
          etiqueta={t("panel.presupuesto.campoPrevisto")}
          ayuda={t("panel.presupuesto.campoPrevistoAyuda")}
          name="importe_previsto"
          type="text"
          inputMode="decimal"
        />
        <CampoTexto
          etiqueta={t("panel.presupuesto.campoOrden")}
          name="orden"
          type="number"
          min={0}
        />
        <Boton type="submit">{t("panel.presupuesto.crear")}</Boton>
      </form>
    </section>
  );
}
