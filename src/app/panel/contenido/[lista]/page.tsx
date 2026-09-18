import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto, CampoTextoLargo } from "@/components/ui/campo";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import { BUCKET_MEDIOS, RUTA_ACCESO, RUTA_CONTENIDO, RUTA_MEDIOS } from "@/config/constants";
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
  obtenerFotosDeSeccion,
  obtenerVisibilidadDeSeccion,
  type FilaDeContenido,
  type FotoElegible,
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
  enlace: "",
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

  /*
    LAS FOTOS SE LEEN UNA VEZ PARA TODA LA PANTALLA, no una por ficha. Con
    dieciocho fichas y su formulario cada una serían dieciocho consultas
    idénticas; el montón entre el que se elige es el mismo para todas.
  */
  const conFoto = lista.campos.filter((campo) => campo.clase === "foto");

  const [filas, visible, fotosPorCampo] = await Promise.all([
    obtenerFilasDeLista(clave, variante),
    obtenerVisibilidadDeSeccion(seccion),
    Promise.all(conFoto.map((campo) => obtenerFotosDeSeccion(campo.seccion))).then((listas) =>
      Object.fromEntries(conFoto.map((campo, indice) => [campo.columna, listas[indice]])),
    ),
  ]);

  // La base de las imágenes del almacén. Sin ella no hay miniaturas, y el
  // selector sigue funcionando: se elige por el texto alternativo.
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL;

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
          fotosPorCampo={fotosPorCampo}
          urlBase={urlBase}
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
                  fotosPorCampo={fotosPorCampo}
                  urlBase={urlBase}
                />
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}

/** Las fotos elegibles de cada campo de foto, indexadas por su columna. */
type FotosPorCampo = Record<string, FotoElegible[]>;

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
  fotosPorCampo,
  urlBase,
}: {
  clave: ClaveLista;
  lista: ListaDeContenido;
  variante: string | undefined;
  campoConFallo: string;
  estado: EstadoLista | null;
  fotosPorCampo: FotosPorCampo;
  urlBase: string | undefined;
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
            fotos={fotosPorCampo[campo.columna] ?? []}
            urlBase={urlBase}
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
  // Una foto no tiene largo ni es obligatoria, así que no hay nada suyo que
  // contar aquí: si algo falla con ella, falla al escribir y sale arriba.
  if (campo.clase === "foto") return undefined;

  if (estado === "largo") {
    return t("panel.contenido.listas.comun.errorLargo", {
      campo: etiqueta,
      largo: campo.largo,
    });
  }
  if (estado === "enlace") {
    return t("panel.contenido.listas.comun.errorEnlace", { campo: etiqueta });
  }
  return undefined;
}

function Campo({
  campo,
  valor,
  error,
  fotos,
  urlBase,
}: {
  campo: CampoDeLista;
  valor: string;
  error: string | undefined;
  fotos: FotoElegible[];
  urlBase: string | undefined;
}) {
  if (campo.clase === "foto") {
    return <ElegirFoto campo={campo} valor={valor} fotos={fotos} urlBase={urlBase} />;
  }

  const comunes = {
    name: campo.columna,
    defaultValue: valor,
    etiqueta: t(campo.etiqueta),
    ayuda: campo.ayuda ? t(campo.ayuda) : undefined,
    error,
    required: campo.obligatorio,
    maxLength: campo.largo,
  };

  if (campo.clase === "parrafo") return <CampoTextoLargo {...comunes} rows={3} />;

  /*
    `type="url"` y no `text`: el teclado del móvil cambia —sale la barra, el
    punto y el «.com»— y el navegador valida antes de mandar. Lo que manda sigue
    siendo el servidor, que repite la comprobación con la misma expresión que el
    `CHECK` de la tabla.
  */
  return <CampoTexto {...comunes} type={campo.clase === "enlace" ? "url" : "text"} />;
}

/**
 * ELEGIR UNA FOTO DE LAS QUE YA ESTÁN SUBIDAS.
 *
 * SON RADIOS Y NO UN `select`, porque lo que se elige es una imagen: en una
 * lista desplegable sólo se lee el texto alternativo, y entonces hay que
 * acordarse de cuál era «pareja en el puente». Con las miniaturas a la vista se
 * elige mirando, que es como se elige una foto.
 *
 * Y SIN UNA LÍNEA DE JAVASCRIPT: un grupo de radios nativo, con su `fieldset` y
 * su `legend`, que funciona con el teclado, con lector de pantalla y con el
 * bundle a medio cargar, igual que el resto de la pantalla.
 *
 * AQUÍ NO SE SUBE NADA. Subir vive en Fotos y vídeos, con su texto alternativo
 * obligatorio y su borrado del fichero; duplicarlo sería tener dos sitios donde
 * arreglar el mismo tratamiento de imágenes y dos criterios sobre accesibilidad.
 */
function ElegirFoto({
  campo,
  valor,
  fotos,
  urlBase,
}: {
  campo: Extract<CampoDeLista, { clase: "foto" }>;
  valor: string;
  fotos: FotoElegible[];
  urlBase: string | undefined;
}) {
  /*
    LA FOTO QUE YA TIENE LA FICHA, AUNQUE YA NO SE OFREZCA. Pasa de verdad: se
    retira esa imagen desde Fotos y vídeos y deja de estar entre las elegibles.
    Sin esta opción, la ficha llegaría aquí con su foto y guardar la borraría sin
    avisar — un dato perdido por abrir una pantalla.
  */
  const yaNoSeOfrece = valor !== "" && !fotos.some((foto) => foto.id === valor);

  return (
    <fieldset className="grid gap-pila">
      <legend className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
        {t(campo.etiqueta)}
      </legend>

      {campo.ayuda ? (
        <span className="text-pequeno text-tinta-suave">{t(campo.ayuda)}</span>
      ) : null}

      {fotos.length === 0 && !yaNoSeOfrece ? (
        <p className="text-pequeno text-tinta-suave">
          {t("panel.contenido.listas.comun.sinFotosQueElegir")}{" "}
          <Link href={RUTA_MEDIOS} prefetch={false} className="underline underline-offset-4">
            {t("panel.contenido.listas.comun.irAMedios")}
          </Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-interno">
          <OpcionDeFoto
            campo={campo}
            id=""
            rotulo={t("panel.contenido.listas.comun.sinFoto")}
            elegida={valor === ""}
          />

          {yaNoSeOfrece ? (
            <OpcionDeFoto
              campo={campo}
              id={valor}
              rotulo={t("panel.contenido.listas.comun.fotoActual")}
              elegida
            />
          ) : null}

          {fotos.map((foto) => (
            <OpcionDeFoto
              key={foto.id}
              campo={campo}
              id={foto.id}
              rotulo={foto.textoAlternativo}
              elegida={valor === foto.id}
              fuente={
                urlBase
                  ? `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${foto.ruta}`
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}

function OpcionDeFoto({
  campo,
  id,
  rotulo,
  elegida,
  fuente,
}: {
  campo: Extract<CampoDeLista, { clase: "foto" }>;
  id: string;
  rotulo: string;
  elegida: boolean;
  fuente?: string;
}) {
  return (
    <label className="flex min-h-control-compacto cursor-pointer items-center gap-interno-compacto rounded-campo border border-borde p-interno-compacto transicion-color hover:bg-superficie-hundida has-checked:border-borde-marca has-checked:bg-marca-tenue">
      <input
        type="radio"
        name={campo.columna}
        value={id}
        defaultChecked={elegida}
        className="size-casilla accent-marca"
      />

      {fuente ? (
        <span className="relative size-miniatura overflow-hidden rounded-campo bg-superficie-hundida">
          <Image
            src={fuente}
            alt=""
            fill
            sizes="120px"
            className="object-cover"
            // Sin optimizar: son miniaturas de gestión, no páginas públicas.
            unoptimized
          />
        </span>
      ) : null}

      {/* El texto alternativo ES el rótulo: es lo que distingue una foto de
          otra para quien no la ve, y por eso la imagen va con `alt` vacío. */}
      <span className="text-pequeno text-tinta">{rotulo}</span>
    </label>
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
  fotosPorCampo,
  urlBase,
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
  fotosPorCampo: FotosPorCampo;
  urlBase: string | undefined;
}) {
  /*
    El primer campo hace de título de la ficha. No es una convención caprichosa:
    el descriptor pone primero el que identifica la fila —la hora, el medio, la
    pregunta—, que es por lo que se busca en una lista de dieciocho.
  */
  const primerCampo = lista.campos[0];
  const titulo = fila.valores[primerCampo.columna] ?? "";

  /*
    Y CÓMO SE LLAMA NO ES LO MISMO QUE CÓMO SE ENCABEZA. En el programa la
    tarjeta lleva la hora arriba —que es por lo que se busca— y se llama por su
    título: «¿Borramos «21:00»?» no pregunta nada, y con dos cosas a esa hora
    tampoco distingue. En las otras tres coinciden, y ahí no se nota.
  */
  const nombre = fila.valores[lista.columnaNombre] || titulo;

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
            <summary className="inline-flex min-h-control-compacto cursor-pointer items-center text-etiqueta uppercase tracking-etiqueta text-tinta-suave transicion-color hover:text-tinta">
              {t("panel.contenido.listas.comun.editarFicha")}
              <DeQueFicha nombre={nombre} />
            </summary>

            <form action={guardarFicha} className="mt-elemento grid gap-elemento">
              {ocultos}
              {lista.campos.map((campo) => (
                <Campo
                  key={campo.columna}
                  campo={campo}
                  valor={fila.valores[campo.columna] ?? ""}
                  error={senalada ? mensajeDeFallo(campo, campoConFallo, estado) : undefined}
                  fotos={fotosPorCampo[campo.columna] ?? []}
                  urlBase={urlBase}
                />
              ))}
              <Boton type="submit" className="justify-self-start">
                {t("panel.contenido.listas.comun.guardar")}
                <DeQueFicha nombre={nombre} />
              </Boton>
            </form>
          </details>

          {confirmando ? (
            <Confirmacion clave={clave} variante={variante} fila={fila} nombre={nombre} />
          ) : (
            <Botones
              clave={clave}
              variante={variante}
              fila={fila}
              nombre={nombre}
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

/**
 * DE QUÉ FICHA ES ESTE BOTÓN.
 *
 * En una lista de dieciocho hay dieciocho «Borrar», dieciocho «Editar» y
 * dieciocho «Bajar en el orden». Quien recorre la pantalla con un lector los oye
 * todos iguales y tiene que ir contando, y quien la maneja por voz no tiene
 * forma de decir cuál.
 *
 * VA COMO TEXTO OCULTO DENTRO DEL BOTÓN Y NO COMO `aria-label`, y la diferencia
 * no es de estilo. Un `aria-label` SUSTITUYE al rótulo visible, así que el
 * nombre accesible pasaría a ser «Borrar 14:00» mientras en la pantalla pone
 * «Borrar» — y quien manda por voz dice lo que LEE. Añadiéndolo dentro, el
 * rótulo visible sigue entero y en orden dentro del nombre accesible, que es
 * justo lo que pide la regla del nombre en la etiqueta (WCAG 2.5.3). Es la
 * misma pieza que `DeQueSeccion` en el interruptor de secciones.
 */
function DeQueFicha({ nombre }: { nombre: string }) {
  return <span className="sr-only"> {nombre}</span>;
}

function Botones({
  clave,
  variante,
  fila,
  nombre,
  esLaPrimera,
  esLaUltima,
  ocultos,
}: {
  clave: ClaveLista;
  variante: string | undefined;
  fila: FilaDeContenido;
  nombre: string;
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
          <DeQueFicha nombre={nombre} />
        </Boton>
      </form>

      <form action={pedirBorrado}>
        {ocultos}
        <Boton type="submit" jerarquia="terciario">
          {t("panel.contenido.listas.comun.borrar")}
          <DeQueFicha nombre={nombre} />
        </Boton>
      </form>

      {/* El botón que no lleva a ningún sitio no se pinta, en vez de pintarse
          desactivado: apagado se lee como «esto está roto». */}
      {!esLaPrimera ? (
        <Mover
          clave={clave}
          variante={variante}
          fila={fila}
          nombre={nombre}
          direccion="subir"
        />
      ) : null}
      {!esLaUltima ? (
        <Mover
          clave={clave}
          variante={variante}
          fila={fila}
          nombre={nombre}
          direccion="bajar"
        />
      ) : null}
    </div>
  );
}

function Mover({
  clave,
  variante,
  fila,
  nombre,
  direccion,
}: {
  clave: ClaveLista;
  variante: string | undefined;
  fila: FilaDeContenido;
  nombre: string;
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
        <DeQueFicha nombre={nombre} />
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
  nombre,
}: {
  clave: ClaveLista;
  variante: string | undefined;
  fila: FilaDeContenido;
  nombre: string;
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
        {t("panel.contenido.listas.comun.borrarPregunta", { ficha: nombre })}
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
