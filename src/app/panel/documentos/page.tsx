import { redirect } from "next/navigation";

import { Boton, BotonEnlace } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { Cuerpo, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { IDIOMA, RUTA_ACCESO, RUTA_DOCUMENTOS, ZONA_HORARIA } from "@/config/constants";
import { obtenerDiasDeLaBoda } from "@/lib/bbdd/ajustes";
import {
  caducanAntesDeLaBoda,
  ESTADOS_DOCUMENTO,
  obtenerDocumentos,
  porEstado,
  TITULARES_DOCUMENTO,
  type DocumentoBoda,
  type EstadoDocumento,
} from "@/lib/bbdd/documentos";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import {
  apuntarDocumento,
  borrarDocumento,
  editarDocumento,
  marcarConseguido,
} from "./acciones";
import { AvisoDocumentos } from "./aviso";

/**
 * BODA-105 · LOS PAPELES DE LA BODA CIVIL
 *
 * AGRUPADO POR ESTADO Y CON LO QUE FALTA ARRIBA. La pregunta que trae aquí a
 * alguien nunca es «enséñame los documentos», es «¿qué me queda por pedir?». En
 * una lista plana esa respuesta hay que reconstruirla leyendo estado por
 * estado; agrupada, está contestada antes de mirar.
 *
 * Y EL AVISO QUE JUSTIFICA EL MÓDULO VA POR ENCIMA DE TODO ESO: un papel que
 * caduca antes de la boda no está resuelto aunque esté conseguido. Es el único
 * caso en el que la lista, leída de arriba abajo, engañaría — «conseguido»
 * parece el final del camino y no lo es. Sale arriba, con nombre y fecha, y se
 * repite en su propia fila para que también se vea desde abajo.
 *
 * LA COMPARACIÓN LA HACE LA BASE. `v_documentos_boda` compara la caducidad con
 * la fecha de la ceremonia leída en su zona horaria. Preguntárselo al navegador
 * es preguntárselo a un reloj que puede estar mal puesto o en otro huso, y en
 * una cuenta de días eso es un aviso que sale un día tarde.
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

/*
  LAS FECHAS SE PINTAN CON MEDIODÍA DENTRO.

  `caduca_en` es un `date` y llega como «2027-06-12». Construir
  `new Date("2027-06-12")` lo interpreta en UTC, y al pintarlo en Europe/Madrid
  un documento del día 1 se enseña como del 31 del mes anterior en invierno y
  del día 1 en verano — es decir, a veces. Poniendo las 12:00 UTC, ningún huso
  de Europa cruza la medianoche y el día es siempre el que se escribió.
*/
function comoDia(fecha: string): Date {
  return new Date(`${fecha}T12:00:00Z`);
}

/**
 * La zona sale de la boda y no de la constante del proyecto: es la misma con la
 * que la base ha hecho la comparación, así que la fecha que se lee y la que
 * decide el aviso no pueden discrepar.
 */
function formatoDia(zona: string) {
  return new Intl.DateTimeFormat(IDIOMA, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: zona,
  });
}

/** De quién es el papel, en castellano. Los copys mandan, el enumerado no. */
function nombreDelTitular(titular: DocumentoBoda["deQuien"]): string {
  return t(`panel.documentos.titulares.${titular}` as "panel.documentos.titulares.ambos");
}

/**
 * En qué punto está un papel, en castellano.
 *
 * Dos copys y no uno: el rótulo de un grupo y la etiqueta de una fila no se
 * escriben igual. «Conseguido» encabezando una lista de cuatro documentos suena
 * a que la lista es un documento, y «Conseguidos» dentro de una fila suena a que
 * la fila son varios. Reutilizar el mismo texto ahorra siete líneas de JSON y
 * deja las dos frases mal.
 */
function nombreDelEstado(estado: EstadoDocumento): string {
  return t(`panel.documentos.estados.${estado}` as "panel.documentos.estados.pendiente");
}

/** El rótulo del grupo, en plural. */
function nombreDelGrupo(estado: EstadoDocumento): string {
  return t(`panel.documentos.grupos.${estado}` as "panel.documentos.grupos.pendiente");
}

export default async function PaginaDocumentos({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const editando = soloTexto(consulta.editar);
  const confirmandoBorrado =
    soloTexto(consulta.estado) === "confirmar-borrado" ? soloTexto(consulta.borrar) : "";

  const [documentos, dias] = await Promise.all([obtenerDocumentos(), obtenerDiasDeLaBoda()]);

  const puedeEditar = acceso.rol !== "lector";

  /*
    SIN FECHAS DE LA BASE NO SE INVENTA NINGUNA. `hoy` sólo se usa para rellenar
    el campo de «lo he recogido», y rellenarlo con la fecha del proceso —UTC en
    Vercel— apuntaría un papel recogido el martes por la noche como del
    miércoles. Vacío se puede escribir a mano; mal, no se ve.
  */
  const hoy = dias?.hoy ?? "";
  const dia = formatoDia(dias?.zonaHoraria ?? ZONA_HORARIA);

  const caducados = caducanAntesDeLaBoda(documentos);
  const grupos = porEstado(documentos);

  return (
    <>
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.documentos.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.documentos.descripcion")}</Cuerpo>
      </header>

      <AvisoDocumentos estado={soloTexto(consulta.estado)} />

      {documentos.length > 0 ? <Caducados documentos={caducados} dia={dia} /> : null}

      {documentos.length === 0 ? (
        <SinDocumentos />
      ) : (
        <div className="mt-bloque grid gap-bloque">
          {grupos.map((grupo) => (
            <SeccionEstado
              key={grupo.estado}
              estado={grupo.estado}
              documentos={grupo.documentos}
              dia={dia}
              hoy={hoy}
              editando={editando}
              confirmandoBorrado={confirmandoBorrado}
              puedeEditar={puedeEditar}
            />
          ))}
        </div>
      )}

      {puedeEditar ? <FormularioAlta /> : null}
    </>
  );
}

/**
 * EL AVISO QUE JUSTIFICA EL MÓDULO.
 *
 * VALE IGUAL ESTANDO CONSEGUIDO, y ahí es donde de verdad hace falta: un papel
 * marcado como hecho es un papel al que nadie vuelve a mirar. El certificado de
 * empadronamiento que se pidió en enero para una boda de septiembre está
 * perfectamente vigente hoy y no sirve el día de la boda.
 *
 * Y CUANDO NO CADUCA NINGUNO LO DICE, en vez de desaparecer. Un bloque que se
 * esfuma no se distingue de un bloque que no ha cargado, y aquí el silencio
 * significaría justo lo contrario de lo que parece.
 */
function Caducados({
  documentos,
  dia,
}: {
  documentos: DocumentoBoda[];
  dia: Intl.DateTimeFormat;
}) {
  if (documentos.length === 0) {
    return (
      <p className="mt-elemento rounded-campo bg-exito-fondo p-interno text-pequeno text-exito-tinta">
        {t("panel.documentos.ningunoCaduca")}
      </p>
    );
  }

  return (
    <section className="mt-elemento rounded-tarjeta bg-error-fondo p-interno">
      <Titulo3 como="h2" className="text-error-tinta">
        {t("panel.documentos.caducanTitulo")}
      </Titulo3>
      {/*
        `<p>` con sus clases y no `Cuerpo`: `Cuerpo` trae su propio color de
        tinta y aquí el texto va sobre el fondo de error. Dos utilidades de
        color en el mismo elemento dependen del orden de la hoja de estilos, no
        del orden en que se escriban, y eso no es una forma de decidir un
        contraste.
      */}
      <p className="mt-pila max-w-texto text-pequeno leading-cuerpo text-error-tinta">
        {t("panel.documentos.caducanAyuda")}
      </p>

      <ul className="mt-elemento grid gap-interno-compacto">
        {documentos.map((documento) => (
          <li key={documento.id} className="text-pequeno text-error-tinta">
            <span className="text-cuerpo">{documento.titulo}</span>
            {documento.caducaEn ? (
              <span className="mt-linea block">
                {t("panel.documentos.caducaEl", {
                  fecha: dia.format(comoDia(documento.caducaEn)),
                })}{" "}
                · {nombreDelEstado(documento.estado)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * EL VACÍO EXPLICA POR QUÉ ESTÁ VACÍO.
 *
 * No hay lista de partida a propósito: los papeles del expediente dependen del
 * registro civil, de la nacionalidad de cada uno y de si alguno estuvo casado
 * antes. Sembrar «los ocho de siempre» sería inventarse el expediente de esta
 * boda. Una pantalla vacía sin más parecería rota; ésta cuenta la decisión y
 * dice qué hacer a continuación.
 */
function SinDocumentos() {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.documentos.vacioTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto">{t("panel.documentos.vacio")}</Cuerpo>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.documentos.vacioAyuda")}
      </Cuerpo>
    </section>
  );
}

function SeccionEstado({
  estado,
  documentos,
  dia,
  hoy,
  editando,
  confirmandoBorrado,
  puedeEditar,
}: {
  estado: EstadoDocumento;
  documentos: DocumentoBoda[];
  dia: Intl.DateTimeFormat;
  hoy: string;
  editando: string;
  confirmandoBorrado: string;
  puedeEditar: boolean;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-interno border-b border-borde pb-interno-compacto">
        <Titulo3 como="h2">{nombreDelGrupo(estado)}</Titulo3>
        {/*
          El recuento va en versalita a mano y no con `Etiqueta`: ese componente
          pinta en `text-tinta-tenue`, que en un texto de este tamaño no llega a
          4,5:1. El contraste es una regla, no una preferencia del sitio donde
          se use.
        */}
        <span className="block text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
          {documentos.length === 1
            ? t("panel.documentos.cuantosUno")
            : t("panel.documentos.cuantos", { cuantos: documentos.length })}
        </span>
      </div>

      {documentos.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t(
            `panel.documentos.grupoVacio.${estado}` as "panel.documentos.grupoVacio.pendiente",
          )}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno">
          {documentos.map((documento) => (
            <li
              key={documento.id}
              id={`documento-${documento.id}`}
              className="rounded-tarjeta border border-borde bg-superficie p-interno"
            >
              {puedeEditar && editando === documento.id ? (
                <Edicion documento={documento} />
              ) : (
                <Fila
                  documento={documento}
                  dia={dia}
                  hoy={hoy}
                  confirmando={confirmandoBorrado === documento.id}
                  puedeEditar={puedeEditar}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Fila({
  documento,
  dia,
  hoy,
  confirmando,
  puedeEditar,
}: {
  documento: DocumentoBoda;
  dia: Intl.DateTimeFormat;
  hoy: string;
  confirmando: boolean;
  puedeEditar: boolean;
}) {
  return (
    <div className="grid gap-interno-compacto">
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <div>
          <span className="text-cuerpo text-tinta">{documento.titulo}</span>
          <span className="mt-linea block text-pequeno text-tinta-suave">
            {nombreDelTitular(documento.deQuien)}
            {documento.dondeSePide ? ` · ${documento.dondeSePide}` : ""}
          </span>
        </div>

        {/*
          EL AVISO SE REPITE EN LA FILA Y NO SÓLO ARRIBA. Quien está mirando el
          bloque de conseguidos no tiene por qué haber leído la cabecera, y es
          exactamente ahí donde el dato cambia lo que hay que hacer.

          Y LLEVA SU PALABRA, no un color. Un fondo rojo no lo lee ni un
          daltónico, ni un lector de pantalla, ni nadie con el sol dando en el
          móvil.
        */}
        {documento.caducaAntesDeLaBoda ? (
          <span className="rounded-etiqueta bg-error-fondo px-interno py-linea text-pequeno text-error-tinta">
            {t("panel.documentos.caducaAntes")}
          </span>
        ) : null}
      </div>

      <p className="text-pequeno text-tinta-suave">
        {documento.obtenidoEn
          ? t("panel.documentos.obtenidoEl", {
              fecha: dia.format(comoDia(documento.obtenidoEn)),
            })
          : t("panel.documentos.sinObtener")}
        {" · "}
        {documento.caducaEn
          ? t("panel.documentos.caducaEl", { fecha: dia.format(comoDia(documento.caducaEn)) })
          : t("panel.documentos.noCaduca")}
      </p>

      {documento.notas ? (
        <p className="max-w-texto text-pequeno text-tinta-suave">{documento.notas}</p>
      ) : null}

      {puedeEditar ? (
        <div className="flex flex-wrap items-end gap-interno">
          {/*
            MARCAR CONSEGUIDO EN UN TOQUE: el campo llega relleno con el día de
            hoy —calculado en el servidor, en la zona de la boda— así que el
            caso normal es pulsar y ya. El campo sigue estando para el caso de
            «lo recogí el jueves y lo apunto el lunes», que también es normal.
          */}
          {documento.estado !== "conseguido" ? (
            <form action={marcarConseguido} className="flex flex-wrap items-end gap-interno">
              <input type="hidden" name="id" value={documento.id} />
              <CampoTexto
                etiqueta={t("panel.documentos.campoObtenido")}
                name="obtenido_en"
                type="date"
                defaultValue={hoy}
                required
              />
              <Boton type="submit" jerarquia="secundario">
                {t("panel.documentos.marcarConseguido")}
              </Boton>
            </form>
          ) : null}

          <BotonEnlace
            href={`${RUTA_DOCUMENTOS}?editar=${documento.id}#documento-${documento.id}`}
            jerarquia="terciario"
          >
            {t("panel.documentos.editar")}
          </BotonEnlace>

          <form action={borrarDocumento}>
            <input type="hidden" name="id" value={documento.id} />
            {/*
              El segundo paso no es otro botón distinto: es el mismo con la
              confirmación ya puesta dentro. Así el borrado sigue siendo un
              `POST` y sigue funcionando sin JavaScript.
            */}
            {confirmando ? <input type="hidden" name="confirmar" value="si" /> : null}
            <Boton type="submit" jerarquia="terciario">
              {confirmando
                ? t("panel.documentos.borrarDeVerdad")
                : t("panel.documentos.borrar")}
            </Boton>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * La edición vive en la propia fila y no en una pantalla aparte.
 *
 * Son seis campos: sacarlos a una ruta propia costaría dos navegaciones para
 * cambiar una fecha, que es el 90% de lo que se hace aquí.
 */
function Edicion({ documento }: { documento: DocumentoBoda }) {
  return (
    <form action={editarDocumento} className="grid gap-interno sm:grid-cols-2">
      <input type="hidden" name="id" value={documento.id} />

      <div className="sm:col-span-2">
        <Titulo3 como="h3">{t("panel.documentos.editarTitulo")}</Titulo3>
      </div>

      <CampoTexto
        etiqueta={t("panel.documentos.campoTitulo")}
        name="titulo"
        type="text"
        required
        maxLength={160}
        defaultValue={documento.titulo}
      />
      <CampoSeleccion
        etiqueta={t("panel.documentos.campoDeQuien")}
        name="de_quien"
        defaultValue={documento.deQuien}
      >
        {TITULARES_DOCUMENTO.map((titular) => (
          <option key={titular} value={titular}>
            {nombreDelTitular(titular)}
          </option>
        ))}
      </CampoSeleccion>
      <CampoTexto
        etiqueta={t("panel.documentos.campoDonde")}
        ayuda={t("panel.documentos.campoDondeAyuda")}
        name="donde_se_pide"
        type="text"
        maxLength={200}
        defaultValue={documento.dondeSePide ?? ""}
      />
      <CampoSeleccion
        etiqueta={t("panel.documentos.campoEstado")}
        name="estado"
        defaultValue={documento.estado}
      >
        {ESTADOS_DOCUMENTO.map((estado) => (
          <option key={estado} value={estado}>
            {nombreDelEstado(estado)}
          </option>
        ))}
      </CampoSeleccion>
      <CampoTexto
        etiqueta={t("panel.documentos.campoObtenido")}
        ayuda={t("panel.documentos.campoObtenidoAyuda")}
        name="obtenido_en"
        type="date"
        defaultValue={documento.obtenidoEn ?? ""}
      />
      <CampoTexto
        etiqueta={t("panel.documentos.campoCaduca")}
        ayuda={t("panel.documentos.campoCaducaAyuda")}
        name="caduca_en"
        type="date"
        defaultValue={documento.caducaEn ?? ""}
      />

      <div className="sm:col-span-2">
        <CampoTextoLargo
          etiqueta={t("panel.documentos.campoNotas")}
          name="notas"
          rows={3}
          maxLength={2000}
          defaultValue={documento.notas ?? ""}
        />
      </div>

      <div className="flex flex-wrap gap-interno sm:col-span-2">
        <Boton type="submit">{t("panel.documentos.guardar")}</Boton>
        <BotonEnlace href={RUTA_DOCUMENTOS} jerarquia="terciario">
          {t("panel.documentos.cancelar")}
        </BotonEnlace>
      </div>
    </form>
  );
}

/** Alta de documento. Sin `<details>`: el formulario está, y se ve que está. */
function FormularioAlta() {
  return (
    <section className="mt-bloque rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.documentos.nuevoTitulo")}</Titulo3>
      <Cuerpo className="mt-pila max-w-texto text-pequeno text-tinta-suave">
        {t("panel.documentos.nuevoAyuda")}
      </Cuerpo>

      <form action={apuntarDocumento} className="mt-elemento grid gap-interno sm:grid-cols-2">
        <CampoTexto
          etiqueta={t("panel.documentos.campoTitulo")}
          name="titulo"
          type="text"
          required
          maxLength={160}
        />
        <CampoSeleccion etiqueta={t("panel.documentos.campoDeQuien")} name="de_quien">
          {TITULARES_DOCUMENTO.map((titular) => (
            <option key={titular} value={titular}>
              {nombreDelTitular(titular)}
            </option>
          ))}
        </CampoSeleccion>
        <CampoTexto
          etiqueta={t("panel.documentos.campoDonde")}
          ayuda={t("panel.documentos.campoDondeAyuda")}
          name="donde_se_pide"
          type="text"
          maxLength={200}
        />
        {/*
          EL ESTADO SÍ SE ELIGE AL APUNTAR, al revés que en proveedores. Un papel
          se apunta muchas veces cuando ya se ha pedido —o cuando ya se tiene, al
          rehacer la lista con los que estaban en el cajón— y obligar a apuntarlo
          como pendiente para cambiarlo acto seguido es pedir dos pasos para uno.
          La regla de «conseguido exige fecha» se comprueba igual en la acción.
        */}
        <CampoSeleccion etiqueta={t("panel.documentos.campoEstado")} name="estado">
          {ESTADOS_DOCUMENTO.map((estado) => (
            <option key={estado} value={estado}>
              {nombreDelEstado(estado)}
            </option>
          ))}
        </CampoSeleccion>
        <CampoTexto
          etiqueta={t("panel.documentos.campoObtenido")}
          ayuda={t("panel.documentos.campoObtenidoAyuda")}
          name="obtenido_en"
          type="date"
        />
        <CampoTexto
          etiqueta={t("panel.documentos.campoCaduca")}
          ayuda={t("panel.documentos.campoCaducaAyuda")}
          name="caduca_en"
          type="date"
        />

        <div className="sm:col-span-2">
          <CampoTextoLargo
            etiqueta={t("panel.documentos.campoNotas")}
            name="notas"
            rows={3}
            maxLength={2000}
          />
        </div>

        <div className="sm:col-span-2">
          <Boton type="submit">{t("panel.documentos.apuntar")}</Boton>
        </div>
      </form>
    </section>
  );
}
