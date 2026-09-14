import type { Metadata } from "next";

import { Aviso } from "@/components/ui/aviso";
import { Monograma } from "@/components/ui/monograma";
import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Tarjeta } from "@/components/ui/tarjeta";
import { Constelacion } from "@/components/ui/constelacion";
import { Cita, Cuerpo, Etiqueta } from "@/components/ui/tipografia";
import {
  ANIMACIONES,
  GRUPOS_COLOR,
  TOKENS_ESPACIADO,
  TOKENS_RADIO,
  TOKENS_SOMBRA,
  TOKENS_TIPOGRAFIA,
} from "@/config/tokens";
import { CONSTELACIONES, type Hemisferio } from "@/config/constelaciones";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import { t, type ClaveCopy } from "@/lib/copy";

/** Los dos grupos del catálogo, en el orden en que la entrega los presenta. */
const HEMISFERIOS: readonly {
  id: Hemisferio;
  claveTitulo: ClaveCopy;
  claveNota: ClaveCopy;
}[] = [
  {
    id: "norte",
    claveTitulo: "cocina.hemisferioNorte",
    claveNota: "cocina.hemisferioNorteNota",
  },
  { id: "sur", claveTitulo: "cocina.hemisferioSur", claveNota: "cocina.hemisferioSurNota" },
];

/**
 * SE PINTA EN CADA PETICIÓN, NO AL CONSTRUIR.
 *
 * Esta página lee la configuración para enseñar el monograma de verdad, y eso
 * la ataba al momento de la construcción: si la base no contestaba —o iba por
 * detrás del código, que es lo que pasó— Next fallaba al prerenderizar
 * `/cocina` y se llevaba por delante el DESPLIEGUE ENTERO. Un catálogo interno
 * no puede tener ese poder. Es la misma decisión que ya tenía la portada.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: t("cocina.titulo"),
  robots: { index: false, follow: false },
};

/**
 * SISTEMA DE DISEÑO
 *
 * Muestra todos los tokens semánticos resolviendo `var(--nombre)` en vivo.
 * No duplica ni un solo valor: si un swatch se ve mal, el token está mal.
 *
 * Sirve de verificación visual de que la capa semántica se sostiene sola: los
 * bloques inversos reasignan estos mismos tokens y ningún componente cambia
 * ni una clase. No hay selector de tema porque no hay más tema que éste.
 */
export default async function PaginaCocina() {
  /*
    LOS NOMBRES SALEN DE LA BASE, como en cualquier otra pantalla. Un catálogo
    de marca que enseña un monograma inventado enseña una marca que no existe, y
    la regla 3 del proyecto no hace excepción con las páginas internas. Sin
    configuración todavía —o si la base no contesta— la sección de identidad no
    se pinta y el resto del catálogo sigue sirviendo: los tokens, los
    componentes y las reglas no dependen de la base para nada. Antes media
    página que ninguna.
  */
  const configuracion = await obtenerConfiguracion().catch(() => null);

  return (
    <main className="mx-auto max-w-contenido px-interno py-seccion-compacta">
      <header className="mb-bloque flex flex-wrap items-end justify-between gap-elemento">
        <div className="max-w-texto">
          <h1 className="text-titulo-1 font-light">{t("cocina.titulo")}</h1>
          <p className="mt-pila text-cuerpo-grande text-tinta-suave">
            {t("cocina.descripcion")}
          </p>
        </div>
      </header>

      <Seccion titulo={t("cocina.seccionColor")}>
        <div className="grid gap-elemento">
          {GRUPOS_COLOR.map((grupo) => (
            <div key={grupo.id}>
              <h3 className="mb-pila text-pequeno uppercase tracking-etiqueta text-tinta-tenue">
                {t(`cocina.${grupo.claveCopy}`)}
              </h3>
              <ul className="grid grid-cols-2 gap-pila sm:grid-cols-3 lg:grid-cols-6">
                {grupo.tokens.map((token) => (
                  <li key={token}>
                    <div
                      className="h-control-compacto w-full rounded-imagen border border-borde"
                      style={{ backgroundColor: `var(--${token})` }}
                    />
                    <code className="mt-linea block text-diminuto text-tinta-tenue">
                      --{token}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo={t("cocina.seccionTipografia")}>
        <ul className="grid gap-elemento">
          {TOKENS_TIPOGRAFIA.map((token) => (
            <li key={token} className="border-b border-borde-tenue pb-elemento">
              <code className="block text-diminuto text-tinta-tenue">--{token}</code>
              <p
                className="mt-linea font-titulo leading-titulo"
                style={{ fontSize: `var(--${token})` }}
              >
                {t("cocina.muestraTipografica")}
              </p>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo={t("cocina.seccionEspaciado")}>
        <ul className="grid gap-pila">
          {TOKENS_ESPACIADO.map((token) => (
            <li key={token} className="flex items-center gap-elemento">
              <code className="w-columna-token shrink-0 text-diminuto text-tinta-tenue">
                --{token}
              </code>
              <div
                className="h-barra-muestra rounded-etiqueta bg-marca"
                style={{ width: `var(--${token})` }}
              />
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo={t("cocina.seccionForma")}>
        <div className="grid gap-elemento sm:grid-cols-2">
          <ul className="grid grid-cols-3 gap-pila">
            {TOKENS_RADIO.map((token) => (
              <li key={token}>
                <div
                  className="aspect-square w-full border border-borde-fuerte bg-superficie-tenue"
                  style={{ borderRadius: `var(--${token})` }}
                />
                <code className="mt-linea block text-diminuto text-tinta-tenue">--{token}</code>
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-elemento">
            {TOKENS_SOMBRA.map((token) => (
              <li key={token}>
                <div
                  className="aspect-video w-full rounded-tarjeta bg-superficie"
                  style={{ boxShadow: `var(--${token})` }}
                />
                <code className="mt-linea block text-diminuto text-tinta-tenue">--{token}</code>
              </li>
            ))}
          </ul>
        </div>
      </Seccion>

      <Seccion titulo={t("cocina.seccionMovimiento")}>
        <p className="mb-elemento max-w-texto text-pequeno text-tinta-tenue">
          {t("cocina.avisoMovimiento")}
        </p>
        <ul className="grid gap-elemento sm:grid-cols-3">
          {ANIMACIONES.map((animacion) => (
            <li key={animacion}>
              <div
                className={`${animacion} grid aspect-video place-items-center rounded-tarjeta bg-superficie-tenue`}
              >
                <code className="text-diminuto text-tinta-tenue">.{animacion}</code>
              </div>
            </li>
          ))}
        </ul>
      </Seccion>

      {/*
        Las constelaciones son parte del sistema, no de una pantalla: aquí se
        ven las dieciséis a la vez, que es la única forma de comprobar que
        comparten trazo. Van `rotulada`: en esta página el dibujo ES la
        información, así que cada uno se anuncia con su nombre.
      */}
      <Seccion titulo={t("cocina.seccionConstelaciones")}>
        <p className="mb-elemento max-w-texto text-pequeno text-tinta-tenue">
          {t("cocina.constelacionesDescripcion")}
        </p>
        <div className="grid gap-bloque sm:grid-cols-2">
          {HEMISFERIOS.map((hemisferio) => (
            <div key={hemisferio.id}>
              <h3 className="text-pequeno uppercase tracking-etiqueta text-tinta-tenue">
                {t(hemisferio.claveTitulo)}
              </h3>
              <p className="mt-linea text-pequeno text-tinta-suave">
                {t(hemisferio.claveNota)}
              </p>
              <ul className="mt-pila grid grid-cols-2 gap-pila sm:grid-cols-4">
                {CONSTELACIONES.filter((c) => c.hemisferio === hemisferio.id).map(
                  (constelacion) => (
                    <li key={constelacion.clave}>
                      <div className="aspect-square rounded-imagen border border-borde bg-superficie p-interno">
                        <Constelacion clave={constelacion.clave} rotulada />
                      </div>
                      <span className="mt-linea block text-diminuto text-tinta-tenue">
                        {constelacion.nombre}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      </Seccion>

      {/*
        LOS CUATRO COMPONENTES DEL CATÁLOGO, con los rótulos de la entrega. Cada
        ficha lleva su `data-prueba` porque es el gancho por el que los tests
        entran a leer los valores computados: buscar «el primer botón de la
        página» ata el test a un orden que cambia en cuanto se añade una ficha.
      */}
      <Seccion titulo={t("cocina.seccionComponentes")}>
        <div className="grid gap-elemento sm:grid-cols-2">
          <Ficha titulo={t("cocina.grupoBotones")} prueba="botones">
            <div className="flex flex-wrap items-center gap-interno">
              <Boton>{t("cocina.botonPrimario")}</Boton>
              <Boton jerarquia="secundario">{t("cocina.botonSecundario")}</Boton>
              <Boton jerarquia="terciario">{t("cocina.botonTerciario")}</Boton>
              <Boton disabled>{t("cocina.botonDesactivado")}</Boton>
            </div>
          </Ficha>

          <Ficha titulo={t("cocina.grupoCampos")} prueba="campos">
            <div className="grid gap-pila">
              <CampoTexto etiqueta={t("rsvp.nombre")} placeholder="Paloma Fernández" />
              <CampoTexto
                etiqueta={t("rsvp.contacto")}
                ayuda={t("rsvp.contactoAyuda")}
                error={t("errores.emailInvalido")}
                defaultValue="correo@"
              />
            </div>
          </Ficha>

          <Ficha titulo={t("cocina.grupoEtiquetas")} prueba="etiquetas">
            <div className="flex flex-wrap gap-interno-compacto">
              <EtiquetaEstado>{t("cocina.etiquetaNeutra")}</EtiquetaEstado>
              <EtiquetaEstado variante="marca">{t("cocina.etiquetaMarca")}</EtiquetaEstado>
              <EtiquetaEstado variante="contorno">
                {t("cocina.etiquetaContorno")}
              </EtiquetaEstado>
              <EtiquetaEstado variante="exito">{t("cocina.etiquetaConfirmado")}</EtiquetaEstado>
            </div>
            <Aviso className="mt-pila" titulo={t("cocina.avisoRotulo")}>
              {t("cocina.avisoTexto")}
            </Aviso>
          </Ficha>

          <Ficha titulo={t("cocina.grupoTarjeta")} prueba="tarjeta">
            <Tarjeta
              meta={t("cocina.tarjetaMeta")}
              titulo={t("cocina.tarjetaTitulo")}
              texto={t("cocina.tarjetaTexto")}
              imagen={
                <span className="grid h-full place-items-center text-meta uppercase tracking-meta text-tinta-tenue">
                  {t("cocina.tarjetaImagen")}
                </span>
              }
            />
          </Ficha>
        </div>

        {/*
          La prueba de fuego del sistema: exactamente los mismos componentes,
          sin una sola clase distinta, dentro de un bloque inverso.
        */}
        <div
          data-seccion="inversa"
          className="mt-elemento rounded-tarjeta p-elemento"
          data-prueba="bloque-inverso"
        >
          <Etiqueta>{t("cocina.seccionInversa")}</Etiqueta>
          <div className="mt-pila flex flex-wrap items-center gap-interno">
            <Boton>{t("cocina.botonPrimario")}</Boton>
            <Boton jerarquia="secundario">{t("cocina.botonSecundario")}</Boton>
            <Boton jerarquia="terciario">{t("cocina.botonTerciario")}</Boton>
            <Boton disabled>{t("cocina.botonDesactivado")}</Boton>
          </div>

          {/*
            Aquí es donde se ve si un componente ha colado un color: dentro del
            bloque inverso el relleno de lo desactivado, el anillo del campo y
            el fondo de la nota se dan la vuelta solos. Si alguno se quedara
            igual que arriba, sería que lleva el color escrito en la clase.
          */}
          <div className="mt-pila flex flex-wrap gap-interno-compacto">
            <EtiquetaEstado>{t("cocina.etiquetaNeutra")}</EtiquetaEstado>
            <EtiquetaEstado variante="marca">{t("cocina.etiquetaMarca")}</EtiquetaEstado>
            <EtiquetaEstado variante="contorno">{t("cocina.etiquetaContorno")}</EtiquetaEstado>
            <EtiquetaEstado variante="exito">{t("cocina.etiquetaConfirmado")}</EtiquetaEstado>
          </div>
          <div className="mt-pila grid gap-pila sm:grid-cols-2">
            <CampoTexto etiqueta={t("rsvp.nombre")} placeholder="Paloma Fernández" />
            <Aviso titulo={t("cocina.avisoRotulo")}>{t("cocina.avisoTexto")}</Aviso>
          </div>
          <Cita className="mt-pila">{t("cocina.muestraTipografica")}</Cita>
        </div>
      </Seccion>

      {/*
        LAS CUATRO SECCIONES DE MARCA QUE NO ESTABAN EN NINGÚN SITIO. No son
        decorativas: son las reglas que deciden cómo se escribe un copy y cómo
        se sube una foto, y hasta ahora vivían sólo en el HTML que entregó el
        estudio. Aquí están donde se consultan.
      */}
      {configuracion ? (
        <Seccion titulo={t("cocina.seccionIdentidad")}>
          <div className="grid gap-elemento sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["principal", "cocina.identidadPrincipal", "bg-superficie"],
                ["apilado", "cocina.identidadApilado", "bg-superficie"],
                ["sello", "cocina.identidadSello", "bg-accion"],
                ["secundaria", "cocina.identidadSecundaria", "bg-superficie-tenue"],
              ] as const
            ).map(([variante, clave, fondo]) => (
              <div key={variante}>
                <div
                  className={`grid aspect-foto-tarjeta place-items-center rounded-tarjeta border border-borde ${fondo}`}
                  data-prueba={`monograma-${variante}`}
                >
                  <Monograma
                    nombreNovia={configuracion.nombreNovia}
                    nombreNovio={configuracion.nombreNovio}
                    variante={variante}
                  />
                </div>
                <span className="mt-linea block text-meta uppercase tracking-meta text-tinta-tenue">
                  {t(clave)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-elemento grid gap-elemento sm:grid-cols-3">
            <Ficha titulo={t("cocina.identidadRespeto")} prueba="area-respeto">
              <Cuerpo>{t("cocina.identidadRespetoTexto")}</Cuerpo>
            </Ficha>
            <Ficha titulo={t("cocina.identidadMinimo")} prueba="tamano-minimo">
              <Cuerpo>{t("cocina.identidadMinimoTexto")}</Cuerpo>
            </Ficha>
            <Ficha titulo={t("cocina.identidadNunca")} prueba="identidad-nunca" tono="error">
              <Cuerpo>{t("cocina.identidadNuncaTexto")}</Cuerpo>
            </Ficha>
          </div>
        </Seccion>
      ) : null}

      <Seccion titulo={t("cocina.seccionVoz")}>
        <div className="grid gap-elemento sm:grid-cols-3">
          <Ficha titulo={t("cocina.vozComo")} prueba="voz-como" tono="acento">
            <Cuerpo>{t("cocina.vozComoTexto")}</Cuerpo>
          </Ficha>

          <Ficha titulo={t("cocina.vozSi")} prueba="voz-si" tono="exito">
            <ul className="grid gap-pila">
              {["cocina.vozSiUno", "cocina.vozSiDos"].map((clave) => (
                <li key={clave} className="font-titulo text-cita leading-cita text-tinta">
                  {t(clave as ClaveCopy)}
                </li>
              ))}
            </ul>
          </Ficha>

          <Ficha titulo={t("cocina.vozNo")} prueba="voz-no" tono="error">
            <ul className="grid gap-pila">
              {["cocina.vozNoUno", "cocina.vozNoDos", "cocina.vozNoTres"].map((clave) => (
                <li key={clave} className="font-titulo text-cita leading-cita text-tinta-suave">
                  {t(clave as ClaveCopy)}
                </li>
              ))}
            </ul>
          </Ficha>
        </div>
      </Seccion>

      <Seccion titulo={t("cocina.seccionFoto")}>
        <Cuerpo className="mb-elemento max-w-texto">{t("cocina.fotoEntradilla")}</Cuerpo>
        <div className="grid gap-elemento sm:grid-cols-2 lg:grid-cols-4">
          <Ficha titulo={t("cocina.fotoEncuadre")} prueba="foto-encuadre">
            <Cuerpo>{t("cocina.fotoEncuadreTexto")}</Cuerpo>
          </Ficha>
          <Ficha titulo={t("cocina.fotoColor")} prueba="foto-color">
            <Cuerpo>{t("cocina.fotoColorTexto")}</Cuerpo>
          </Ficha>
          <Ficha titulo={t("cocina.fotoTexto")} prueba="foto-texto">
            <Cuerpo>{t("cocina.fotoTextoTexto")}</Cuerpo>
          </Ficha>
          <Ficha titulo={t("cocina.fotoNunca")} prueba="foto-nunca" tono="error">
            <Cuerpo>{t("cocina.fotoNuncaTexto")}</Cuerpo>
          </Ficha>
        </div>
      </Seccion>

      <Seccion titulo={t("cocina.seccionRepaso")}>
        <Cuerpo className="mb-elemento max-w-texto">{t("cocina.repasoEntradilla")}</Cuerpo>
        <ol className="border-t border-borde">
          {[
            "cocina.repasoUno",
            "cocina.repasoDos",
            "cocina.repasoTres",
            "cocina.repasoFecha",
          ].map((clave, indice) => (
            <li
              key={clave}
              className="rejilla-dato items-baseline gap-interno border-b border-borde py-pila"
            >
              <span className="font-titulo text-titulo-3 text-borde-fuerte">
                {String(indice + 1).padStart(2, "0")}
              </span>
              <Cuerpo>{t(clave as ClaveCopy)}</Cuerpo>
            </li>
          ))}
        </ol>
      </Seccion>
    </main>
  );
}

/**
 * La caja con borde en la que la entrega presenta cada componente: un rótulo
 * en versalita arriba y la pieza debajo. El `data-prueba` es el gancho de los
 * tests, y va aquí y no en cada componente para que el test pueda leer también
 * el hueco alrededor.
 */
const TONOS_FICHA = {
  base: { caja: "bg-superficie", rotulo: "suave" },
  acento: { caja: "bg-superficie", rotulo: "acento" },
  exito: { caja: "bg-exito-fondo", rotulo: "suave" },
  error: { caja: "bg-error-fondo", rotulo: "suave" },
} as const;

function Ficha({
  titulo,
  prueba,
  tono = "base",
  children,
}: {
  titulo: string;
  prueba: string;
  /* Las fichas de «Sí» y «No» de la entrega van sobre verde y sobre rosa: el
     color ES la regla, y en blanco las dos se leerían igual de bien. */
  tono?: keyof typeof TONOS_FICHA;
  children: React.ReactNode;
}) {
  const forma = TONOS_FICHA[tono];

  return (
    <div
      className={`rounded-tarjeta border border-borde p-tarjeta ${forma.caja}`}
      data-prueba={`componente-${prueba}`}
    >
      <Etiqueta className="block" tono={forma.rotulo}>
        {titulo}
      </Etiqueta>
      <div className="mt-pila">{children}</div>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-bloque border-t border-borde pt-bloque">
      <h2 className="mb-elemento text-titulo-3 font-light">{titulo}</h2>
      {children}
    </section>
  );
}
