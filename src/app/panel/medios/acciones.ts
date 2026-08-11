"use server";

import { redirect } from "next/navigation";

import { BUCKET_MEDIOS, RUTA_ACCESO, RUTA_MEDIOS } from "@/config/constants";
import { SECCIONES, type Seccion } from "@/config/secciones";
import { medirImagen } from "@/lib/dimensiones";
import { admitirFichero, componerRuta, identificadorDeRuta } from "@/lib/medios";
import { accesoActual } from "@/lib/sesion";
import { clienteDeServicio, haySubidaDeMedios } from "@/lib/supabase/servicio";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { ESTADOS_DE_ERROR, type EstadoMedios } from "./estado";

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
 */
function volver(estado: EstadoMedios): never {
  if (ESTADOS_DE_ERROR.includes(estado)) {
    console.warn(`Subida de medio rechazada: ${estado}`);
  }
  redirect(`${RUTA_MEDIOS}?estado=${estado}`);
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
  console.error("Fallo al escribir en medios:", error);
  return "error";
}

/**
 * SUBIR UN MEDIO.
 *
 * Todo lo que se puede saber sin tocar la red se comprueba antes de tocarla: el
 * tipo, el peso, el texto alternativo y —si es vídeo— el póster. Quien sube una
 * foto de veinte megas desde el móvil se entera con el fichero ya en el
 * servidor, sí, pero sin haber pagado además la subida al bucket.
 */
export async function subirMedio(datos: FormData): Promise<void> {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);
  if (acceso.rol === "lector") volver("sin-permiso");

  if (!haySubidaDeMedios) volver("sin-configurar");

  const seccionBruta = texto(datos, "seccion");
  if (!esSeccion(seccionBruta)) volver("error");
  const seccion: Seccion = seccionBruta;

  const alternativo = texto(datos, "texto_alternativo");
  if (alternativo.length < 3 || alternativo.length > 300) volver("sin-alternativo");

  const original = fichero(datos, "fichero");
  if (!original) volver("sin-fichero");

  const veredicto = admitirFichero(original);
  if (!veredicto.admitido) {
    volver(veredicto.motivo === "tipo" ? "tipo-no-admitido" : "demasiado-grande");
  }

  /*
    UN VÍDEO SIN PÓSTER NO ENTRA, y no es una manía: el póster es lo que se ve
    mientras carga, lo que se ve si el navegador se niega a reproducirlo y —lo
    que de verdad importa— lo que ve quien ha pedido no ver movimiento. La base
    lo exige con `medios_poster_solo_de_video`; aquí se comprueba antes para
    poder decirlo con palabras en vez de con un error de restricción.
  */
  const poster = fichero(datos, "poster");
  if (veredicto.tipo === "video" && !poster) volver("sin-poster");

  let veredictoPoster: ReturnType<typeof admitirFichero> | null = null;
  if (veredicto.tipo === "video" && poster) {
    veredictoPoster = admitirFichero(poster);
    if (!veredictoPoster.admitido) {
      volver(veredictoPoster.motivo === "tipo" ? "tipo-no-admitido" : "demasiado-grande");
    }
    // Un vídeo de póster no es un póster: lo que hace falta es un fotograma.
    if (veredictoPoster.tipo !== "imagen") volver("tipo-no-admitido");
  }

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

  const ruta = componerRuta(seccion, veredicto.extension, identificadorDeRuta(Math.random()));
  const rutaPoster =
    veredictoPoster?.admitido === true
      ? componerRuta(seccion, veredictoPoster.extension, identificadorDeRuta(Math.random()))
      : null;

  // 1. LA FILA PRIMERO. Aquí es donde RLS dice si esta persona puede o no.
  const supabase = await cliente();
  const { data: fila, error } = await supabase
    .from("medios")
    .insert({
      ruta_almacenamiento: ruta,
      poster_ruta: rutaPoster,
      texto_alternativo: { es: alternativo },
      seccion,
      tipo: veredicto.tipo,
      ancho: medida?.ancho ?? null,
      alto: medida?.alto ?? null,
      publicado: false,
      // `perfiles.id`, NO el de Auth: es a `perfiles` a quien apunta
      // `medios_subido_por_fk`. Ver el comentario de `Acceso` en `sesion.ts`.
      subido_por: acceso.perfilId,
    })
    .select("id")
    .maybeSingle();

  if (error || !fila) volver(motivo(error));

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
    await supabase.from("medios").delete().eq("id", fila.id);
    if (falloPoster) {
      await servicio.storage.from(BUCKET_MEDIOS).remove([ruta]);
    }
    volver("error");
  }

  volver("subido");
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

  // Cero filas y sin error: RLS ha dicho que no. Ver la cabecera del fichero.
  if (error || !data) volver(error ? motivo(error) : "sin-permiso");

  volver(publicar ? "publicado" : "despublicado");
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

  if (error) volver(motivo(error));
  volver("movido");
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

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("medios")
    .delete()
    .eq("id", id)
    .select("ruta_almacenamiento, poster_ruta")
    .maybeSingle();

  if (error || !data) volver(error ? motivo(error) : "sin-permiso");

  if (haySubidaDeMedios) {
    const rutas = [data.ruta_almacenamiento, data.poster_ruta].filter((ruta): ruta is string =>
      Boolean(ruta),
    );
    const { error: fallo } = await clienteDeServicio()
      .storage.from(BUCKET_MEDIOS)
      .remove(rutas);

    // Se registra pero no se convierte en error de pantalla: la fila ya no
    // está, así que para quien mira la web el borrado ha ocurrido entero.
    if (fallo) console.error("Fila borrada, fichero huérfano en Storage:", fallo);
  }

  volver("borrado");
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
  if (alternativo.length < 3 || alternativo.length > 300) volver("sin-alternativo");

  const supabase = await cliente();
  const { data, error } = await supabase
    .from("medios")
    .update({ texto_alternativo: { es: alternativo } })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !data) volver(error ? motivo(error) : "sin-permiso");

  volver("alternativo-guardado");
}
