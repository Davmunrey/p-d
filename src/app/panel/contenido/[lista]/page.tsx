import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { RUTA_ACCESO, RUTA_CONTENIDO } from "@/config/constants";
import {
  LISTAS_DE_CONTENIDO,
  esClaveLista,
  rutaDeLista,
  seccionDeLista,
  type CampoDeLista,
  type ClaveLista,
  type ListaDeContenido,
} from "@/config/contenido-landing";
import {
  obtenerFilasDeLista,
  obtenerVisibilidadDeSeccion,
  type FilaDeContenido,
} from "@/lib/bbdd/contenido";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";

import { alternarVisible } from "../acciones";
import {
  alternarPublicado,
  borrarFicha,
  crearFicha,
  guardarFicha,
  moverFicha,
  pedirBorrado,
} from "./acciones";
import { ESTADOS_DE_ERROR, esEstadoLista, type EstadoLista } from "./estado";

/**
 * BODA-129 · UNA LISTA DE CONTENIDO DE LA LANDING
 *
 * La misma pantalla para las cuatro: el programa, cómo llegar, el dress code y
 * las preguntas. Lo único que cambia son los campos, y eso lo dice el
 * descriptor de `src/config/contenido-landing.ts`.
 *
 * EL FORMULARIO DE ALTA VA ARRIBA, y no es una preferencia. Esto se abre desde
 * el móvil, con una mano, para añadir un hotel o una pregunta que acaba de
 * surgir; con el alta al final, «añadir» empieza por recorrer toda la lista con
 * el pulgar. Lo que se viene a hacer va primero.
 *
 * BORRAR PIDE CONFIRMACIÓN, Y LA CONFIRMACIÓN OFRECE LA SALIDA SUAVE. Una ficha
 * borrada no vuelve; una retirada sigue guardada. La diferencia se dice en la
 * propia ficha, no sólo al confirmar, porque quien va a pulsar tiene que
 * saberla ANTES de pulsar.
 *
 * SIN UNA LÍNEA DE JAVASCRIPT DE CLIENTE. Son `<form>` con Server Actions y
 * `<details>` nativos; incluso el paso de confirmación es un estado de la URL.
 * Funciona con el bundle a medio cargar, que es como se abre esto con mala
 * cobertura.
 */
export const dynamic = "force-dynamic";

const AVISOS: Record<EstadoLista, string> = {
  creada: t("panel.contenido.listas.comun.avisoCreada"),
  guardada: t("panel.contenido.listas.comun.avisoGuardada"),
  retirada: t("panel.contenido.listas.comun.avisoRetirada"),
  publicada: t("panel.contenido.listas.comun.avisoPublicada"),
  borrada: t("panel.contenido.listas.comun.avisoBorrada"),
  movida: t("panel.contenido.listas.comun.avisoMovida"),
  // No es un acuse: es la pregunta, y se pinta en la ficha, no aquí arriba.
  "confirmar-borrado": "",
  falta: "",
  largo: "",
  "no-encontrada": t("panel.contenido.listas.comun.errorNoEncontrada"),
  "sin-permiso": t("panel.contenido.listas.comun.errorSinPermiso"),
  error: t("panel.contenido.listas.comun.errorGuardar"),
};

interface Parametros {
  params: Promise<{ lista: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function soloTexto(valor: string | string[] | undefined): string {
  return typeof valor === "string" ? valor : "";
}

export default async function PaginaLista({ params, searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const { lista: pedida } = await params;
  // Una clave que no existe es un 404 de verdad, no una pantalla vacía: la URL
  // está mal, y decirlo es más útil que enseñar una lista de cero elementos.
  if (!esClaveLista(pedida)) notFound();

  const clave: ClaveLista = pedida;
  const lista = LISTAS_DE_CONTENIDO[clave];

  const consulta = await searchParams;
  const bruto = soloTexto(consulta.estado);
  const estado = esEstadoLista(bruto) ? bruto : null;
  const campoConFallo = soloTexto(consulta.campo);
  const fichaSenalada = soloTexto(consulta.ficha);

  const variante = varianteElegida(lista, soloTexto(consulta.variante));
  const seccion = seccionDeLista(clave, variante);

  const [filas, visible] = await Promise.all([
    obtenerFilasDeLista(clave, variante),
    obtenerVisibilidadDeSeccion(seccion),
  ]);

  const puedeEditar = acceso.rol !== "lector";
  const nombreSeccion = t(`navegacion.secciones.${seccion}`);
  const publicadas = filas.filter((fila) => fila.publicado).length;

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Link
          href={RUTA_CONTENIDO}
          prefetch={false}
          className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave transicion-color hover:text-tinta"
        >
          {t("panel.contenido.listas.comun.volver")}
        </Link>
        <Titulo2 como="h1" className="mt-pila">
          {t(lista.titulo)}
        </Titulo2>
        <Cuerpo className="mt-pila">{t(lista.descripcion)}</Cuerpo>
      </header>

      {lista.destino.clase === "partida" ? (
        <Conmutador clave={clave} lista={lista} variante={variante} />
      ) : null}

      {estado && AVISOS[estado] ? (
        <p
          role={ESTADOS_DE_ERROR.includes(estado) ? "alert" : "status"}
          className={`rounded-campo p-interno text-pequeno ${
            ESTADOS_DE_ERROR.includes(estado)
              ? "bg-error-fondo text-error-tinta"
              : "bg-exito-fondo text-exito-tinta"
          }`}
        >
          {AVISOS[estado]}
        </p>
      ) : null}

      {/*
        LA SECCIÓN PUEDE ESTAR APAGADA MIENTRAS SE LLENA, y sin decirlo aquí es
        el desconcierto de #163 otra vez en pequeño: se escriben tres fichas, no
        se ve ninguna, y no hay forma de saber por qué. Se dice, y se ofrece
        encenderla sin tener que ir a buscarla.
      */}
      {visible === false ? (
        <AvisoSeccionApagada
          seccion={seccion}
          nombreSeccion={nombreSeccion}
          puedeEditar={puedeEditar}
        />
      ) : null}

      {/*
        Y EL OTRO CASO: encendida, pero sin nada publicado. La landing oculta lo
        vacío, así que la sección tampoco aparece — y eso no se ve mirando el
        interruptor, que sigue diciendo que está encendida.
      */}
      {visible === true && publicadas === 0 && filas.length > 0 ? (
        <Etiqueta className="block">
          {t("panel.contenido.listas.comun.seccionVacia", { seccion: nombreSeccion })}
        </Etiqueta>
      ) : null}

      {!puedeEditar ? (
        <Etiqueta className="block">{t("panel.contenido.soloLectura")}</Etiqueta>
      ) : null}

      {puedeEditar ? (
        <Alta
          clave={clave}
          lista={lista}
          variante={variante}
          campoConFallo={fichaSenalada ? "" : campoConFallo}
          estado={estado}
        />
      ) : null}

      <section>
        <h2 id={ID_LISTA} className="sr-only">
          {t(lista.titulo)}
        </h2>

        {filas.length === 0 ? (
          <Cuerpo className="text-pequeno text-tinta-suave">
            {t("panel.contenido.listas.comun.vacia")}
          </Cuerpo>
        ) : (
          <>
            <Etiqueta className="mb-elemento block">
              {t("panel.contenido.listas.comun.cuantas", {
                cuantas: publicadas,
                total: filas.length,
              })}
            </Etiqueta>

            {/* `ol` porque el orden ES el dato: es el que ve un invitado. */}
            <ol aria-labelledby={ID_LISTA} className="grid gap-interno">
              {filas.map((fila, indice) => (
                <Ficha
                  key={fila.id}
                  clave={clave}
                  lista={lista}
                  variante={variante}
                  fila={fila}
                  puedeEditar={puedeEditar}
                  esLaPrimera={indice === 0}
                  esLaUltima={indice === filas.length - 1}
                  estado={estado}
                  campoConFallo={campoConFallo}
                  senalada={fichaSenalada === fila.id}
                />
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}

/** El identificador que une la lista con su título. Sólo vive en el documento. */
const ID_LISTA = "fichas-de-la-lista";

/** La variante pedida, si es una de las suyas; si no, la primera. */
function varianteElegida(lista: ListaDeContenido, pedida: string): string | undefined {
  if (lista.destino.clase !== "partida") return undefined;
  const valida = lista.destino.opciones.some((opcion) => opcion.valor === pedida);
  return valida ? pedida : lista.destino.opciones[0].valor;
}

/**
 * LAS DOS PESTAÑAS DEL PROGRAMA, que son dos enlaces.
 *
 * No hay estado de cliente que mantener: cambiar de día es cambiar de URL, así
 * que funciona sin JavaScript, se puede compartir el enlace y el botón de atrás
 * hace lo que se espera.
 */
function Conmutador({
  clave,
  lista,
  variante,
}: {
  clave: ClaveLista;
  lista: ListaDeContenido;
  variante: string | undefined;
}) {
  if (lista.destino.clase !== "partida") return null;

  return (
    <nav aria-label={t(lista.titulo)}>
      <ul className="flex flex-wrap gap-interno-compacto">
        {lista.destino.opciones.map((opcion) => {
          const actual = opcion.valor === variante;
          return (
            <li key={opcion.valor}>
              <Link
                href={`${rutaDeLista(clave)}?variante=${opcion.valor}`}
                prefetch={false}
                aria-current={actual ? "page" : undefined}
                className={`flex min-h-control-compacto items-center rounded-campo px-elemento text-etiqueta uppercase tracking-etiqueta transicion-color ${
                  actual
                    ? "bg-marca-tenue text-tinta-marca"
                    : "text-tinta-suave hover:bg-superficie-hundida hover:text-tinta"
                }`}
              >
                {t(opcion.rotulo)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AvisoSeccionApagada({
  seccion,
  nombreSeccion,
  puedeEditar,
}: {
  seccion: string;
  nombreSeccion: string;
  puedeEditar: boolean;
}) {
  return (
    <div className="grid gap-interno rounded-campo bg-aviso-fondo p-interno">
      <p role="status" className="text-pequeno text-aviso-tinta">
        {t("panel.contenido.listas.comun.seccionApagada", { seccion: nombreSeccion })}
      </p>

      {/*
        Encender desde aquí lleva de vuelta al interruptor, que es donde vive esa
        acción. No es un rodeo: al llegar se ve la sección ya encendida y, al
        lado, si le falta algo más para salir.
      */}
      {puedeEditar ? (
        <form action={alternarVisible} className="justify-self-start">
          <input type="hidden" name="seccion" value={seccion} />
          <input type="hidden" name="visible" value="si" />
          <Boton type="submit" jerarquia="secundario">
            {t("panel.contenido.listas.comun.encenderSeccion", { seccion: nombreSeccion })}
          </Boton>
        </form>
      ) : null}
    </div>
  );
}

/** El formulario de alta, siempre a la vista y siempre el primero. */
function Alta({
  clave,
  lista,
  variante,
  campoConFallo,
  estado,
}: {
  clave: ClaveLista;
  lista: ListaDeContenido;
  variante: string | undefined;
  campoConFallo: string;
  estado: EstadoLista | null;
}) {
  return (
    <section className="rounded-tarjeta border border-borde p-interno">
      <Titulo3 como="h2">{t("panel.contenido.listas.comun.anadirTitulo")}</Titulo3>

      <form action={crearFicha} className="mt-elemento grid gap-elemento">
        <input type="hidden" name="lista" value={clave} />
        {variante ? <input type="hidden" name="variante" value={variante} /> : null}

        {lista.campos.map((campo) => (
          <Campo
            key={campo.columna}
            campo={campo}
            valor=""
            error={mensajeDeFallo(campo, campoConFallo, estado)}
          />
        ))}

        <Boton type="submit" className="justify-self-start">
          {t("panel.contenido.listas.comun.anadir")}
        </Boton>
      </form>
    </section>
  );
}

/**
 * El mensaje que va DENTRO del control que falló, no sólo arriba.
 *
 * Un aviso general —«falta rellenar algo»— obliga a mirar campo por campo. Con
 * el error pegado al campo, y con la ficha abierta por el servidor, lo que hay
 * que arreglar está a la vista al llegar.
 */
function mensajeDeFallo(
  campo: CampoDeLista,
  campoConFallo: string,
  estado: EstadoLista | null,
): string | undefined {
  if (campo.columna !== campoConFallo) return undefined;

  const etiqueta = t(campo.etiqueta);

  if (estado === "falta") {
    return t("panel.contenido.listas.comun.errorFalta", { campo: etiqueta });
  }
  if (estado === "largo") {
    return t("panel.contenido.listas.comun.errorLargo", {
      campo: etiqueta,
      largo: campo.largo,
    });
  }
  return undefined;
}

function Campo({
  campo,
  valor,
  error,
}: {
  campo: CampoDeLista;
  valor: string;
  error: string | undefined;
}) {
  const comunes = {
    name: campo.columna,
    defaultValue: valor,
    etiqueta: t(campo.etiqueta),
    ayuda: campo.ayuda ? t(campo.ayuda) : undefined,
    error,
    required: campo.obligatorio,
    maxLength: campo.largo,
  };

  return campo.clase === "parrafo" ? (
    <CampoTextoLargo {...comunes} rows={3} />
  ) : (
    <CampoTexto {...comunes} type="text" />
  );
}

function Ficha({
  clave,
  lista,
  variante,
  fila,
  puedeEditar,
  esLaPrimera,
  esLaUltima,
  estado,
  campoConFallo,
  senalada,
}: {
  clave: ClaveLista;
  lista: ListaDeContenido;
  variante: string | undefined;
  fila: FilaDeContenido;
  puedeEditar: boolean;
  esLaPrimera: boolean;
  esLaUltima: boolean;
  estado: EstadoLista | null;
  campoConFallo: string;
  senalada: boolean;
}) {
  /*
    El primer campo hace de título de la ficha. No es una convención caprichosa:
    el descriptor pone primero el que identifica la fila —la hora, el medio, la
    pregunta—, que es por lo que se busca en una lista de dieciocho.
  */
  const primerCampo = lista.campos[0];
  const titulo = fila.valores[primerCampo.columna] ?? "";

  const confirmando = senalada && estado === "confirmar-borrado";
  const conFallo = senalada && (estado === "falta" || estado === "largo");

  const ocultos = (
    <>
      <input type="hidden" name="lista" value={clave} />
      {variante ? <input type="hidden" name="variante" value={variante} /> : null}
      <input type="hidden" name="ficha" value={fila.id} />
    </>
  );

  return (
    <li
      className={`grid gap-interno rounded-tarjeta border p-interno ${
        fila.publicado ? "border-borde" : "border-borde-fuerte bg-superficie-tenue"
      }`}
    >
      <div className="flex flex-wrap items-center gap-interno-compacto">
        <Titulo3 como="h3">{titulo}</Titulo3>
        <EtiquetaEstado variante={fila.publicado ? "marca" : "contorno"} tamano="versalita">
          {fila.publicado
            ? t("panel.contenido.listas.comun.enLaWeb")
            : t("panel.contenido.listas.comun.retirada")}
        </EtiquetaEstado>
      </div>

      {/* El resto de campos, para reconocer la ficha sin abrirla. */}
      {lista.campos.slice(1).map((campo) =>
        fila.valores[campo.columna] ? (
          <Cuerpo key={campo.columna} className="text-pequeno text-tinta-suave text-pretty">
            {fila.valores[campo.columna]}
          </Cuerpo>
        ) : null,
      )}

      {puedeEditar ? (
        <>
          {/*
            LA FICHA QUE FALLÓ VIENE ABIERTA, y la abre el SERVIDOR con el
            `open`. Tras un error de validación, el campo que hay que arreglar
            está a la vista al llegar — sin una línea de JavaScript y sin que
            haya que acordarse de cuál de las dieciocho se estaba editando.
          */}
          <details open={conFallo} className="border-t border-borde pt-interno">
            <summary className="cursor-pointer text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
              {t("panel.contenido.listas.comun.editarFicha")}
            </summary>

            <form action={guardarFicha} className="mt-elemento grid gap-elemento">
              {ocultos}
              {lista.campos.map((campo) => (
                <Campo
                  key={campo.columna}
                  campo={campo}
                  valor={fila.valores[campo.columna] ?? ""}
                  error={senalada ? mensajeDeFallo(campo, campoConFallo, estado) : undefined}
                />
              ))}
              <Boton type="submit" className="justify-self-start">
                {t("panel.contenido.listas.comun.guardar")}
              </Boton>
            </form>
          </details>

          {confirmando ? (
            <Confirmacion clave={clave} variante={variante} fila={fila} titulo={titulo} />
          ) : (
            <Botones
              clave={clave}
              variante={variante}
              fila={fila}
              esLaPrimera={esLaPrimera}
              esLaUltima={esLaUltima}
              ocultos={ocultos}
            />
          )}
        </>
      ) : null}
    </li>
  );
}

function Botones({
  clave,
  variante,
  fila,
  esLaPrimera,
  esLaUltima,
  ocultos,
}: {
  clave: ClaveLista;
  variante: string | undefined;
  fila: FilaDeContenido;
  esLaPrimera: boolean;
  esLaUltima: boolean;
  ocultos: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-interno-compacto">
      <form action={alternarPublicado}>
        {ocultos}
        <input type="hidden" name="publicado" value={fila.publicado ? "no" : "si"} />
        <Boton type="submit" jerarquia="terciario">
          {fila.publicado
            ? t("panel.contenido.listas.comun.retirar")
            : t("panel.contenido.listas.comun.publicar")}
        </Boton>
      </form>

      <form action={pedirBorrado}>
        {ocultos}
        <Boton type="submit" jerarquia="terciario">
          {t("panel.contenido.listas.comun.borrar")}
        </Boton>
      </form>

      {/* El botón que no lleva a ningún sitio no se pinta, en vez de pintarse
          desactivado: apagado se lee como «esto está roto». */}
      {!esLaPrimera ? (
        <Mover clave={clave} variante={variante} fila={fila} direccion="subir" />
      ) : null}
      {!esLaUltima ? (
        <Mover clave={clave} variante={variante} fila={fila} direccion="bajar" />
      ) : null}
    </div>
  );
}

function Mover({
  clave,
  variante,
  fila,
  direccion,
}: {
  clave: ClaveLista;
  variante: string | undefined;
  fila: FilaDeContenido;
  direccion: "subir" | "bajar";
}) {
  return (
    <form action={moverFicha}>
      <input type="hidden" name="lista" value={clave} />
      {variante ? <input type="hidden" name="variante" value={variante} /> : null}
      <input type="hidden" name="ficha" value={fila.id} />
      <input type="hidden" name="direccion" value={direccion} />
      <Boton type="submit" jerarquia="terciario">
        {t(direccion === "subir" ? "panel.contenido.subirOrden" : "panel.contenido.bajarOrden")}
      </Boton>
    </form>
  );
}

/**
 * LA PREGUNTA ANTES DE BORRAR, CON LA SALIDA SUAVE AL LADO.
 *
 * Quien llega aquí ya ha pulsado «Borrar» una vez, así que lo que hace falta no
 * es repetir la advertencia: es ofrecerle lo que probablemente quería. «Mejor
 * sólo retirarla» hace lo que casi siempre se busca —que deje de verse— sin
 * perder lo escrito.
 */
function Confirmacion({
  clave,
  variante,
  fila,
  titulo,
}: {
  clave: ClaveLista;
  variante: string | undefined;
  fila: FilaDeContenido;
  titulo: string;
}) {
  const ocultos = (
    <>
      <input type="hidden" name="lista" value={clave} />
      {variante ? <input type="hidden" name="variante" value={variante} /> : null}
      <input type="hidden" name="ficha" value={fila.id} />
    </>
  );

  return (
    <div className="grid gap-interno rounded-campo bg-error-fondo p-interno">
      <p role="alert" className="text-pequeno text-error-tinta">
        {t("panel.contenido.listas.comun.borrarPregunta", { ficha: titulo })}
      </p>

      <div className="flex flex-wrap gap-interno-compacto">
        <form action={borrarFicha}>
          {ocultos}
          <Boton type="submit" jerarquia="secundario">
            {t("panel.contenido.listas.comun.borrarConfirmar")}
          </Boton>
        </form>

        {fila.publicado ? (
          <form action={alternarPublicado}>
            {ocultos}
            <input type="hidden" name="publicado" value="no" />
            <Boton type="submit" jerarquia="terciario">
              {t("panel.contenido.listas.comun.borrarMejorRetirar")}
            </Boton>
          </form>
        ) : null}
      </div>

      <Etiqueta className="block">{t("panel.contenido.listas.comun.diferencia")}</Etiqueta>
    </div>
  );
}
