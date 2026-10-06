"use server";

import { redirect, RedirectType } from "next/navigation";

import { BUCKET_MEDIOS, LARGOS_DE_CAMPO, RUTA_ACCESO } from "@/config/constants";
import { SECCIONES, type Seccion } from "@/config/secciones";
import { medirImagen } from "@/lib/dimensiones";
import {
  admitirFichero,
  componerRuta,
  esRutaDeSeccion,
  identificadorDeRuta,
  type Veredicto,
} from "@/lib/medios";
import { tiposQuePinta } from "@/lib/medios-en-la-web";
import { accesoActual, ceroFilasEsFaltaDePermiso } from "@/lib/sesion";
import { clienteDeServicio, haySubidaDeMedios } from "@/lib/supabase/servicio";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import {
  ESTADOS_DE_ERROR,
  destinoDe,
  type EstadoMedios,
  type FicheroASubir,
  type SubidaPreparada,
} from "./estado";

/**
 * BODA-29 · SUBIR, PUBLICAR, ORDENAR Y BORRAR
 *
 * La otra mitad del gestor de medios: hasta aquí había un bucket, un cliente
 * capaz de escribir en él y las funciones puras que deciden qué se admite.
 * Esto es lo que las usa.
 *
 *
 * EL ORDEN DE LAS DOS ESCRITURAS, QUE ES LA DECISIÓN IMPORTANTE
 *
 * Una subida toca dos sitios que no comparten transacción: la FILA en
 * `public.medios` y el OBJETO en Storage. Da igual cuál se haga primero, puede
 * fallar el segundo — así que lo que hay que elegir es qué basura se prefiere.
 *
 *   · Objeto primero: si la fila no entra, queda un fichero huérfano que ocupa
 *     espacio, que nadie ve y del que nadie se entera nunca.
 *   · FILA PRIMERO —lo que se hace aquí—: si el objeto no sube, se borra la
 *     fila acto seguido y no queda nada.
 *
 * Y hay un motivo mejor que la limpieza: **la fila la escribe el cliente de
 * SESIÓN**, así que `medios_editor_escribir` —o sea `puede_editar()`— decide
 * antes de que un solo byte llegue a Storage. Con el objeto primero, un lector
 * podría llenar el bucket y enterarse después de que no tenía permiso.
 *
 * La fila nace `publicado = false`, así que durante ese instante en que existe
 * sin fichero detrás no se ve en ninguna parte: la landing lee sólo lo
 * publicado.
 *
 *
 * RLS NO GRITA, CALLA. Una escritura prohibida no devuelve error: devuelve cero
 * filas tocadas. Por eso cada operación pide de vuelta lo que ha escrito y mira
 * si vino algo, en lugar de conformarse con que `error` sea nulo.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

function fichero(datos: FormData, campo: string): File | null {
  const valor = datos.get(campo);
  return valor instanceof File && valor.size > 0 ? valor : null;
}

function esSeccion(valor: string): valor is Seccion {
  return (SECCIONES as readonly string[]).includes(valor);
}

/**
 * NO SE REVALIDA LA RUTA A LA QUE SE VA A REDIRIGIR: la pantalla es
 * `force-dynamic`, así que la redirección ya la vuelve a leer entera, y
 * revalidar además compite con ella y se come el `?estado=`.
 *
 * TODO RECHAZO DEJA UNA LÍNEA EN EL REGISTRO, y no es ruido: sin ella, una
 * subida rechazada era **silencio absoluto** en el servidor. Costó dos vueltas
 * de CI —una subida fallaba y el log no decía nada, así que había que adivinar
 * cuál de las siete comprobaciones había saltado—. Al invitado se le sigue
 * diciendo lo mismo de siempre; esto es para quien mira el registro después.
 *
 * SE SUSTITUYE LA ENTRADA DEL HISTORIAL EN VEZ DE APILAR OTRA. Es el patrón
 * clásico de enviar-redirigir-mostrar: la URL con `?estado=` es el acuse de un
 * envío que ya ocurrió, no un sitio al que se pueda volver. Apilándola, el botón
 * de atrás lleva a `?estado=subido` y la pantalla vuelve a felicitar por una
 * subida hecha hace diez minutos; y encadenando acciones —subir, publicar,
 * mover— hacen falta cuatro pulsaciones de atrás para salir de una pantalla en
 * la que sólo se ha entrado una vez.
 *
 * De paso mide algo de #126: el rastro de CI enseña que la redirección viaja
 * como `…?estado=subido;push` y que el enrutador no la aplica. Si con `replace`
 * sí la aplica, el problema está en cómo el enrutador apila una navegación a la
 * ruta en la que ya está.
 */
function volver(
  estado: EstadoMedios,
  donde: { medio?: string; seccion?: Seccion } = {},
): never {
  if (ESTADOS_DE_ERROR.includes(estado)) {
    console.warn(`Subida de medio rechazada: ${estado}`);
  }

  /*
    Y SE VUELVE A DONDE SE ESTABA. Sin ancla, cada acción subía la pantalla a la
    cabecera: para bajar una foto cuatro puestos en la galería había que
    volver a buscarla cuatro veces, y el aviso salía arriba, lejos de la foto.
  */
  redirect(destinoDe(estado, donde), RedirectType.replace);
}

async function cliente() {
  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  return clienteServidor();
}

/**
 * Traduce el fallo de la base a un estado de pantalla.
 *
 * `42501` y `MED03` son «no tienes permiso»; `MED01` es el trigger del texto
 * alternativo. El resto es una avería nuestra y se registra entera: el mensaje
 * de PostgREST dice qué restricción saltó, y esa línea es la diferencia entre
 * arreglarlo en un minuto o a ciegas.
 */
function motivo(error: { code?: string; message?: string } | null): EstadoMedios {
  if (!error) return "error";
  if (error.code === "42501" || error.message?.includes("MED03")) return "sin-permiso";
  if (error.message?.includes("MED01")) return "sin-alternativo";
  // `reordenar_medio()` no la encuentra: se borró en otra pestaña. No es una
  // avería, y «inténtalo de nuevo» no arreglaría nada.
  if (error.message?.includes("MED02")) return "no-existe";
  console.error("Fallo al escribir en medios:", error);
  return "error";
}

/** Lo que se sabe de un fichero sin abrirlo: su tipo y su peso. */
interface FicheroPedido {
  type: string;
  size: number;
}

/**
 * Lo que manda el navegador como descripción de un fichero, comprobado: viene
 * de fuera, y un `size` que no fuera un número dejaría pasar cualquier peso.
 */
function comoFicheroPedido(valor: unknown): FicheroPedido | null {
  if (typeof valor !== "object" || valor === null) return null;
  const { type, size } = valor as Record<string, unknown>;
  return typeof type === "string" &&
    typeof size === "number" &&
    Number.isFinite(size) &&
    size > 0
    ? { type, size }
    : null;
}

type Admitido = Extract<Veredicto, { admitido: true }>;

/**
 * TODO LO QUE SE PUEDE SABER SIN TOCAR STORAGE, igual se suba por el servidor
 * o desde el navegador: quién sube, a qué sección, con qué texto alternativo,
 * qué tipo y qué peso —y, si es vídeo, su póster—. Lo que no vale vuelve con su
 * motivo antes de que viaje un solo byte.
 */
async function validarSubida(pedido: {
  seccion: string;
  alternativo: string;
  fichero: FicheroPedido | null;
  poster: FicheroPedido | null;
}): Promise<{
  seccion: Seccion;
  alternativo: string;
  veredicto: Admitido;
  veredictoPoster: Admitido | null;
  perfilId: string;
}> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso");

  if (!haySubidaDeMedios) volver("sin-configurar");

  if (!esSeccion(pedido.seccion)) volver("error");
  const seccion: Seccion = pedido.seccion;

  const alternativo = pedido.alternativo.trim();
  if (
    alternativo.length < 3 ||
    alternativo.length > LARGOS_DE_CAMPO["medios.texto_alternativo"]
  ) {
    volver("sin-alternativo", { seccion });
  }

  const original = pedido.fichero;
  if (!original) volver("sin-fichero", { seccion });

  const veredicto = admitirFichero(original);
  if (!veredicto.admitido) {
    volver(veredicto.motivo === "tipo" ? "tipo-no-admitido" : "demasiado-grande", { seccion });
  }
  // Admitido en el bucket no es admitido AQUÍ: un vídeo en la galería no sale.
  if (!tiposQuePinta(seccion).includes(original.type)) volver("tipo-no-admitido", { seccion });

  /*
    UN VÍDEO SIN PÓSTER NO ENTRA, y no es una manía: el póster es lo que se ve
    mientras carga, lo que se ve si el navegador se niega a reproducirlo y —lo
    que de verdad importa— lo que ve quien ha pedido no ver movimiento. La base
    lo exige con `medios_poster_solo_de_video`; aquí se comprueba antes para
    poder decirlo con palabras en vez de con un error de restricción.
  */
  const poster = pedido.poster;
  if (veredicto.tipo === "video" && !poster) volver("sin-poster", { seccion });

  let veredictoPoster: Admitido | null = null;
  if (veredicto.tipo === "video" && poster) {
    const delPoster = admitirFichero(poster);
    if (!delPoster.admitido) {
      volver(delPoster.motivo === "tipo" ? "tipo-no-admitido" : "demasiado-grande", {
        seccion,
      });
    }
    // Un vídeo de póster no es un póster: lo que hace falta es un fotograma.
    if (delPoster.tipo !== "imagen") volver("tipo-no-admitido", { seccion });
    veredictoPoster = delPoster;
  }

  return { seccion, alternativo, veredicto, veredictoPoster, perfilId: acceso.perfilId };
}

/** Una ruta nueva en el bucket, con el azar que le toca. */
function rutaNueva(seccion: Seccion, veredicto: Admitido): string {
  return componerRuta(seccion, veredicto.extension, identificadorDeRuta(Math.random()));
}

/**
 * LA FILA, CON LA SESIÓN: es aquí donde RLS —`medios_editor_escribir`, o sea
 * `puede_editar()`— dice si esta persona puede. Nace sin publicar, así que
 * mientras no hay fichero detrás no se ve en ninguna parte.
 */
async function insertarFila(datos: {
  ruta: string;
  rutaPoster: string | null;
  alternativo: string;
  seccion: Seccion;
  tipo: Admitido["tipo"];
  medida: { ancho: number; alto: number } | null;
  perfilId: string;
}): Promise<{ id: string }> {
  const supabase = await cliente();
  const { data: fila, error } = await supabase
    .from("medios")
    .insert({
      ruta_almacenamiento: datos.ruta,
      poster_ruta: datos.rutaPoster,
      texto_alternativo: { es: datos.alternativo },
      seccion: datos.seccion,
      tipo: datos.tipo,
      ancho: datos.medida?.ancho ?? null,
      alto: datos.medida?.alto ?? null,
      publicado: false,
      // `perfiles.id`, NO el de Auth: es a `perfiles` a quien apunta
      // `medios_subido_por_fk`. Ver el comentario de `Acceso` en `sesion.ts`.
      subido_por: datos.perfilId,
    })
    .select("id")
    .maybeSingle();

  if (error || !fila) volver(motivo(error), { seccion: datos.seccion });
  return fila;
}

/**
 * SUBIR UN MEDIO, POR EL SERVIDOR. Es el camino sin JavaScript: el fichero
 * viaja dentro del formulario. Con JavaScript el formulario va por
 * `prepararSubida` y `confirmarSubida`, y el fichero no pasa por aquí —en
 * Vercel, una petición de más de 4,5 MB no llega ni a ejecutarse—.
 *
 * Todo lo que se puede saber sin tocar la red se comprueba antes de tocarla.
 */
export async function subirMedio(datos: FormData): Promise<void> {
  const original = fichero(datos, "fichero");
  const poster = fichero(datos, "poster");
  const { seccion, alternativo, veredicto, veredictoPoster, perfilId } = await validarSubida({
    seccion: texto(datos, "seccion"),
    alternativo: texto(datos, "texto_alternativo"),
    fichero: original,
    poster,
  });
  // `validarSubida` ya ha vuelto si no hay fichero; esto es para el compilador.
  if (!original) volver("sin-fichero", { seccion });

  const bytes = new Uint8Array(await original.arrayBuffer());

  /*
    EL TAMAÑO SE MIDE DEL FICHERO, NO SE PIDE.

    Ancho y alto son lo que deja reservar el hueco antes de que la imagen
    cargue, y sin ellos vuelve el salto de maquetación. Pedírselos a quien sube
    la foto sería pedirle un dato que no tiene a mano y que va a rellenar mal.
    `medirImagen` devuelve `null` para lo que no sabe leer —AVIF, y todo
    vídeo—, y eso es un resultado válido: la columna admite vacío, y `medios_
    dimensiones_coherentes` sólo exige que ancho y alto vayan juntos.
  */
  const medida = veredicto.tipo === "imagen" ? medirImagen(bytes) : null;

  const ruta = rutaNueva(seccion, veredicto);
  const rutaPoster = veredictoPoster ? rutaNueva(seccion, veredictoPoster) : null;

  // 1. LA FILA PRIMERO. Aquí es donde RLS dice si esta persona puede o no.
  const fila = await insertarFila({
    ruta,
    rutaPoster,
    alternativo,
    seccion,
    tipo: veredicto.tipo,
    medida,
    perfilId,
  });

  // 2. Y AHORA LOS FICHEROS, con la única llave que abre Storage.
  const servicio = clienteDeServicio();

  /**
   * SUBE, Y EL PLAZO LO PONE EL CLIENTE, NO ESTA LLAMADA.
   *
   * El primer intento pasaba `signal` dentro de las opciones de `upload()`.
   * NO FUNCIONA, y el compilador lo estaba diciendo: la firma es
   * `upload(path, fileBody, fileOptions?: FileOptions)`, y `FileOptions` son
   * `cacheControl`, `contentType`, `upsert`, `duplex` y `metadata` — nada más.
   * `signal` vive en `FetchParameters`, que es lo que acepta `download()`, no
   * `upload()`. Se colaba con un `@ts-expect-error` puesto para callar
   * precisamente al aviso que tenía razón, y se descartaba en silencio.
   *
   * El plazo va ahora en el `fetch` del propio cliente (ver
   * `lib/supabase/servicio.ts`), que además lo aplica a TODA llamada de
   * Storage y no sólo a ésta.
   *
   * SE SUBE EL `File` TAL CUAL, no los bytes que se leyeron para medir. El
   * `File` es lo que trae `FormData` y lo que la librería sabe mandar sin
   * intermediarios; convertirlo a `Uint8Array` era un paso de más —los bytes
   * hacían falta para `medirImagen`, no para subir.
   */
  const subir = async (destino: string, contenido: File, tipoMime: string) => {
    const desde = Date.now();
    try {
      return await servicio.storage
        .from(BUCKET_MEDIOS)
        .upload(destino, contenido, { contentType: tipoMime, upsert: false });
    } catch (causa) {
      /*
        El abort por plazo NO llega aquí: `storage-js` lo recoge y lo devuelve
        como `{ error: "The operation was aborted due to timeout" }`, medido
        contra un servidor que acepta la conexión y no contesta. Este `catch`
        cubre lo otro —que la red se caiga de una forma que sí lance—, para que
        ninguna excepción se escape de la acción sin convertirse en una pantalla.
      */
      return { error: causa as { message?: string } };
    } finally {
      console.info(`Storage: ${destino} resuelto en ${Date.now() - desde} ms`);
    }
  };

  const { error: fallo } = await subir(ruta, original, original.type);

  let falloPoster = null;
  if (!fallo && rutaPoster && poster) {
    ({ error: falloPoster } = await subir(rutaPoster, poster, poster.type));
  }

  /*
    SI EL FICHERO NO SUBIÓ, LA FILA NO SE QUEDA. Una fila apuntando a un objeto
    que no existe es peor que no tener nada: se puede publicar, y entonces la
    landing pinta un hueco roto. Se deshace lo que se pueda —el vídeo, si el
    que falló fue el póster— y se vuelve con el error.
  */
  if (fallo || falloPoster) {
    console.error("No se pudo subir el fichero a Storage:", fallo ?? falloPoster);
    await (await cliente()).from("medios").delete().eq("id", fila.id);
    if (falloPoster) {
      await servicio.storage.from(BUCKET_MEDIOS).remove([ruta]);
    }
    volver("error", { seccion });
  }

  volver("subido", { medio: fila.id });
}

/**
 * SUBIR DESDE EL NAVEGADOR, EN TRES PASOS.
 *
 * El fichero va del navegador a Storage sin pasar por el servidor, porque por
 * el servidor no cabe: Vercel corta cualquier petición de más de 4,5 MB antes
 * de que llegue a ejecutarse, y una foto de móvil pesa cinco u ocho. La ayuda
 * prometía diez megas por foto y cincuenta por vídeo, y en producción no
 * entraba ni una foto normal.
 *
 *   1. `prepararSubida` comprueba lo mismo que siempre —quién, dónde, qué tipo,
 *      cuánto pesa, el texto alternativo, el póster— con lo que dice el
 *      navegador del fichero, y devuelve una URL de subida firmada por
 *      fichero. Sin fila todavía: si nadie confirma, no queda nada publicable.
 *   2. El navegador sube a esas URLs.
 *   3. `confirmarSubida` NO SE FÍA de lo que dijo el navegador: mira el tipo y
 *      el peso del objeto que llegó de verdad, lo mide si es una foto y sólo
 *      entonces da de alta la fila, con la sesión y RLS decidiendo. Si algo no
 *      vale, borra lo subido.
 *
 * Si la subida se corta a medias, `descartarSubida` borra lo que llegase. Lo
 * peor que puede quedar —el navegador se cierra entre el paso 2 y el 3— es un
 * fichero sin fila, con un nombre aleatorio que nadie conoce: no sale en
 * ninguna parte, igual que el huérfano que deja un borrado a medias.
 */
export async function prepararSubida(pedido: {
  seccion: string;
  alternativo: string;
  fichero: unknown;
  poster: unknown;
}): Promise<SubidaPreparada> {
  const { seccion, veredicto, veredictoPoster } = await validarSubida({
    seccion: String(pedido.seccion ?? ""),
    alternativo: String(pedido.alternativo ?? ""),
    fichero: comoFicheroPedido(pedido.fichero),
    poster: comoFicheroPedido(pedido.poster),
  });

  const servicio = clienteDeServicio();
  const firmar = async (ruta: string): Promise<FicheroASubir> => {
    const { data, error } = await servicio.storage
      .from(BUCKET_MEDIOS)
      .createSignedUploadUrl(ruta);
    if (error || !data) {
      console.error("No se pudo firmar la subida:", error);
      volver("error", { seccion });
    }
    return { ruta, url: data.signedUrl };
  };

  return {
    fichero: await firmar(rutaNueva(seccion, veredicto)),
    poster: veredictoPoster ? await firmar(rutaNueva(seccion, veredictoPoster)) : null,
  };
}

/** Lo que Storage dice de un objeto que ya está subido: su tipo y su peso. */
async function describirObjeto(ruta: string): Promise<FicheroPedido | null> {
  const corte = ruta.lastIndexOf("/");
  const nombre = ruta.slice(corte + 1);
  const { data } = await clienteDeServicio()
    .storage.from(BUCKET_MEDIOS)
    .list(ruta.slice(0, corte), { search: nombre });
  const metadatos = data?.find((objeto) => objeto.name === nombre)?.metadata as
    { size?: unknown; mimetype?: unknown } | undefined;
  return comoFicheroPedido({ type: metadatos?.mimetype, size: metadatos?.size });
}

export async function confirmarSubida(pedido: {
  seccion: string;
  alternativo: string;
  ruta: string;
  rutaPoster: string | null;
}): Promise<void> {
  const seccionBruta = String(pedido.seccion ?? "");
  const ruta = String(pedido.ruta ?? "");
  const rutaPoster = pedido.rutaPoster ? String(pedido.rutaPoster) : null;

  // Las rutas vienen del navegador: sólo valen las que compone esta pantalla.
  if (
    !esSeccion(seccionBruta) ||
    !esRutaDeSeccion(ruta, seccionBruta) ||
    (rutaPoster !== null && !esRutaDeSeccion(rutaPoster, seccionBruta))
  ) {
    volver("error");
  }

  const servicio = clienteDeServicio();
  const subidas = [ruta, rutaPoster].filter((cual): cual is string => cual !== null);
  const objeto = await describirObjeto(ruta);
  const objetoPoster = rutaPoster ? await describirObjeto(rutaPoster) : null;

  /*
    LO QUE SE COMPRUEBA ES LO QUE LLEGÓ, con las mismas reglas que al
    preparar. Si algo no vale, lo subido se borra antes de volver: el bucket es
    público y no tiene por qué quedarse con lo que el panel ha rechazado.
  */
  let comprobado: Awaited<ReturnType<typeof validarSubida>>;
  try {
    if (!objeto || (rutaPoster !== null && !objetoPoster)) volver("subida-cortada");
    comprobado = await validarSubida({
      seccion: seccionBruta,
      alternativo: String(pedido.alternativo ?? ""),
      fichero: objeto,
      poster: objetoPoster,
    });
    // La extensión de la ruta tiene que ser la del tipo que llegó, y un póster
    // sólo acompaña a un vídeo.
    if (!ruta.endsWith(`.${comprobado.veredicto.extension}`)) volver("tipo-no-admitido");
    if (rutaPoster && !comprobado.veredictoPoster) volver("tipo-no-admitido");
  } catch (salida) {
    await servicio.storage.from(BUCKET_MEDIOS).remove(subidas);
    throw salida;
  }

  const { seccion, alternativo, veredicto, perfilId } = comprobado;
  let medida: { ancho: number; alto: number } | null = null;
  if (veredicto.tipo === "imagen") {
    const { data } = await servicio.storage.from(BUCKET_MEDIOS).download(ruta);
    medida = data ? medirImagen(new Uint8Array(await data.arrayBuffer())) : null;
  }

  try {
    const fila = await insertarFila({
      ruta,
      rutaPoster,
      alternativo,
      seccion,
      tipo: veredicto.tipo,
      medida,
      perfilId,
    });
    volver("subido", { medio: fila.id });
  } catch (salida) {
    // `volver` sale lanzando la redirección: sólo se limpia si no fue ésa.
    if (!esRedireccionA(salida, "subido")) {
      await servicio.storage.from(BUCKET_MEDIOS).remove(subidas);
    }
    throw salida;
  }
}

/** Si lo lanzado es la redirección de `volver` a ese estado. */
function esRedireccionA(salida: unknown, estado: EstadoMedios): boolean {
  const digest = (salida as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.includes(`estado=${estado}`);
}

/**
 * LA SUBIDA SE CORTÓ: se borra lo que llegase y se dice. Sólo se borra lo que
 * no tiene fila —una ruta que ya es de una foto no se toca, venga lo que venga
 * del navegador— y sólo rutas con la forma de las de esta pantalla.
 */
export async function descartarSubida(pedido: {
  seccion: string;
  rutas: unknown;
}): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const seccion = String(pedido.seccion ?? "");
  if (!esSeccion(seccion)) volver("subida-cortada");

  const rutas = (Array.isArray(pedido.rutas) ? pedido.rutas : [])
    .map(String)
    .filter((ruta) => esRutaDeSeccion(ruta, seccion))
    .slice(0, 2);

  if (acceso.rol !== "lector" && haySubidaDeMedios && rutas.length > 0) {
    const lista = rutas.join(",");
    const { data: conFila } = await (
      await cliente()
    )
      .from("medios")
      .select("ruta_almacenamiento, poster_ruta")
      .or(`ruta_almacenamiento.in.(${lista}),poster_ruta.in.(${lista})`);
    const ocupadas = new Set(
      (conFila ?? []).flatMap((fila) => [fila.ruta_almacenamiento, fila.poster_ruta]),
    );
    const sueltas = rutas.filter((ruta) => !ocupadas.has(ruta));
    if (sueltas.length > 0) {
      await clienteDeServicio().storage.from(BUCKET_MEDIOS).remove(sueltas);
    }
  }

  volver("subida-cortada", { seccion });
}

/**
 * PUBLICAR O RETIRAR.
 *
 * Es lo único que decide si algo se ve en la web: `medios_publica_leer` deja a
 * `anon` ver sólo lo publicado. Retirar NO borra — se vuelve a borrador, y el
 * fichero sigue donde estaba.
 */
export async function alternarPublicado(datos: FormData): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const id = texto(datos, "medio_id");
  const publicar = texto(datos, "publicar") === "1";
  if (!id) volver("error");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("medios")
    .update({ publicado: publicar })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  // Cero filas y sin error: o RLS ha dicho que no, o la foto ya no está. El
  // rol desempata. Ver la cabecera del fichero.
  if (error) volver(motivo(error), { medio: id });
  if (!data) volver((await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "no-existe");

  volver(publicar ? "publicado" : "despublicado", { medio: id });
}

/**
 * MOVER UNO DE SITIO.
 *
 * Va por `reordenar_medio()` y no por dos `update`, porque la unicidad
 * `(seccion, orden)` es diferida: las dos escrituras tienen que caer en el
 * MISMO commit y desde aquí no hay forma de pedir una transacción. La función
 * es `security invoker`, así que quien decide sigue siendo RLS.
 */
export async function moverMedio(datos: FormData): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const id = texto(datos, "medio_id");
  if (!id) volver("error");

  const supabase = await cliente();
  const { error } = await supabase.rpc("reordenar_medio", {
    p_medio_id: id,
    p_hacia_arriba: texto(datos, "hacia") === "arriba",
  });

  if (error) volver(motivo(error), { medio: id });
  volver("movido", { medio: id });
}

/**
 * BORRAR DE VERDAD: la fila Y el objeto.
 *
 * EL ORDEN ES EL CONTRARIO AL DE SUBIR, y por el mismo razonamiento. Primero la
 * fila —con la sesión, o sea con RLS decidiendo—: si esa persona no puede
 * borrar, no se ha tocado ningún fichero. Y sólo después el objeto.
 *
 * Si el borrado del objeto falla, la fila ya no está y en la web no se ve nada;
 * queda un fichero huérfano ocupando espacio, que es el peor caso aceptable.
 * Borrar el objeto primero podría dejar lo contrario: una fila publicada
 * apuntando a un hueco, o sea una imagen rota delante de los invitados.
 */
export async function borrarMedio(datos: FormData): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const id = texto(datos, "medio_id");
  if (!id) volver("error");

  /*
    SE CONFIRMA, porque no tiene vuelta atrás: se van la fila y el fichero, y
    si era la foto de portada, la portada se queda sin foto. El formulario de
    confirmar es el único que manda este campo.
  */
  if (texto(datos, "confirmado") !== "si") volver("confirmar-borrado", { medio: id });

  /*
    SIN LA CLAVE DE SERVICIO NO SE BORRA. Se podría quitar la fila, pero el
    fichero se quedaría en el bucket público, accesible por su URL para quien
    la tenga —justo lo que borrar viene a evitar—, y la pantalla felicitaba con
    «Borrado, también el fichero».
  */
  if (!haySubidaDeMedios) volver("sin-configurar", { medio: id });

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("medios")
    .delete()
    .eq("id", id)
    .select("ruta_almacenamiento, poster_ruta, seccion")
    .maybeSingle();

  if (error) volver(motivo(error), { medio: id });
  if (!data) volver((await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "no-existe");

  const rutas = [data.ruta_almacenamiento, data.poster_ruta].filter((ruta): ruta is string =>
    Boolean(ruta),
  );
  const { error: fallo } = await clienteDeServicio().storage.from(BUCKET_MEDIOS).remove(rutas);

  // La ficha ya no existe: se vuelve a su sección. Y si el fichero se quedó,
  // se dice, en vez de dar por borrado algo que sigue en internet.
  const seccion = esSeccion(String(data.seccion)) ? (data.seccion as Seccion) : undefined;
  if (fallo) {
    console.error("Fila borrada, fichero huérfano en Storage:", fallo);
    volver("borrado-sin-fichero", { seccion });
  }
  volver("borrado", { seccion });
}

/**
 * CORREGIR EL TEXTO ALTERNATIVO.
 *
 * Se puede editar y no sólo escribir al subir porque es lo que más se escribe
 * mal con prisa —«foto1»— y es exactamente lo que oye quien no ve la imagen.
 * El trigger `validar_texto_alternativo_medio` lo vuelve a exigir en la base.
 */
export async function guardarAlternativo(datos: FormData): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const id = texto(datos, "medio_id");
  const alternativo = texto(datos, "texto_alternativo");
  if (!id) volver("error");
  if (
    alternativo.length < 3 ||
    alternativo.length > LARGOS_DE_CAMPO["medios.texto_alternativo"]
  ) {
    volver("sin-alternativo", { medio: id });
  }

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("medios")
    .update({ texto_alternativo: { es: alternativo } })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) volver(motivo(error), { medio: id });
  if (!data) volver((await ceroFilasEsFaltaDePermiso()) ? "sin-permiso" : "no-existe");

  volver("alternativo-guardado", { medio: id });
}
