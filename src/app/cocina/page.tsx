import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Aviso } from "@/components/ui/aviso";
import { Monograma } from "@/components/ui/monograma";
import { Boton } from "@/components/ui/boton";
import { CampoSeleccion, CampoTexto } from "@/components/ui/campo";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Tarjeta } from "@/components/ui/tarjeta";
import { Constelacion } from "@/components/ui/constelacion";
import {
  Cita,
  Conector,
  Cuerpo,
  Display,
  Etiqueta,
  Titulo1,
  Titulo2,
  Titulo3,
} from "@/components/ui/tipografia";
import { MENUS_RSVP } from "@/config/constants";
import {
  TOKENS_CURVA,
  TOKENS_DURACION,
  TOKENS_ESPACIADO,
  TOKENS_RADIO,
  TOKENS_RECORRIDO,
  TOKENS_SOMBRA,
  TOKENS_TIPOGRAFIA,
  type TokenTipografia,
} from "@/config/tokens";
import { GRUPOS_COLOR } from "@/config/tokens.generado";
import { CONSTELACIONES, type Hemisferio } from "@/config/constelaciones";
import { obtenerConfiguracion } from "@/lib/bbdd/landing";
import { t, type ClaveCopy } from "@/lib/copy";

import { FilaTipografica, ValorResuelto } from "./valores";

/**
 * LAS SECCIONES, EN EL ORDEN DEL CATÁLOGO DE LA ENTREGA. La navegación de la
 * cabecera sale de aquí, así que una sección nueva tiene su enlace sin que
 * nadie se acuerde de añadirlo.
 */
const SECCIONES = [
  { id: "identidad", titulo: "cocina.seccionIdentidad" },
  { id: "color", titulo: "cocina.seccionColor" },
  { id: "tipografia", titulo: "cocina.seccionTipografia" },
  { id: "espaciado", titulo: "cocina.seccionEspaciado" },
  { id: "forma", titulo: "cocina.seccionForma" },
  { id: "componentes", titulo: "cocina.seccionComponentes" },
  { id: "constelaciones", titulo: "cocina.seccionConstelaciones" },
  { id: "movimiento", titulo: "cocina.seccionMovimiento" },
  { id: "fotografia", titulo: "cocina.seccionFoto" },
  { id: "voz", titulo: "cocina.seccionVoz" },
  { id: "repaso", titulo: "cocina.seccionRepaso" },
] as const satisfies readonly { id: string; titulo: ClaveCopy }[];

type IdSeccion = (typeof SECCIONES)[number]["id"];

/** Los tres principios con los que abre el catálogo de la entrega. */
const PRINCIPIOS = ["sobrio", "calido", "util"] as const;

/**
 * LAS TRES FAMILIAS. Cada una se pinta con su utilidad de familia, que lee
 * `--fuente-*`: si el token apuntara a otra letra, la ficha la enseñaría.
 */
const FAMILIAS = [
  { id: "titulo", clase: "font-titulo text-titulo-1 text-tinta" },
  { id: "cuerpo", clase: "font-cuerpo text-titulo-1 font-light text-tinta" },
  /* La letra del conector no se escribe a mano en ninguna parte, tampoco
     aquí: va siempre por `Conector`, que es quien sabe su tamaño y su color. */
  { id: "conector", clase: "" },
] as const;

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
 * SISTEMA DE MARCA
 *
 * El catálogo vivo: cada token pintado con `var(--nombre)` y, debajo, el valor
 * que el navegador ha resuelto para él. No duplica ni un solo valor: si una
 * ficha se ve mal, el token está mal; si el valor de la ficha no es el de la
 * entrega, la deriva está a la vista.
 *
 * Sirve también de verificación de que la capa semántica se sostiene sola: los
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
  const secciones = SECCIONES.filter((seccion) => seccion.id !== "identidad" || configuracion);

  const familias = FAMILIAS.map((familia) => ({
    token: `fuente-${familia.id}`,
    nombre: t(`cocina.familias.${familia.id}.nombre`),
  }));
  const muestras = muestrasTipograficas();

  return (
    <main className="mx-auto max-w-contenido px-interno py-seccion-compacta">
      {/* Entra como entra la cabecera del catálogo de la entrega: subiendo, una vez. */}
      <header className="animacion-subir mb-bloque">
        <div className="max-w-texto">
          <h1 className="text-titulo-1 font-light">{t("cocina.titulo")}</h1>
          <p className="mt-pila text-cuerpo-grande text-tinta-suave">
            {t("cocina.descripcion")}
          </p>
        </div>

        <ul className="mt-elemento grid gap-elemento border-t border-borde pt-elemento sm:grid-cols-3">
          {PRINCIPIOS.map((principio) => (
            <li key={principio}>
              <Etiqueta tono="acento">{t(`cocina.principios.${principio}.titulo`)}</Etiqueta>
              <Cuerpo className="mt-interno-compacto">
                {t(`cocina.principios.${principio}.texto`)}
              </Cuerpo>
            </li>
          ))}
        </ul>

        <nav aria-label={t("cocina.navegacion")} className="mt-elemento">
          <ul className="flex flex-wrap gap-interno-compacto">
            {secciones.map((seccion) => (
              <li key={seccion.id}>
                <a
                  href={`#${seccion.id}`}
                  className="inline-flex min-h-control-compacto items-center rounded-boton border border-borde px-pila text-menu uppercase tracking-pildora text-tinta-suave transicion-color hover:border-marca hover:bg-superficie-tenue hover:text-tinta"
                >
                  {t(seccion.titulo)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {configuracion ? (
        <Seccion id="identidad">
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
                <span className="mt-linea block text-meta uppercase tracking-meta text-tinta-suave">
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

      {/*
        UNA FICHA POR COLOR DE LA CAPA SEMÁNTICA, con el valor que resuelve. Los
        grupos son los rótulos de sección de `semantic.css`, leídos por el
        generador de tokens: un color nuevo sale aquí sin tocar esta página.
      */}
      <Seccion id="color">
        <div className="grid gap-bloque">
          {GRUPOS_COLOR.map((grupo) => (
            <div key={grupo.id}>
              <Etiqueta como="h3" className="mb-pila">
                {t(`cocina.gruposColor.${grupo.id}`)}
              </Etiqueta>
              <ul className="rejilla-fichas gap-x-interno gap-y-elemento">
                {grupo.tokens.map((token) => (
                  <li key={token} className="min-w-0" data-ficha-color={token}>
                    <div
                      className="h-control-grande w-full rounded-campo border border-borde"
                      style={{ backgroundColor: `var(--${token})` }}
                    />
                    <code className="mt-interno-compacto block text-pequeno wrap-anywhere text-tinta">
                      --{token}
                    </code>
                    <ValorResuelto
                      token={token}
                      como="color"
                      className="block text-pequeno tabular-nums text-tinta-suave"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Seccion>

      {/*
        LAS TRES FAMILIAS Y LA ESCALA. Cada muestra se pinta con el componente
        que la usa de verdad —no con un párrafo genérico al que se le cambia el
        tamaño—, y su ficha de familia · peso · tamaño se mide sobre ella.
      */}
      <Seccion id="tipografia">
        {/*
          Rejilla con `subgrid`: el «Aa» del conector es más alto que los otros
          dos, y sin filas compartidas su nombre y su uso bajaban respecto a los
          de las fichas de al lado.
        */}
        <ul className="grid gap-x-elemento gap-y-elemento sm:grid-cols-3 sm:grid-rows-[auto_auto_auto]">
          {FAMILIAS.map((familia) => (
            <li
              key={familia.id}
              className="grid content-start gap-interno-compacto rounded-tarjeta border border-borde bg-superficie p-tarjeta sm:row-span-3 sm:grid-rows-subgrid"
              data-familia={familia.id}
            >
              <p aria-hidden="true" className={`self-end leading-compacto ${familia.clase}`}>
                {familia.id === "conector" ? (
                  <Conector>{t("cocina.muestraFamilia")}</Conector>
                ) : (
                  t("cocina.muestraFamilia")
                )}
              </p>
              <p className="mt-interno-compacto font-titulo text-titulo-3 text-tinta-marca">
                {t(`cocina.familias.${familia.id}.nombre`)}
              </p>
              <Cuerpo>{t(`cocina.familias.${familia.id}.uso`)}</Cuerpo>
            </li>
          ))}
        </ul>

        <ul className="mt-bloque border-t border-borde">
          {TOKENS_TIPOGRAFIA.map((token) => (
            <FilaTipografica
              key={token}
              token={token}
              familias={familias}
              cursiva={t("cocina.cursiva")}
            >
              {muestras[token]}
            </FilaTipografica>
          ))}
        </ul>
      </Seccion>

      <Seccion id="espaciado">
        <ul className="grid gap-pila">
          {TOKENS_ESPACIADO.map((token) => (
            <li key={token} className="flex flex-wrap items-center gap-x-elemento gap-y-linea">
              <code className="w-columna-token max-w-full min-w-0 wrap-anywhere text-diminuto text-tinta-suave">
                --{token}
              </code>
              <div
                className="h-barra-muestra max-w-full rounded-etiqueta bg-marca"
                style={{ width: `var(--${token})` }}
              />
              <ValorResuelto
                token={token}
                como="longitud"
                className="text-pequeno tabular-nums text-tinta-suave"
              />
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion id="forma">
        <div className="grid gap-elemento sm:grid-cols-2">
          <ul className="grid grid-cols-3 gap-pila">
            {TOKENS_RADIO.map((token) => (
              <li key={token} className="min-w-0">
                <div
                  className="aspect-square w-full border border-borde-fuerte bg-superficie-tenue"
                  style={{ borderRadius: `var(--${token})` }}
                />
                <code className="mt-linea block text-diminuto wrap-anywhere text-tinta-suave">
                  --{token}
                </code>
                <ValorResuelto
                  token={token}
                  como="radio"
                  className="block text-pequeno tabular-nums text-tinta-suave"
                />
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-elemento">
            {TOKENS_SOMBRA.map((token) => (
              <li key={token} className="min-w-0">
                <div
                  className="aspect-video w-full rounded-tarjeta bg-superficie"
                  style={{ boxShadow: `var(--${token})` }}
                />
                <code className="mt-linea block text-diminuto wrap-anywhere text-tinta-suave">
                  --{token}
                </code>
                <ValorResuelto
                  token={token}
                  como="sombra"
                  className="block text-pequeno tabular-nums text-tinta-suave"
                />
              </li>
            ))}
          </ul>
        </div>
      </Seccion>

      {/*
        LOS CUATRO COMPONENTES DEL CATÁLOGO, con los rótulos de la entrega. Cada
        ficha lleva su `data-prueba` porque es el gancho por el que los tests
        entran a leer los valores computados: buscar «el primer botón de la
        página» ata el test a un orden que cambia en cuanto se añade una ficha.
      */}
      <Seccion id="componentes">
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
              <CampoTexto etiqueta={t("rsvp.nombre")} placeholder={t("cocina.ejemploNombre")} />
              <CampoSeleccion etiqueta={t("rsvp.menuEtiqueta")} defaultValue={MENUS_RSVP[0]}>
                {MENUS_RSVP.map((menu) => (
                  <option key={menu} value={menu}>
                    {t(`rsvp.menus.${menu}`)}
                  </option>
                ))}
              </CampoSeleccion>
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
                <span className="grid h-full place-items-center text-meta uppercase tracking-meta text-tinta-suave">
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
            <CampoTexto etiqueta={t("rsvp.nombre")} placeholder={t("cocina.ejemploNombre")} />
            <Aviso titulo={t("cocina.avisoRotulo")}>{t("cocina.avisoTexto")}</Aviso>
          </div>
          <Cita className="mt-pila">{t("cocina.muestraTipografica")}</Cita>
        </div>
      </Seccion>

      {/*
        Las constelaciones son parte del sistema, no de una pantalla: aquí se
        ven las dieciséis a la vez, que es la única forma de comprobar que
        comparten trazo. Van `rotulada`: en esta página el dibujo ES la
        información, así que cada uno se anuncia con su nombre. La ficha es la
        de la entrega: el mapa y, debajo, el nombre en la serif y en tinta.
      */}
      <Seccion id="constelaciones">
        <p className="mb-elemento max-w-texto text-pequeno text-tinta-suave">
          {t("cocina.constelacionesDescripcion")}
        </p>
        <div className="grid gap-bloque lg:grid-cols-2">
          {HEMISFERIOS.map((hemisferio) => (
            <div key={hemisferio.id}>
              <Etiqueta como="h3">{t(hemisferio.claveTitulo)}</Etiqueta>
              <p className="mt-linea text-pequeno text-tinta-suave">
                {t(hemisferio.claveNota)}
              </p>
              <ul className="mt-pila rejilla-fichas gap-interno">
                {CONSTELACIONES.filter((c) => c.hemisferio === hemisferio.id).map(
                  (constelacion) => (
                    <li
                      key={constelacion.clave}
                      className="rounded-tarjeta border border-borde bg-superficie p-interno"
                      data-constelacion={constelacion.clave}
                    >
                      <div className="aspect-square p-interno-compacto">
                        <Constelacion clave={constelacion.clave} rotulada />
                      </div>
                      <span className="mt-interno-compacto block font-titulo text-cuerpo-grande leading-titulo-corto text-tinta">
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
        LAS CUATRO TABLAS DE MOVIMIENTO DE LA ENTREGA, leídas de los tokens que
        de verdad mueven la web. Los valores no son los del catálogo en todo
        —la escena dura más y el sello parte de más pequeño, porque el repo
        sigue a la Landing aplicada—, y por eso se leen y no se copian.
      */}
      <Seccion id="movimiento">
        <Cuerpo className="mb-elemento max-w-texto">{t("cocina.movimiento.entradilla")}</Cuerpo>
        <div className="grid gap-elemento sm:grid-cols-2 lg:grid-cols-4">
          <Ficha titulo={t("cocina.movimiento.duraciones")} prueba="duraciones">
            <dl className="grid gap-interno-compacto text-pequeno">
              {TOKENS_DURACION.map((token) => (
                <div key={token} className="flex items-baseline justify-between gap-interno">
                  <dt className="text-tinta-suave">{t(`cocina.movimiento.usos.${token}`)}</dt>
                  <dd className="shrink-0 tabular-nums text-tinta">
                    <ValorResuelto token={token} como="duracion" />
                  </dd>
                </div>
              ))}
            </dl>
          </Ficha>

          <Ficha titulo={t("cocina.movimiento.curvas")} prueba="curvas">
            <dl className="grid gap-pila text-pequeno">
              {TOKENS_CURVA.map((token) => (
                <div key={token}>
                  <dt className="text-tinta">{t(`cocina.movimiento.curvasUsos.${token}`)}</dt>
                  <dd className="mt-linea wrap-anywhere text-tinta-suave">
                    <ValorResuelto token={token} como="curva" className="font-codigo" />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-pila text-pequeno text-tinta-suave">
              {t("cocina.movimiento.notaMuelle")}
            </p>
          </Ficha>

          <Ficha titulo={t("cocina.movimiento.recorridos")} prueba="recorridos">
            <dl className="grid gap-interno-compacto text-pequeno">
              {TOKENS_RECORRIDO.map(({ token, como }) => (
                <div key={token} className="flex items-baseline justify-between gap-interno">
                  <dt className="text-tinta-suave">
                    {t(`cocina.movimiento.recorridosUsos.${token}`)}
                  </dt>
                  <dd className="shrink-0 tabular-nums text-tinta">
                    <ValorResuelto token={token} como={como} />
                  </dd>
                </div>
              ))}
            </dl>
          </Ficha>

          <Ficha
            titulo={t("cocina.movimiento.accesibilidad")}
            prueba="accesibilidad"
            tono="exito"
          >
            <Cuerpo>{t("cocina.movimiento.accesibilidadTexto")}</Cuerpo>
          </Ficha>
        </div>
      </Seccion>

      <Seccion id="fotografia">
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

      {/*
        LAS SECCIONES DE MARCA QUE NO ESTABAN EN NINGÚN SITIO. No son
        decorativas: son las reglas que deciden cómo se escribe un copy y cómo
        se sube una foto, y hasta ahora vivían sólo en el HTML que entregó el
        estudio. Aquí están donde se consultan.
      */}
      <Seccion id="voz">
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

      <Seccion id="repaso">
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
 * LA MUESTRA DE CADA TOKEN DE LA ESCALA, pintada como se pinta en la web: con
 * su componente de `tipografia.tsx` o, donde no lo hay, con las mismas clases
 * que la pantalla que lo usa. El `Record` obliga a que un token nuevo de la
 * escala tenga muestra: si falta, no compila.
 */
function muestrasTipograficas(): Record<TokenTipografia, ReactNode> {
  const texto = t("cocina.muestraTipografica");

  return {
    "texto-display": <Display como="p">{texto}</Display>,
    "texto-titulo-1": <Titulo1 como="p">{texto}</Titulo1>,
    "texto-titulo-2": <Titulo2 como="p">{texto}</Titulo2>,
    "texto-titulo-3": <Titulo3 como="p">{texto}</Titulo3>,
    "texto-cita": <Cita>{texto}</Cita>,
    "texto-conector": (
      <p>
        <Conector>{t("cocina.muestraConector")}</Conector>
      </p>
    ),
    // Como en la cuenta atrás, que es donde vive la cifra.
    "texto-cifra": (
      <p className="font-titulo text-cifra font-light leading-none tabular-nums">
        {t("cocina.muestraCifra")}
      </p>
    ),
    "texto-cuerpo-grande": <Cuerpo grande>{texto}</Cuerpo>,
    "texto-cuerpo": <Cuerpo>{texto}</Cuerpo>,
    "texto-etiqueta": <Etiqueta>{texto}</Etiqueta>,
    "texto-pequeno": <p className="text-pequeno text-tinta-suave">{texto}</p>,
    // Como en las versalitas de las etiquetas de estado.
    "texto-diminuto": (
      <p className="text-diminuto uppercase tracking-etiqueta text-tinta-suave">{texto}</p>
    ),
    "texto-boton": (
      <Etiqueta tamano="boton" espaciado="boton">
        {texto}
      </Etiqueta>
    ),
    "texto-hito": (
      <Titulo3 como="p" tamano="hito">
        {texto}
      </Titulo3>
    ),
    // Como en el programa del día: la hora de cada hito.
    "texto-hora": (
      <p className="font-titulo peso-titulo-menor text-hora leading-compacto text-acento tabular-nums">
        {t("cocina.muestraHora")}
      </p>
    ),
    // Como en los datos de la portada: fecha y lugar.
    "texto-dato": (
      <p className="font-titulo peso-titulo-menor text-dato leading-titulo-corto text-tinta-marca">
        {texto}
      </p>
    ),
  };
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
  children: ReactNode;
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

/**
 * Una sección del catálogo. El título sale de `SECCIONES` por su `id`, que es
 * también el ancla de la navegación: así el enlace y la sección no pueden
 * llamarse distinto.
 */
function Seccion({ id, children }: { id: IdSeccion; children: ReactNode }) {
  const { titulo } = SECCIONES.find((seccion) => seccion.id === id)!;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titulo`}
      className="mt-bloque border-t border-borde pt-bloque"
    >
      <h2 id={`${id}-titulo`} className="mb-elemento text-titulo-3 font-light">
        {t(titulo)}
      </h2>
      {children}
    </section>
  );
}
