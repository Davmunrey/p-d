import Link from "next/link";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  IDIOMA,
  PESO_MAXIMO_DOCUMENTO_MB,
  RUTA_ACCESO,
  RUTA_PROVEEDORES,
  TIPOS_DOCUMENTO_ADMITIDOS,
  ZONA_HORARIA,
} from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import {
  BASES_SERVICIO,
  ESTADOS_PROVEEDOR,
  TIPOS_DOCUMENTO,
  obtenerCategoriasProveedor,
  obtenerContratadosDeCategoria,
  obtenerDocumentosProveedor,
  obtenerFichaProveedor,
  obtenerServiciosProveedor,
  type ContactoProveedor,
  type DocumentoProveedor,
  type FichaProveedor,
  type ServicioProveedor,
} from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { haySubidaDeMedios } from "@/lib/supabase/servicio";

import {
  anadirContacto,
  borrarDocumento,
  borrarProveedor,
  borrarServicio,
  cambiarEstado,
  crearServicio,
  descargarDocumento,
  editarProveedor,
  editarServicio,
  quitarContacto,
  subirDocumento,
} from "../acciones";
import { AvisoProveedores } from "../aviso";
import { formateadorDeImporte } from "@/lib/importe";

import {
  nombreDeLaBase,
  nombreDelEstado,
  nombreDelTipoDocumento,
  pesoDelDocumento,
} from "../formato";

/** Cuándo se subió un papel. El día y la hora: dos versiones del mismo contrato
 *  suben el mismo día, y sin la hora no se sabe cuál es la buena. */
const formatoFecha = new Intl.DateTimeFormat(IDIOMA, {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_HORARIA,
});

/** Lo que el navegador ofrece en el diálogo de fichero, del mismo sitio que el bucket. */
const TIPOS_ACEPTADOS = TIPOS_DOCUMENTO_ADMITIDOS.join(",");

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

  const [proveedor, categorias, moneda, documentos, servicios] = await Promise.all([
    obtenerFichaProveedor(id),
    obtenerCategoriasProveedor(),
    obtenerMonedaBoda(),
    obtenerDocumentosProveedor(id),
    obtenerServiciosProveedor(id),
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

  /*
    Sólo se pregunta por los ya contratados cuando hay un aviso que enseñar. El
    aviso tiene que **decir a quién**: «ya hay uno contratado» sin nombre obliga
    a ir a buscarlo para saber si es un error o es a propósito. Pero es una
    consulta más, y en la visita normal —que es el noventa y nueve por ciento—
    no hace ninguna falta.
  */
  const contratados =
    estado === "confirmar-contratado"
      ? await obtenerContratadosDeCategoria(proveedor.categoriaId, proveedor.id)
      : [];

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

      {puedeEditar ? <Fase proveedor={proveedor} /> : null}

      {estado === "confirmar-contratado" && puedeEditar ? (
        <ConfirmarContratado proveedor={proveedor} otros={contratados} />
      ) : null}

      <Datos proveedor={proveedor} euros={euros} />

      <Contactos proveedor={proveedor} puedeEditar={puedeEditar} />

      <Servicios
        proveedor={proveedor}
        servicios={servicios}
        euros={euros}
        puedeEditar={puedeEditar}
      />

      <Documentos
        proveedor={proveedor}
        documentos={documentos}
        puedeEditar={puedeEditar}
        porBorrar={estado === "confirmar-documento" ? soloTexto(consulta.documento) : ""}
      />

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
              <dt className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
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

      {proveedor.motivoDescarte ? (
        <div className="mt-elemento max-w-texto">
          <Etiqueta>{t("panel.proveedores.motivoDescarte")}</Etiqueta>
          <Cuerpo className="mt-pila whitespace-pre-line">{proveedor.motivoDescarte}</Cuerpo>
        </div>
      ) : null}

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
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
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
        {/*
          BODA-73 · TRES RESPUESTAS Y NO UNA CASILLA. La tercera —«el
          presupuesto no lo dice»— es la más común de las tres, y con una
          casilla se guardaría como «no lo lleva»: la comparativa inventaría un
          IVA que nadie ha dicho. Aquí no hay valor por defecto que mienta.
        */}
        <CampoSeleccion
          etiqueta={t("panel.proveedores.campoIva")}
          ayuda={t("panel.proveedores.campoIvaAyuda")}
          name="iva_incluido"
          defaultValue={
            proveedor.ivaIncluido === null ? "" : proveedor.ivaIncluido ? "si" : "no"
          }
        >
          <option value="">{t("panel.proveedores.ivaNoLoDice")}</option>
          <option value="si">{t("panel.proveedores.ivaSi")}</option>
          <option value="no">{t("panel.proveedores.ivaNo")}</option>
        </CampoSeleccion>
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

/**
 * EN QUÉ PUNTO ESTÁ, Y CÓMO SE MUEVE.
 *
 * Es el control que más se usa de toda la ficha: un proveedor cambia de fase
 * cinco o seis veces y su teléfono no cambia nunca. Por eso está arriba y
 * suelto, y no enterrado en el formulario grande.
 *
 * EL MOTIVO DE DESCARTE ESTÁ SIEMPRE, no aparece al elegir «descartado».
 * Enseñarlo sólo entonces necesitaría JavaScript, y esta pantalla funciona sin
 * él; además, un campo que aparece de golpe debajo del cursor es peor que uno
 * que estaba ahí con su ayuda explicando cuándo toca rellenarlo. Si se
 * descarta sin motivo, la acción lo dice y no escribe nada.
 */
function Fase({ proveedor }: { proveedor: FichaProveedor }) {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.proveedores.estadoTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.proveedores.estadoAyuda")}
      </Cuerpo>

      <form
        action={cambiarEstado}
        className="mt-elemento grid gap-interno sm:grid-cols-[auto_1fr_auto] sm:items-end"
      >
        <input type="hidden" name="id" value={proveedor.id} />

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

        <CampoTexto
          etiqueta={t("panel.proveedores.campoMotivoDescarte")}
          ayuda={t("panel.proveedores.campoMotivoDescarteAyuda")}
          name="motivo_descarte"
          type="text"
          maxLength={1000}
          defaultValue={proveedor.motivoDescarte ?? ""}
        />

        <Boton type="submit" jerarquia="secundario">
          {t("panel.proveedores.cambiarEstado")}
        </Boton>
      </form>
    </section>
  );
}

/**
 * Contratar a un segundo de la misma categoría pregunta antes.
 *
 * No se prohíbe —hay bodas con dos fotógrafos, y con un DJ y un grupo— pero lo
 * normal es que sea un despiste: se contrata al bueno y se olvida descartar al
 * otro, y a partir de ahí el resumen de «qué falta por cerrar» miente en la
 * dirección tranquilizadora, que es la peor.
 */
function ConfirmarContratado({
  proveedor,
  otros,
}: {
  proveedor: FichaProveedor;
  otros: { id: string; nombre: string }[];
}) {
  return (
    <section className="mt-elemento rounded-tarjeta border border-error bg-error-fondo p-interno">
      <Titulo3 como="h2">{t("panel.proveedores.confirmarContratadoTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno">
        {t("panel.proveedores.confirmarContratadoAyuda")}
      </Cuerpo>

      <ul className="mt-elemento grid gap-linea">
        {otros.map((otro) => (
          <li key={otro.id} className="text-pequeno text-tinta">
            <Link href={`${RUTA_PROVEEDORES}/${otro.id}`} className="underline">
              {otro.nombre}
            </Link>
          </li>
        ))}
      </ul>

      <form action={cambiarEstado} className="mt-elemento flex flex-wrap gap-interno">
        <input type="hidden" name="id" value={proveedor.id} />
        <input type="hidden" name="estado" value="contratado" />
        <input type="hidden" name="confirmar" value="si" />
        <Boton type="submit">{t("panel.proveedores.confirmarContratado")}</Boton>
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

/* -------------------------------------------------------------------------- */
/*  BODA-74 · Lo que incluye, y cuánto cuesta hoy                             */
/* -------------------------------------------------------------------------- */

/**
 * LOS SERVICIOS SON DONDE VIVE EL PRECIO DE VERDAD.
 *
 * «Catering: 8.600 €» es lo que pone el presupuesto y no es un dato útil: son
 * 62 € por adulto, 28 € por niño y un mínimo de 100 cubiertos, y de ahí sale un
 * número que cambia cada vez que alguien confirma. Esta sección desmonta esa
 * cifra en las piezas que de verdad se negocian.
 *
 * LA CUENTA NO SE HACE AQUÍ. Cada importe sale de `v_servicios_importe`, que es
 * quien sabe a cuántos multiplica cada servicio y quién garantiza el mínimo.
 * Repetir la fórmula en esta pantalla la dejaría desincronizada de la que usa
 * el presupuesto en cuanto una de las dos cambie.
 */
function Servicios({
  proveedor,
  servicios,
  euros,
  puedeEditar,
}: {
  proveedor: FichaProveedor;
  servicios: ServicioProveedor[];
  euros: ((importe: number) => string) | null;
  puedeEditar: boolean;
}) {
  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.proveedores.serviciosTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.proveedores.serviciosAyuda")}
      </Cuerpo>

      {servicios.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.proveedores.sinServicios")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno">
          {servicios.map((servicio) => (
            <Servicio
              key={servicio.id}
              servicio={servicio}
              proveedorId={proveedor.id}
              euros={euros}
              puedeEditar={puedeEditar}
            />
          ))}
        </ul>
      )}

      {puedeEditar ? (
        <section className="mt-elemento rounded-tarjeta border border-borde p-interno">
          <Titulo3 como="h3">{t("panel.proveedores.nuevoServicioTitulo")}</Titulo3>
          <form action={crearServicio} className="mt-elemento grid gap-interno sm:grid-cols-2">
            <input type="hidden" name="proveedor_id" value={proveedor.id} />
            <CamposServicio />
            <div className="sm:col-span-2">
              <Boton type="submit" jerarquia="secundario">
                {t("panel.proveedores.anadirServicio")}
              </Boton>
            </div>
          </form>
        </section>
      ) : null}
    </section>
  );
}

/**
 * Los campos de un servicio, los mismos al crear y al editar.
 *
 * DOS DE ELLOS SÓLO SIRVEN SI EL PRECIO ES POR INVITADO Y AUN ASÍ ESTÁN
 * SIEMPRE. Esconderlos al desmarcar la casilla exigiría JavaScript, y esta
 * pantalla funciona sin él; además, un campo que aparece de golpe debajo del
 * cursor se lee peor que uno que llevaba ahí desde el principio con su ayuda
 * explicando cuándo toca. La acción de servidor resuelve lo que se hace con
 * ellos si la casilla está sin marcar.
 */
function CamposServicio({ servicio }: { servicio?: ServicioProveedor }) {
  return (
    <>
      <CampoTexto
        etiqueta={t("panel.proveedores.campoServicioNombre")}
        name="nombre"
        type="text"
        required
        maxLength={160}
        defaultValue={servicio?.nombre ?? ""}
      />
      <CampoTexto
        etiqueta={t("panel.proveedores.campoPrecioUnitario")}
        ayuda={t("panel.proveedores.campoImporteAyuda")}
        name="precio_unitario"
        type="text"
        inputMode="decimal"
        defaultValue={servicio ? String(servicio.precioUnitario) : ""}
      />
      <CampoTexto
        etiqueta={t("panel.proveedores.campoCantidad")}
        ayuda={t("panel.proveedores.campoCantidadAyuda")}
        name="cantidad"
        type="number"
        min={1}
        step={1}
        defaultValue={servicio ? String(servicio.cantidad) : "1"}
      />
      <CampoSeleccion
        etiqueta={t("panel.proveedores.campoBaseCalculo")}
        ayuda={t("panel.proveedores.campoBaseCalculoAyuda")}
        name="base_calculo"
        defaultValue={servicio?.baseCalculo ?? "todos"}
      >
        {BASES_SERVICIO.map((base) => (
          <option key={base} value={base}>
            {nombreDeLaBase(base)}
          </option>
        ))}
      </CampoSeleccion>
      <CampoTexto
        etiqueta={t("panel.proveedores.campoMinimo")}
        ayuda={t("panel.proveedores.campoMinimoAyuda")}
        name="minimo_garantizado"
        type="text"
        inputMode="decimal"
        defaultValue={
          servicio?.minimoGarantizado === null || servicio === undefined
            ? ""
            : String(servicio.minimoGarantizado)
        }
      />

      <label className="flex items-center gap-interno-compacto text-pequeno text-tinta sm:col-span-2">
        <input
          type="checkbox"
          name="por_invitado"
          value="si"
          defaultChecked={servicio?.porInvitado ?? false}
          className="size-casilla accent-marca"
        />
        {t("panel.proveedores.campoPorInvitado")}
      </label>
    </>
  );
}

function Servicio({
  servicio,
  proveedorId,
  euros,
  puedeEditar,
}: {
  servicio: ServicioProveedor;
  proveedorId: string;
  euros: ((importe: number) => string) | null;
  puedeEditar: boolean;
}) {
  /*
    CUÁNDO MANDA EL MÍNIMO. No basta con que haya uno pactado: manda cuando la
    cuenta de hoy se queda por debajo, y eso es un dato que cambia solo según se
    va confirmando gente. Cuando manda, se explican las DOS cifras — la de hoy y
    la garantizada — porque la diferencia entre ellas es exactamente lo que se
    está pagando de más mientras no confirme más gente, y ése es el número que
    hace llamar al catering.
  */
  const mandaElMinimo =
    servicio.minimoGarantizado !== null &&
    servicio.importeCalculado !== null &&
    servicio.importeTotal !== null &&
    servicio.importeTotal > servicio.importeCalculado;

  return (
    <li className="rounded-tarjeta border border-borde p-interno">
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <div>
          <p className="text-cuerpo text-tinta">{servicio.nombre}</p>
          <p className="text-pequeno text-tinta-suave">
            {euros ? euros(servicio.precioUnitario) : null}
            {servicio.cantidad > 1
              ? ` · ${t("panel.proveedores.porUnidades", { cuantas: servicio.cantidad })}`
              : null}
            {servicio.porInvitado
              ? ` · ${t("panel.proveedores.porCabeza", {
                  base: nombreDeLaBase(servicio.baseCalculo),
                })}`
              : null}
          </p>
        </div>

        {euros && servicio.importeTotal !== null ? (
          <p className="text-cuerpo tabular-nums text-tinta">
            <Etiqueta>{t("panel.proveedores.servicioImporte")}</Etiqueta>
            {euros(servicio.importeTotal)}
          </p>
        ) : null}
      </div>

      {mandaElMinimo && euros ? (
        <p className="mt-pila rounded-campo bg-aviso-fondo p-interno-compacto text-pequeno text-aviso-tinta">
          {t("panel.proveedores.servicioMinimoManda", {
            hoy: euros(servicio.importeCalculado ?? 0),
            garantizado: euros(servicio.importeTotal ?? 0),
          })}
        </p>
      ) : null}

      {puedeEditar ? (
        <>
          <form
            action={editarServicio}
            className="mt-elemento grid gap-interno border-t border-borde-tenue pt-interno sm:grid-cols-2"
          >
            <input type="hidden" name="proveedor_id" value={proveedorId} />
            <input type="hidden" name="id" value={servicio.id} />
            <CamposServicio servicio={servicio} />
            <div className="sm:col-span-2">
              <Boton type="submit" jerarquia="secundario">
                {t("panel.proveedores.guardarServicio")}
              </Boton>
            </div>
          </form>

          <form action={borrarServicio} className="mt-elemento">
            <input type="hidden" name="proveedor_id" value={proveedorId} />
            <input type="hidden" name="id" value={servicio.id} />
            <Boton
              type="submit"
              jerarquia="terciario"
              aria-label={t("panel.proveedores.borrarServicioDe", { nombre: servicio.nombre })}
            >
              {t("panel.proveedores.borrarServicio")}
            </Boton>
          </form>
        </>
      ) : null}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/*  BODA-72 · Los papeles                                                     */
/* -------------------------------------------------------------------------- */

/**
 * CONTRATOS, PRESUPUESTOS Y FACTURAS, EN EL SITIO DONDE SE BUSCAN.
 *
 * Hoy viven en el correo de uno de los dos y en la carpeta de descargas del
 * móvil del otro. El día que hace falta el contrato —porque el autobús no ha
 * llegado y hay que leer qué decía— no está en ninguno de los dos sitios.
 *
 * EL BUCKET ES PRIVADO Y AQUÍ NO SE PINTA NINGUNA URL. Descargar es un `POST` a
 * una acción que comprueba quién pide y firma un enlace que caduca en minutos.
 * Un `<a href>` al objeto sería un contrato con datos bancarios a un clic de
 * cualquiera que viera el HTML.
 */
function Documentos({
  proveedor,
  documentos,
  puedeEditar,
  porBorrar,
}: {
  proveedor: FichaProveedor;
  documentos: DocumentoProveedor[];
  puedeEditar: boolean;
  /** El identificador del documento cuya confirmación de borrado toca enseñar. */
  porBorrar: string;
}) {
  return (
    <section className="mt-bloque">
      <Titulo3 como="h2">{t("panel.proveedores.documentosTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.proveedores.documentosAyuda")}
      </Cuerpo>

      {/* Se dice una vez y arriba: sin la clave no funciona ni subir ni
          descargar, y repetirlo por documento convertiría un aviso en ruido. */}
      {!haySubidaDeMedios ? (
        <p
          role="alert"
          className="mt-elemento rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {t("panel.proveedores.errorSinConfigurar")}
        </p>
      ) : null}

      {documentos.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.proveedores.sinDocumentos")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno-compacto">
          {documentos.map((documento) => (
            <Documento
              key={documento.id}
              documento={documento}
              proveedorId={proveedor.id}
              puedeEditar={puedeEditar}
              confirmando={porBorrar === documento.id}
            />
          ))}
        </ul>
      )}

      {puedeEditar && haySubidaDeMedios ? (
        <form
          action={subirDocumento}
          className="mt-elemento grid gap-interno rounded-tarjeta border border-borde p-interno sm:grid-cols-2"
        >
          <input type="hidden" name="proveedor_id" value={proveedor.id} />

          <div className="grid gap-interno-compacto sm:col-span-2">
            <label
              htmlFor="documento-fichero"
              className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
            >
              {t("panel.proveedores.campoFichero")}
            </label>
            <input
              id="documento-fichero"
              type="file"
              name="fichero"
              accept={TIPOS_ACEPTADOS}
              required
              aria-describedby="documento-fichero-ayuda"
              className="text-pequeno text-tinta"
            />
            <span id="documento-fichero-ayuda" className="text-pequeno text-tinta-suave">
              {t("panel.proveedores.campoFicheroAyuda", { megas: PESO_MAXIMO_DOCUMENTO_MB })}
            </span>
          </div>

          <CampoSeleccion
            etiqueta={t("panel.proveedores.campoTipoDocumento")}
            name="tipo"
            defaultValue="contrato"
          >
            {TIPOS_DOCUMENTO.map((tipo) => (
              <option key={tipo} value={tipo}>
                {nombreDelTipoDocumento(tipo)}
              </option>
            ))}
          </CampoSeleccion>

          <CampoTexto
            etiqueta={t("panel.proveedores.campoNombreDocumento")}
            ayuda={t("panel.proveedores.campoNombreDocumentoAyuda")}
            name="nombre"
            type="text"
            maxLength={200}
          />

          <div className="sm:col-span-2">
            <Boton type="submit" jerarquia="secundario">
              {t("panel.proveedores.subirDocumento")}
            </Boton>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Documento({
  documento,
  proveedorId,
  puedeEditar,
  confirmando,
}: {
  documento: DocumentoProveedor;
  proveedorId: string;
  puedeEditar: boolean;
  confirmando: boolean;
}) {
  const cuando = formatoFecha.format(new Date(documento.creadoEn));
  const peso = pesoDelDocumento(documento.tamanoBytes);

  return (
    <li className="rounded-tarjeta border border-borde px-interno py-interno-compacto">
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <div>
          <p className="text-cuerpo text-tinta">
            {documento.nombre}
            <span className="text-pequeno text-tinta-suave">
              {" · "}
              {nombreDelTipoDocumento(documento.tipo)}
            </span>
          </p>
          <p className="text-pequeno text-tinta-suave">
            {documento.subidoPor
              ? t("panel.proveedores.documentoSubidoPor", {
                  quien: documento.subidoPor,
                  cuando,
                })
              : t("panel.proveedores.documentoSubidoEl", { cuando })}
            {peso ? ` · ${peso}` : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-interno">
          <form action={descargarDocumento}>
            <input type="hidden" name="proveedor_id" value={proveedorId} />
            <input type="hidden" name="id" value={documento.id} />
            {/*
              Un botón y no un enlace, y por una vez es lo correcto: aquí no se
              navega a un sitio que exista, se pide que el servidor firme un
              permiso de cinco minutos. El nombre del papel va en el nombre
              accesible porque con cinco documentos hay cinco «Descargar».
            */}
            <Boton
              type="submit"
              jerarquia="secundario"
              aria-label={t("panel.proveedores.descargarDocumentoDe", {
                nombre: documento.nombre,
              })}
            >
              {t("panel.proveedores.descargarDocumento")}
            </Boton>
          </form>

          {puedeEditar ? (
            <form action={borrarDocumento}>
              <input type="hidden" name="proveedor_id" value={proveedorId} />
              <input type="hidden" name="id" value={documento.id} />
              <Boton
                type="submit"
                jerarquia="terciario"
                aria-label={t("panel.proveedores.borrarDocumentoDe", {
                  nombre: documento.nombre,
                })}
              >
                {t("panel.proveedores.borrarDocumento")}
              </Boton>
            </form>
          ) : null}
        </div>
      </div>

      {/*
        LA CONFIRMACIÓN SALE PEGADA AL DOCUMENTO QUE SE VA A BORRAR, no arriba
        del todo. Con cinco papeles en la lista, un aviso general obliga a
        confiar en que el que se pulsó era el que se creía.
      */}
      {confirmando && puedeEditar ? (
        <div className="mt-elemento rounded-campo border border-error bg-error-fondo p-interno">
          <p className="text-pequeno text-error-tinta">
            {t("panel.proveedores.confirmarDocumentoAyuda", { nombre: documento.nombre })}
          </p>
          <form action={borrarDocumento} className="mt-elemento flex flex-wrap gap-interno">
            <input type="hidden" name="proveedor_id" value={proveedorId} />
            <input type="hidden" name="id" value={documento.id} />
            <input type="hidden" name="confirmar" value="si" />
            <Boton type="submit">{t("panel.proveedores.confirmarDocumento")}</Boton>
            <Link
              href={`${RUTA_PROVEEDORES}/${proveedorId}`}
              className="inline-flex min-h-control items-center text-pequeno text-tinta-marca underline"
            >
              {t("comun.cancelar")}
            </Link>
          </form>
        </div>
      ) : null}
    </li>
  );
}
