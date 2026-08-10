import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_PROVEEDORES } from "@/config/constants";
import {
  ESTADOS_PROVEEDOR,
  obtenerCategoriasProveedor,
  obtenerFichaProveedor,
  obtenerMonedaBoda,
  type ContactoProveedor,
  type FichaProveedor,
} from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { anadirContacto, borrarProveedor, editarProveedor, quitarContacto } from "../acciones";
import { AvisoProveedores } from "../aviso";
import { formateadorDeImporte, nombreDelEstado } from "../formato";

/**
 * BODA-70 · LA FICHA DE UN PROVEEDOR
 *
 * Todo lo que hay que saber de él en una pantalla: sus datos, su gente y lo
 * que cuelga de él. No hay modo lectura y modo edición — el formulario ES la
 * ficha, con los valores puestos. Un botón de «editar» que cambia la pantalla
 * entera es un paso de más para algo que se hace desde el móvil mientras se
 * habla por teléfono con el catering.
 *
 * SIN JAVASCRIPT, como el resto del panel: cada formulario hace `POST` a una
 * acción de servidor y vuelve con el resultado en la URL.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

export default async function PaginaProveedor({ params, searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const { id } = await params;
  const consulta = await searchParams;

  const [proveedor, categorias, moneda] = await Promise.all([
    obtenerFichaProveedor(id),
    obtenerCategoriasProveedor(),
    obtenerMonedaBoda(),
  ]);

  // No existe, o quien mira no puede verlo: RLS no distingue esos dos casos y
  // la pantalla tampoco debe hacerlo. Decir «existe pero no puedes» ya cuenta
  // algo de una tabla que esa persona no tiene por qué conocer.
  if (!proveedor) {
    return (
      <>
        <Titulo2 como="h1">{t("panel.proveedores.noExisteTitulo")}</Titulo2>
        <Cuerpo className="mt-pila max-w-texto">{t("panel.proveedores.errorNoExiste")}</Cuerpo>
        <div className="mt-elemento">
          <Link href={RUTA_PROVEEDORES} className="text-pequeno text-tinta-marca underline">
            {t("panel.proveedores.volver")}
          </Link>
        </div>
      </>
    );
  }

  const puedeEditar = acceso.rol !== "lector";
  const euros = moneda ? formateadorDeImporte(moneda) : null;
  const estado = soloTexto(consulta.estado);

  return (
    <>
      <div className="max-w-texto">
        <Link href={RUTA_PROVEEDORES} className="text-pequeno text-tinta-suave underline">
          {t("panel.proveedores.volver")}
        </Link>
        <Titulo2 como="h1" className="mt-pila">
          {proveedor.nombre}
        </Titulo2>
        <Etiqueta className="mt-pila block">
          {proveedor.categoriaNombre} · {nombreDelEstado(proveedor.estado)}
        </Etiqueta>
      </div>

      <AvisoProveedores estado={estado} />

      {/*
        EL AVISO DE BORRADO ES UNA PANTALLA, NO UN `confirm()`.
        Un diálogo del navegador no dice QUÉ se pierde. Aquí se enumeran los
        gastos que se quedarían sin proveedor, con su importe, y el botón que
        confirma lleva el dato dentro: sin JavaScript y sin ambigüedad.
      */}
      {estado === "confirmar-borrado" && puedeEditar ? (
        <ConfirmarBorrado proveedor={proveedor} euros={euros} />
      ) : null}

      <Datos proveedor={proveedor} euros={euros} />

      <Contactos proveedor={proveedor} puedeEditar={puedeEditar} />

      {puedeEditar ? (
        <>
          <Edicion proveedor={proveedor} categorias={categorias} />
          <Borrado proveedor={proveedor} />
        </>
      ) : null}
    </>
  );
}

/** Lo que hay, de un vistazo. Los huecos no se pintan: un «—» no informa. */
function Datos({
  proveedor,
  euros,
}: {
  proveedor: FichaProveedor;
  euros: ((importe: number) => string) | null;
}) {
  const filas: { etiqueta: string; valor: string | null; enlace?: string }[] = [
    { etiqueta: t("panel.proveedores.campoPersona"), valor: proveedor.personaContacto },
    {
      etiqueta: t("panel.proveedores.campoCorreo"),
      valor: proveedor.correoElectronico,
      enlace: proveedor.correoElectronico ? `mailto:${proveedor.correoElectronico}` : undefined,
    },
    {
      etiqueta: t("panel.proveedores.campoTelefono"),
      valor: proveedor.telefono,
      // `tel:` para poder llamar de un toque desde el móvil, que es donde se
      // mira esto cuando hace falta de verdad.
      enlace: proveedor.telefono ? `tel:${proveedor.telefono.replace(/\s/g, "")}` : undefined,
    },
    {
      etiqueta: t("panel.proveedores.campoWeb"),
      valor: proveedor.sitioWeb,
      enlace: proveedor.sitioWeb ?? undefined,
    },
    {
      etiqueta: t("panel.proveedores.campoPresupuestado"),
      valor:
        euros && proveedor.importePresupuestado !== null
          ? euros(proveedor.importePresupuestado)
          : null,
    },
    {
      etiqueta: t("panel.proveedores.campoAcordado"),
      valor:
        euros && proveedor.importeAcordado !== null ? euros(proveedor.importeAcordado) : null,
    },
  ].filter((fila) => fila.valor);

  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.proveedores.datosTitulo")}</Titulo3>

      {filas.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.proveedores.sinDatos")}
        </Cuerpo>
      ) : (
        <dl className="mt-elemento grid gap-interno-compacto sm:grid-cols-2">
          {filas.map((fila) => (
            <div key={fila.etiqueta}>
              <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-tenue">
                {fila.etiqueta}
              </dt>
              <dd className="text-cuerpo text-tinta">
                {fila.enlace ? (
                  <a href={fila.enlace} className="text-tinta-marca underline">
                    {fila.valor}
                  </a>
                ) : (
                  fila.valor
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {proveedor.notas ? (
        <div className="mt-elemento max-w-texto">
          <Etiqueta>{t("panel.proveedores.campoNotas")}</Etiqueta>
          <Cuerpo className="mt-pila whitespace-pre-line">{proveedor.notas}</Cuerpo>
        </div>
      ) : null}
    </section>
  );
}

/**
 * La gente del proveedor.
 *
 * `es_del_dia` va primero y marcado: el comercial que firma el contrato casi
 * nunca es quien está el día de la boda, y a las once de la noche con el
 * autobús sin aparecer lo que hace falta es el segundo.
 */
function Contactos({
  proveedor,
  puedeEditar,
}: {
  proveedor: FichaProveedor;
  puedeEditar: boolean;
}) {
  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.proveedores.contactosTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-tenue">
        {t("panel.proveedores.contactosAyuda")}
      </Cuerpo>

      {proveedor.contactos.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.proveedores.sinContactos")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno-compacto">
          {proveedor.contactos.map((contacto) => (
            <Contacto
              key={contacto.id}
              contacto={contacto}
              proveedorId={proveedor.id}
              puedeEditar={puedeEditar}
            />
          ))}
        </ul>
      )}

      {puedeEditar ? (
        <form
          action={anadirContacto}
          className="mt-elemento grid gap-interno rounded-tarjeta border border-borde p-interno sm:grid-cols-2"
        >
          <input type="hidden" name="proveedor_id" value={proveedor.id} />
          <CampoTexto
            etiqueta={t("panel.proveedores.campoNombreContacto")}
            name="nombre"
            type="text"
            required
            maxLength={120}
          />
          <CampoTexto
            etiqueta={t("panel.proveedores.campoPapel")}
            ayuda={t("panel.proveedores.campoPapelAyuda")}
            name="papel"
            type="text"
            maxLength={80}
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

          <label className="flex items-center gap-interno-compacto text-pequeno text-tinta sm:col-span-2">
            <input
              type="checkbox"
              name="es_del_dia"
              value="si"
              className="size-casilla accent-marca"
            />
            {t("panel.proveedores.campoEsDelDia")}
          </label>

          <div className="sm:col-span-2">
            <Boton type="submit" jerarquia="secundario">
              {t("panel.proveedores.anadirContacto")}
            </Boton>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Contacto({
  contacto,
  proveedorId,
  puedeEditar,
}: {
  contacto: ContactoProveedor;
  proveedorId: string;
  puedeEditar: boolean;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-interno rounded-tarjeta border border-borde px-interno py-interno-compacto">
      <div>
        <p className="text-cuerpo text-tinta">
          {contacto.nombre}
          {contacto.papel ? (
            <span className="text-pequeno text-tinta-suave"> · {contacto.papel}</span>
          ) : null}
        </p>
        <p className="text-pequeno text-tinta-suave">
          {contacto.telefono ? (
            <a
              href={`tel:${contacto.telefono.replace(/\s/g, "")}`}
              className="text-tinta-marca underline"
            >
              {contacto.telefono}
            </a>
          ) : null}
          {contacto.telefono && contacto.correoElectronico ? " · " : null}
          {contacto.correoElectronico ? (
            <a
              href={`mailto:${contacto.correoElectronico}`}
              className="text-tinta-marca underline"
            >
              {contacto.correoElectronico}
            </a>
          ) : null}
        </p>
      </div>

      <div className="flex items-center gap-interno">
        {/* El distintivo no es sólo un color: lleva texto, que es lo que lee
            un lector de pantalla y lo que se ve con el sol de junio. */}
        {contacto.esDelDia ? (
          <span className="rounded-etiqueta bg-marca-tenue px-interno-compacto py-linea text-etiqueta uppercase tracking-etiqueta text-tinta-marca">
            {t("panel.proveedores.esDelDia")}
          </span>
        ) : null}

        {puedeEditar ? (
          <form action={quitarContacto}>
            <input type="hidden" name="proveedor_id" value={proveedorId} />
            <input type="hidden" name="id" value={contacto.id} />
            <Boton type="submit" jerarquia="terciario">
              {t("panel.proveedores.quitarContacto")}
            </Boton>
          </form>
        ) : null}
      </div>
    </li>
  );
}

function Edicion({
  proveedor,
  categorias,
}: {
  proveedor: FichaProveedor;
  categorias: { id: string; nombre: string }[];
}) {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.proveedores.editarTitulo")}</Titulo3>

      <form action={editarProveedor} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <input type="hidden" name="id" value={proveedor.id} />

        <CampoTexto
          etiqueta={t("panel.proveedores.campoNombre")}
          name="nombre"
          type="text"
          required
          maxLength={160}
          defaultValue={proveedor.nombre}
        />
        <CampoSeleccion
          etiqueta={t("panel.proveedores.campoCategoria")}
          name="categoria_id"
          required
          defaultValue={proveedor.categoriaId}
        >
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </CampoSeleccion>
        <CampoSeleccion
          etiqueta={t("panel.proveedores.campoEstado")}
          name="estado"
          defaultValue={proveedor.estado}
        >
          {ESTADOS_PROVEEDOR.map((valor) => (
            <option key={valor} value={valor}>
              {nombreDelEstado(valor)}
            </option>
          ))}
        </CampoSeleccion>
        <CampoSeleccion
          etiqueta={t("panel.proveedores.campoValoracion")}
          name="valoracion"
          defaultValue={proveedor.valoracion === null ? "" : String(proveedor.valoracion)}
        >
          <option value="">{t("panel.proveedores.sinValorar")}</option>
          {[1, 2, 3, 4, 5].map((nota) => (
            <option key={nota} value={nota}>
              {String(nota)}
            </option>
          ))}
        </CampoSeleccion>
        <CampoTexto
          etiqueta={t("panel.proveedores.campoPersona")}
          name="persona_contacto"
          type="text"
          maxLength={120}
          defaultValue={proveedor.personaContacto ?? ""}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoCorreo")}
          name="correo_electronico"
          type="email"
          defaultValue={proveedor.correoElectronico ?? ""}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoTelefono")}
          name="telefono"
          type="tel"
          defaultValue={proveedor.telefono ?? ""}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoWeb")}
          ayuda={t("panel.proveedores.campoWebAyuda")}
          name="sitio_web"
          type="text"
          defaultValue={proveedor.sitioWeb ?? ""}
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoPresupuestado")}
          ayuda={t("panel.proveedores.campoImporteAyuda")}
          name="importe_presupuestado"
          type="text"
          inputMode="decimal"
          defaultValue={
            proveedor.importePresupuestado === null
              ? ""
              : String(proveedor.importePresupuestado)
          }
        />
        <CampoTexto
          etiqueta={t("panel.proveedores.campoAcordado")}
          ayuda={t("panel.proveedores.campoAcordadoAyuda")}
          name="importe_acordado"
          type="text"
          inputMode="decimal"
          defaultValue={
            proveedor.importeAcordado === null ? "" : String(proveedor.importeAcordado)
          }
        />

        <div className="sm:col-span-2">
          <CampoTextoLargo
            etiqueta={t("panel.proveedores.campoNotas")}
            name="notas"
            rows={4}
            maxLength={4000}
            defaultValue={proveedor.notas ?? ""}
          />
        </div>

        <div className="sm:col-span-2">
          <Boton type="submit">{t("panel.proveedores.guardar")}</Boton>
        </div>
      </form>
    </section>
  );
}

function Borrado({ proveedor }: { proveedor: FichaProveedor }) {
  return (
    <section className="mt-elemento">
      <form action={borrarProveedor} className="flex flex-wrap items-center gap-interno">
        <input type="hidden" name="id" value={proveedor.id} />
        <Boton type="submit" jerarquia="terciario">
          {t("panel.proveedores.borrar")}
        </Boton>
        <Etiqueta>{t("panel.proveedores.borrarAyuda")}</Etiqueta>
      </form>
    </section>
  );
}

/**
 * Qué se lleva por delante el borrado, antes de hacerlo.
 *
 * `partidas_presupuesto.proveedor_id` es `on delete set null`: el gasto sigue
 * contando aunque el proveedor salga de la agenda. Eso es lo correcto para la
 * contabilidad y un desastre para quien borra sin saberlo, así que aquí se
 * enumeran uno a uno y con su importe.
 */
function ConfirmarBorrado({
  proveedor,
  euros,
}: {
  proveedor: FichaProveedor;
  euros: ((importe: number) => string) | null;
}) {
  return (
    <section className="mt-elemento rounded-tarjeta border border-error bg-error-fondo p-interno">
      <Titulo3 como="h2">{t("panel.proveedores.confirmarTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.proveedores.confirmarAyuda")}
      </Cuerpo>

      <ul className="mt-elemento grid gap-linea">
        {proveedor.gastos.map((gasto) => (
          <li key={gasto.id} className="text-pequeno text-tinta">
            {gasto.concepto}
            {euros ? (
              <span className="text-tinta-suave tabular-nums">
                {" · "}
                {euros(gasto.importeReal ?? gasto.importeEstimado)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <form action={borrarProveedor} className="mt-elemento flex flex-wrap gap-interno">
        <input type="hidden" name="id" value={proveedor.id} />
        <input type="hidden" name="confirmar" value="si" />
        <Boton type="submit">{t("panel.proveedores.confirmarBorrado")}</Boton>
        <Link
          href={`${RUTA_PROVEEDORES}/${proveedor.id}`}
          className="inline-flex min-h-control items-center text-pequeno text-tinta-marca underline"
        >
          {t("comun.cancelar")}
        </Link>
      </form>
    </section>
  );
}
