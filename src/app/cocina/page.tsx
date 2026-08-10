import type { Metadata } from "next";

import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Constelacion } from "@/components/ui/constelacion";
import { SelectorTema } from "@/components/ui/selector-tema";
import { Cita, Etiqueta } from "@/components/ui/tipografia";
import {
  ANIMACIONES,
  GRUPOS_COLOR,
  TOKENS_ESPACIADO,
  TOKENS_RADIO,
  TOKENS_SOMBRA,
  TOKENS_TIPOGRAFIA,
} from "@/config/tokens";
import { CONSTELACIONES, type Hemisferio } from "@/config/constelaciones";
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
 * Sirve de verificación visual de que el tema oscuro funciona reasignando
 * semánticos, sin que ningún componente sepa qué tema está activo.
 */
export default function PaginaCocina() {
  return (
    <main className="mx-auto max-w-contenido px-interno py-seccion-compacta">
      <header className="mb-bloque flex flex-wrap items-end justify-between gap-elemento">
        <div className="max-w-texto">
          <h1 className="text-titulo-1 font-light">{t("cocina.titulo")}</h1>
          <p className="mt-pila text-cuerpo-grande text-tinta-suave">
            {t("cocina.descripcion")}
          </p>
        </div>
        <SelectorTema />
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

      <Seccion titulo={t("cocina.seccionComponentes")}>
        <div className="grid gap-elemento sm:grid-cols-2">
          <div className="grid content-start gap-pila">
            <Etiqueta>{t("cocina.botonPrimario")}</Etiqueta>
            <div className="flex flex-wrap items-center gap-interno">
              <Boton>{t("cocina.botonPrimario")}</Boton>
              <Boton jerarquia="secundario">{t("cocina.botonSecundario")}</Boton>
              <Boton jerarquia="terciario">{t("cocina.botonTerciario")}</Boton>
              <Boton disabled>{t("cocina.botonDesactivado")}</Boton>
            </div>
          </div>

          <div className="grid content-start gap-pila">
            <CampoTexto etiqueta={t("rsvp.nombre")} placeholder="Paloma Fernández" />
            <CampoTexto
              etiqueta={t("rsvp.contacto")}
              ayuda={t("rsvp.contactoAyuda")}
              error={t("errores.emailInvalido")}
              defaultValue="correo@"
            />
          </div>
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
          </div>
          <Cita className="mt-pila">{t("cocina.muestraTipografica")}</Cita>
        </div>
      </Seccion>
    </main>
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
