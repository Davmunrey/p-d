import Image from "next/image";
import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2, Titulo3 } from "@/components/ui/tipografia";
import {
  BUCKET_MEDIOS,
  PESO_MAXIMO_IMAGEN_MB,
  PESO_MAXIMO_VIDEO_MB,
  RUTA_ACCESO,
  TIPOS_MEDIO_ADMITIDOS,
} from "@/config/constants";
import { type Seccion } from "@/config/secciones";
import { obtenerMediosDelPanel, type MedioDelPanel } from "@/lib/bbdd/medios";
import { t } from "@/lib/copy";
import { accesoActual } from "@/lib/sesion";
import { haySubidaDeMedios } from "@/lib/supabase/servicio";

import {
  alternarPublicado,
  borrarMedio,
  guardarAlternativo,
  moverMedio,
  subirMedio,
} from "./acciones";
import { ESTADOS_DE_ERROR, esEstadoMedios, type EstadoMedios } from "./estado";

/**
 * BODA-29 · EL GESTOR DE FOTOS Y VÍDEOS
 *
 * La regla 1 dice que ninguna imagen de la landing vive en `/public`: salen de
 * Storage y de la tabla `medios`. Hasta ahora eso era verdad a medias — la
 * landing YA leía de `medios`, pero no había ninguna forma de meter una fila
 * salvo el editor SQL de Supabase. La portada llevaba semanas sin foto por eso.
 *
 * SE AGRUPA POR SECCIÓN, Y CADA SECCIÓN LLEVA SU FORMULARIO. La pregunta que se
 * hace delante de esta pantalla nunca es «¿qué fotos hay?», es «¿qué se ve en
 * la portada?». Un formulario único arriba con un desplegable de sección
 * obligaría a elegirla dos veces —una para mirar y otra para subir— y a que la
 * elección de un desplegable contradijera lo que se está mirando.
 *
 * SIN UNA LÍNEA DE JAVASCRIPT DE CLIENTE. Son `<form>` con Server Actions:
 * subir, publicar, mover y borrar funcionan con el bundle a medio cargar, que
 * es como se abre esto desde el móvil con mala cobertura.
 *
 * UN LECTOR VE PERO NO TOCA. No es la protección —esa es RLS, y cada acción
 * comprueba el recuento de filas por si alguien manda el formulario a mano—
 * sino no ofrecer lo que va a fallar.
 */
export const dynamic = "force-dynamic";

const AVISOS: Record<EstadoMedios, string> = {
  subido: t("panel.medios.avisoSubido"),
  publicado: t("panel.medios.avisoPublicado"),
  despublicado: t("panel.medios.avisoDespublicado"),
  borrado: t("panel.medios.avisoBorrado"),
  movido: t("panel.medios.avisoMovido"),
  "alternativo-guardado": t("panel.medios.avisoAlternativo"),
  "sin-fichero": t("panel.medios.errorSinFichero"),
  "sin-alternativo": t("panel.medios.errorSinAlternativo"),
  "tipo-no-admitido": t("panel.medios.errorTipo"),
  "demasiado-grande": t("panel.medios.errorPeso"),
  "sin-poster": t("panel.medios.errorSinPoster"),
  "sin-configurar": t("panel.medios.errorSinConfigurar"),
  "sin-permiso": t("panel.medios.errorSinPermiso"),
  error: t("panel.medios.errorGuardar"),
};

/** Lo que acepta el `<input type="file">`, del mismo sitio que el bucket. */
const TIPOS_ACEPTADOS = TIPOS_MEDIO_ADMITIDOS.join(",");

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaginaMedios({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const bruto = typeof consulta.estado === "string" ? consulta.estado : "";
  const estado = esEstadoMedios(bruto) ? bruto : null;

  const secciones = await obtenerMediosDelPanel();
  const puedeEditar = acceso.rol !== "lector";
  const urlBase = process.env.NEXT_PUBLIC_SUPABASE_URL;

  return (
    <div className="grid gap-bloque">
      <header className="max-w-texto">
        <Titulo2 como="h1">{t("panel.medios.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.medios.descripcion")}</Cuerpo>
      </header>

      {estado ? (
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
        Se dice ARRIBA y una sola vez, no dentro de cada formulario: sin la
        clave no funciona ninguno, y repetirlo dieciséis veces convertiría un
        aviso en ruido.
      */}
      {puedeEditar && !haySubidaDeMedios ? (
        <p
          role="alert"
          className="rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
        >
          {t("panel.medios.errorSinConfigurar")}
        </p>
      ) : null}

      {!puedeEditar ? (
        <Etiqueta className="block">{t("panel.medios.errorSinPermiso")}</Etiqueta>
      ) : null}

      {secciones.map(({ seccion, medios }) => (
        <BloqueSeccion
          key={seccion}
          seccion={seccion}
          medios={medios}
          puedeEditar={puedeEditar}
          urlBase={urlBase}
        />
      ))}
    </div>
  );
}

function BloqueSeccion({
  seccion,
  medios,
  puedeEditar,
  urlBase,
}: {
  seccion: Seccion;
  medios: MedioDelPanel[];
  puedeEditar: boolean;
  urlBase: string | undefined;
}) {
  const publicados = medios.filter((medio) => medio.publicado).length;

  return (
    <section className="border-t border-borde pt-bloque">
      <div className="flex flex-wrap items-baseline justify-between gap-interno">
        <Titulo3 como="h2">{t(`navegacion.secciones.${seccion}`)}</Titulo3>
        {medios.length > 0 ? (
          <Etiqueta>
            {t("panel.medios.cuantos", { cuantos: publicados, total: medios.length })}
          </Etiqueta>
        ) : null}
      </div>

      {medios.length === 0 ? (
        <Cuerpo className="mt-pila text-pequeno text-tinta-tenue">
          {t("panel.medios.seccionVacia")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-interno">
          {medios.map((medio, indice) => (
            <Ficha
              key={medio.id}
              medio={medio}
              puedeEditar={puedeEditar}
              urlBase={urlBase}
              esElPrimero={indice === 0}
              esElUltimo={indice === medios.length - 1}
            />
          ))}
        </ul>
      )}

      {puedeEditar ? <FormularioSubida seccion={seccion} /> : null}
    </section>
  );
}

function Ficha({
  medio,
  puedeEditar,
  urlBase,
  esElPrimero,
  esElUltimo,
}: {
  medio: MedioDelPanel;
  puedeEditar: boolean;
  urlBase: string | undefined;
  esElPrimero: boolean;
  esElUltimo: boolean;
}) {
  /*
    LA MINIATURA ES SIEMPRE UNA IMAGEN, también la de un vídeo: para eso está el
    póster. Reproducir dieciséis vídeos a la vez en una pantalla de gestión
    sería descargar cientos de megas para decidir cuál se publica.
  */
  const rutaVisible = medio.tipo === "video" ? medio.posterRuta : medio.ruta;
  const fuente =
    urlBase && rutaVisible
      ? `${urlBase}/storage/v1/object/public/${BUCKET_MEDIOS}/${rutaVisible}`
      : null;

  return (
    <li
      className={`grid gap-interno rounded-tarjeta border p-interno sm:grid-cols-[auto_1fr] ${
        medio.publicado ? "border-borde" : "border-borde-fuerte bg-superficie-tenue"
      }`}
    >
      <div className="relative size-miniatura shrink-0 overflow-hidden rounded-campo bg-superficie-hundida">
        {fuente ? (
          <Image
            src={fuente}
            alt={medio.textoAlternativo}
            fill
            sizes="120px"
            className="object-cover"
            // Sin optimizar: son miniaturas de gestión, no páginas públicas, y
            // pasarlas por el optimizador cuesta una invocación por foto.
            unoptimized
          />
        ) : null}
      </div>

      <div className="grid gap-pila">
        <div className="flex flex-wrap items-center gap-interno-compacto">
          <span
            className={`rounded-etiqueta px-interno py-linea text-diminuto uppercase tracking-etiqueta ${
              medio.publicado
                ? "bg-marca text-tinta-sobre-marca"
                : "border border-borde-fuerte text-tinta-suave"
            }`}
          >
            {medio.publicado ? t("panel.medios.enLaWeb") : t("panel.medios.borrador")}
          </span>

          {medio.tipo === "video" ? <Etiqueta>{t("panel.medios.esVideo")}</Etiqueta> : null}

          <Etiqueta>
            {medio.ancho && medio.alto
              ? t("panel.medios.medida", { ancho: medio.ancho, alto: medio.alto })
              : t("panel.medios.sinMedida")}
          </Etiqueta>
        </div>

        {puedeEditar ? (
          <>
            {/*
              EL TEXTO ALTERNATIVO SE EDITA AQUÍ MISMO y no tras un botón de
              «editar»: es lo que más se escribe mal con prisa y lo único de esta
              ficha que se corrige de verdad. Esconderlo garantiza que nadie lo
              arregle.
            */}
            <form
              action={guardarAlternativo}
              className="grid items-end gap-interno-compacto sm:grid-cols-[1fr_auto]"
            >
              <input type="hidden" name="medio_id" value={medio.id} />
              <CampoTexto
                etiqueta={t("panel.medios.alternativo")}
                name="texto_alternativo"
                defaultValue={medio.textoAlternativo}
                minLength={3}
                maxLength={300}
                required
              />
              <Boton type="submit" jerarquia="secundario">
                {t("panel.medios.guardarAlternativo")}
              </Boton>
            </form>

            <div className="flex flex-wrap items-center gap-interno-compacto">
              <form action={alternarPublicado}>
                <input type="hidden" name="medio_id" value={medio.id} />
                <input type="hidden" name="publicar" value={medio.publicado ? "0" : "1"} />
                <Boton type="submit" jerarquia={medio.publicado ? "terciario" : "primario"}>
                  {medio.publicado ? t("panel.medios.despublicar") : t("panel.medios.publicar")}
                </Boton>
              </form>

              {/*
                El botón de mover no se pinta cuando no hay a dónde. Un botón
                que existe y no hace nada es peor que uno que falta: se pulsa
                tres veces antes de concluir que la aplicación está rota.
              */}
              {!esElPrimero ? (
                <form action={moverMedio}>
                  <input type="hidden" name="medio_id" value={medio.id} />
                  <input type="hidden" name="hacia" value="arriba" />
                  <Boton type="submit" jerarquia="terciario">
                    {t("panel.medios.subirOrden")}
                  </Boton>
                </form>
              ) : null}

              {!esElUltimo ? (
                <form action={moverMedio}>
                  <input type="hidden" name="medio_id" value={medio.id} />
                  <input type="hidden" name="hacia" value="abajo" />
                  <Boton type="submit" jerarquia="terciario">
                    {t("panel.medios.bajarOrden")}
                  </Boton>
                </form>
              ) : null}

              <form action={borrarMedio}>
                <input type="hidden" name="medio_id" value={medio.id} />
                <Boton type="submit" jerarquia="terciario">
                  {t("panel.medios.borrar")}
                </Boton>
              </form>
            </div>
          </>
        ) : (
          <Cuerpo className="max-w-texto text-pequeno">{medio.textoAlternativo}</Cuerpo>
        )}
      </div>
    </li>
  );
}

function FormularioSubida({ seccion }: { seccion: Seccion }) {
  return (
    <details className="mt-elemento">
      <summary className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca">
        {t("panel.medios.subirTitulo")}
      </summary>

      {/*
        SIN `encType`. Lo pone React por su cuenta —un `<form action={fn}>` es
        una acción de servidor y React elige la codificación—, y declararlo a
        mano es meterse en medio de algo que ya está resuelto.
      */}
      <form action={subirMedio} className="mt-elemento grid max-w-texto gap-interno">
        <input type="hidden" name="seccion" value={seccion} />

        <Cuerpo className="text-pequeno text-tinta-tenue">
          {t("panel.medios.subirAyuda")}
        </Cuerpo>

        <CampoFichero
          etiqueta={t("panel.medios.fichero")}
          ayuda={t("panel.medios.ficheroAyuda", {
            imagenMb: PESO_MAXIMO_IMAGEN_MB,
            videoMb: PESO_MAXIMO_VIDEO_MB,
          })}
          name="fichero"
          seccion={seccion}
          accept={TIPOS_ACEPTADOS}
          required
        />

        {/*
          EL PÓSTER NO ES OPCIONAL PARA UN VÍDEO, pero sí para una foto — y como
          esto es un formulario sin JavaScript, no se puede exigir según lo que
          se elija arriba. Se pide siempre como opcional y lo comprueba la
          acción, que es donde de todas formas tenía que comprobarse.
        */}
        <CampoFichero
          etiqueta={t("panel.medios.poster")}
          ayuda={t("panel.medios.posterAyuda")}
          name="poster"
          seccion={seccion}
          accept="image/jpeg,image/png,image/webp,image/avif"
        />

        <CampoTexto
          etiqueta={t("panel.medios.alternativo")}
          ayuda={t("panel.medios.alternativoAyuda")}
          name="texto_alternativo"
          minLength={3}
          maxLength={300}
          required
        />

        <div>
          <Boton type="submit">{t("panel.medios.subir")}</Boton>
        </div>
      </form>
    </details>
  );
}

/**
 * Un campo de fichero con la misma etiqueta y ayuda que los demás.
 *
 * NO SE REUTILIZA `CampoTexto` con `type="file"`: un selector de ficheros no
 * lleva borde ni relleno de campo de texto —el navegador pinta su propio botón
 * dentro—, y forzarle las clases de un `input` de texto deja un rectángulo
 * vacío con un botón descolocado en una esquina.
 */
function CampoFichero({
  etiqueta,
  ayuda,
  name,
  seccion,
  accept,
  required = false,
}: {
  etiqueta: string;
  ayuda: string;
  name: string;
  /**
   * EL IDENTIFICADOR LLEVA LA SECCIÓN, y no es decorativo: esta pantalla pinta
   * DIECISÉIS formularios de subida, uno por sección. Con `id="campo-fichero"`
   * a secas había dieciséis elementos con el mismo identificador, así que
   * quince de las dieciséis etiquetas apuntaban al campo de la portada:
   * pulsar «Foto o vídeo» en la galería abría el selector de otra sección.
   */
  seccion: Seccion;
  accept: string;
  required?: boolean;
}) {
  const id = `campo-${name}-${seccion}`;
  const idAyuda = `${id}-ayuda`;

  return (
    <div className="grid gap-interno-compacto">
      <label
        htmlFor={id}
        className="text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
      >
        {etiqueta}
      </label>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-describedby={idAyuda}
        className="min-h-control w-full rounded-campo border border-borde bg-superficie px-interno py-interno-compacto text-pequeno text-tinta file:mr-interno file:min-h-control-compacto file:rounded-boton file:border file:border-borde-fuerte file:bg-superficie file:px-interno file:text-etiqueta file:uppercase file:tracking-boton file:text-tinta-marca"
      />
      <span id={idAyuda} className="text-pequeno text-tinta-tenue">
        {ayuda}
      </span>
    </div>
  );
}
