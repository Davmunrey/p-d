"use client";

import { useState, type FormEvent } from "react";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo } from "@/components/ui/tipografia";
import {
  CACHE_MEDIOS_SEGUNDOS,
  IDIOMA,
  LARGOS_DE_CAMPO,
  PLAZO_SUBIDA_NAVEGADOR_MS,
} from "@/config/constants";
import { type Seccion } from "@/config/secciones";
import { t } from "@/lib/copy";

import { confirmarSubida, descartarSubida, prepararSubida, subirMedio } from "./acciones";
import { DeQue } from "./de-que";
import type { FicheroASubir, SubidaPreparada } from "./estado";

/**
 * SUBIR A UNA SECCIÓN, SIN QUE EL FICHERO PASE POR EL SERVIDOR
 *
 * Sin JavaScript es el formulario de siempre: el fichero viaja dentro y lo
 * sube `subirMedio`. Pero en Vercel una petición de más de 4,5 MB no llega a
 * ejecutarse, y una foto de móvil pesa más; así que con JavaScript el envío se
 * intercepta y el fichero va del navegador a Storage directamente, con una URL
 * firmada que da el servidor después de comprobarlo todo (ver
 * `prepararSubida` y `confirmarSubida`). Mientras sube, se dice cuánto lleva:
 * cincuenta megas por datos móviles son minutos, y sin eso parecía colgado.
 */

type Fase =
  | { tipo: "quieta" }
  | { tipo: "preparando" }
  | { tipo: "subiendo"; proporcion: number }
  | { tipo: "guardando" }
  | { tipo: "fallo" };

/** La clave pública del proyecto: Storage la pide también para subir con URL firmada. */
const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const porcentaje = new Intl.NumberFormat(IDIOMA, { style: "percent" });

/** Si lo lanzado es una redirección de una acción: la pantalla ya se está yendo. */
function esRedireccion(error: unknown, estado?: string): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    digest.startsWith("NEXT_REDIRECT") &&
    (estado === undefined || digest.includes(`estado=${estado}`))
  );
}

function ficheroDe(datos: FormData, campo: string): File | null {
  const valor = datos.get(campo);
  return valor instanceof File && valor.size > 0 ? valor : null;
}

/**
 * Sube UN fichero a su URL firmada, contando lo que lleva. Con
 * `XMLHttpRequest` y no con `fetch` porque `fetch` no informa del avance de
 * una subida, y es lo único que distingue «va lento» de «se ha colgado».
 */
function subirA(
  destino: FicheroASubir,
  fichero: File,
  alAvanzar: (cargados: number) => void,
): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const peticion = new XMLHttpRequest();
    peticion.open("PUT", destino.url);
    peticion.timeout = PLAZO_SUBIDA_NAVEGADOR_MS;
    peticion.setRequestHeader("apikey", CLAVE_PUBLICA ?? "");
    peticion.setRequestHeader("authorization", `Bearer ${CLAVE_PUBLICA ?? ""}`);
    peticion.setRequestHeader("x-upsert", "false");
    peticion.upload.addEventListener("progress", (evento) => alAvanzar(evento.loaded));
    peticion.addEventListener("load", () =>
      peticion.status >= 200 && peticion.status < 300
        ? resolver()
        : rechazar(new Error(`Storage respondió ${peticion.status}`)),
    );
    for (const fallo of ["error", "abort", "timeout"] as const) {
      peticion.addEventListener(fallo, () => rechazar(new Error(`Subida: ${fallo}`)));
    }

    // El mismo cuerpo que manda `uploadToSignedUrl` de storage-js.
    const cuerpo = new FormData();
    cuerpo.append("cacheControl", String(CACHE_MEDIOS_SEGUNDOS));
    cuerpo.append("", fichero);
    peticion.send(cuerpo);
  });
}

export function FormularioSubida({
  seccion,
  nombre,
  abierto,
  accept,
  acceptPoster,
  etiquetaFichero,
  ayudaFichero,
}: {
  seccion: Seccion;
  /** El nombre de la sección, para decir a cuál se sube sin tener que verlo. */
  nombre: string;
  abierto: boolean;
  /** Lo que esa parte de la web pinta: lo único que se ofrece subir. */
  accept: string;
  /** Lo que vale de fotograma, o `null` donde no se admite vídeo. */
  acceptPoster: string | null;
  etiquetaFichero: string;
  ayudaFichero: string;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "quieta" });
  const enMarcha =
    fase.tipo === "preparando" || fase.tipo === "subiendo" || fase.tipo === "guardando";

  async function alEnviar(evento: FormEvent<HTMLFormElement>) {
    // Sin la clave pública no se puede subir desde aquí: sigue el camino del
    // servidor, que es el de sin JavaScript.
    if (!CLAVE_PUBLICA) return;
    evento.preventDefault();
    if (enMarcha) return;

    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    const fichero = ficheroDe(datos, "fichero");
    const poster = ficheroDe(datos, "poster");
    const alternativo = String(datos.get("texto_alternativo") ?? "");
    const describir = (cual: File | null) =>
      cual ? { type: cual.type, size: cual.size } : null;

    // 1. Que el servidor lo compruebe todo y firme las subidas. Si algo no
    //    vale, la acción vuelve con su aviso y la pantalla ya se está yendo.
    setFase({ tipo: "preparando" });
    let preparada: SubidaPreparada;
    try {
      preparada = await prepararSubida({
        seccion,
        alternativo,
        fichero: describir(fichero),
        poster: describir(poster),
      });
    } catch (error) {
      setFase(esRedireccion(error) ? { tipo: "quieta" } : { tipo: "fallo" });
      return;
    }

    // 2. Los ficheros, del navegador a Storage.
    const rutas = [preparada.fichero.ruta, preparada.poster?.ruta].filter(
      (ruta): ruta is string => Boolean(ruta),
    );
    try {
      if (!fichero) throw new Error("Sin fichero");
      const conPoster = preparada.poster && poster ? poster : null;
      const total = fichero.size + (conPoster?.size ?? 0);
      let hechos = 0;
      const avanzar = (cargados: number) =>
        setFase({ tipo: "subiendo", proporcion: Math.min(1, (hechos + cargados) / total) });

      avanzar(0);
      await subirA(preparada.fichero, fichero, avanzar);
      hechos = fichero.size;
      if (preparada.poster && conPoster) await subirA(preparada.poster, conPoster, avanzar);
    } catch {
      // Se cortó: se borra lo que llegase, y la acción vuelve diciéndolo.
      try {
        await descartarSubida({ seccion, rutas });
      } catch (error) {
        setFase(esRedireccion(error) ? { tipo: "quieta" } : { tipo: "fallo" });
      }
      return;
    }

    // 3. Que el servidor mire lo que llegó y lo dé de alta.
    setFase({ tipo: "guardando" });
    try {
      await confirmarSubida({
        seccion,
        alternativo,
        ruta: preparada.fichero.ruta,
        rutaPoster: preparada.poster?.ruta ?? null,
      });
    } catch (error) {
      // Subida: el formulario se vacía, para no volver a mandar lo mismo.
      if (esRedireccion(error, "subido")) formulario.reset();
      setFase(esRedireccion(error) ? { tipo: "quieta" } : { tipo: "fallo" });
    }
  }

  const progreso =
    fase.tipo === "preparando"
      ? t("panel.medios.subidaPreparando")
      : fase.tipo === "subiendo"
        ? t("panel.medios.subidaSubiendo", { porcentaje: porcentaje.format(fase.proporcion) })
        : fase.tipo === "guardando"
          ? t("panel.medios.subidaGuardando")
          : "";

  return (
    <details className="mt-elemento" open={abierto}>
      <summary className="inline-flex min-h-control-compacto cursor-pointer items-center text-pequeno text-tinta-marca underline decoration-borde-fuerte underline-offset-4 transicion-color hover:decoration-borde-marca">
        {t("panel.medios.subirTitulo")}
        <DeQue nombre={nombre} />
      </summary>

      {/*
        SIN `encType`. Lo pone React por su cuenta —un `<form action={fn}>` es
        una acción de servidor y React elige la codificación—, y declararlo a
        mano es meterse en medio de algo que ya está resuelto.
      */}
      <form
        action={subirMedio}
        onSubmit={alEnviar}
        className="mt-elemento grid max-w-texto gap-interno"
      >
        <input type="hidden" name="seccion" value={seccion} />

        <Cuerpo className="text-pequeno text-tinta-suave">
          {t("panel.medios.subirAyuda")}
        </Cuerpo>

        <CampoFichero
          etiqueta={etiquetaFichero}
          ayuda={ayudaFichero}
          name="fichero"
          seccion={seccion}
          accept={accept}
          required
        />

        {/*
          EL PÓSTER NO ES OPCIONAL PARA UN VÍDEO, pero sí para una foto — y como
          sin JavaScript no se puede exigir según lo que se elija arriba, se
          pide siempre como opcional y lo comprueba la acción. Donde no se
          admite vídeo, no se pide.
        */}
        {acceptPoster ? (
          <CampoFichero
            etiqueta={t("panel.medios.poster")}
            ayuda={t("panel.medios.posterAyuda")}
            name="poster"
            seccion={seccion}
            accept={acceptPoster}
          />
        ) : null}

        <CampoTexto
          etiqueta={t("panel.medios.alternativo")}
          ayuda={t("panel.medios.alternativoAyuda")}
          name="texto_alternativo"
          minLength={3}
          maxLength={LARGOS_DE_CAMPO["medios.texto_alternativo"]}
          required
        />

        <div>
          <BotonEnvio disabled={enMarcha}>{t("panel.medios.subir")}</BotonEnvio>
        </div>

        <p role="status" className="text-pequeno text-tinta-suave tabular-nums">
          {progreso}
        </p>
        {fase.tipo === "fallo" ? (
          <p
            role="alert"
            className="rounded-campo bg-error-fondo p-interno text-pequeno text-error-tinta"
          >
            {t("panel.medios.errorSubidaCortada")}
          </p>
        ) : null}
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
   * un formulario de subida por sección. Con `id="campo-fichero"` a secas
   * había varios elementos con el mismo identificador, y pulsar «Foto o vídeo»
   * en la galería abría el selector de otra sección.
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
      <span id={idAyuda} className="text-pequeno text-tinta-suave">
        {ayuda}
      </span>
    </div>
  );
}
