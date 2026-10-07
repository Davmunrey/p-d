import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { BotonEnvio } from "@/components/ui/boton-envio";
import { EtiquetaEstado } from "@/components/ui/etiqueta-estado";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import {
  PORCENTAJE_IVA,
  RUTA_ACCESO,
  RUTA_COMPARADOR,
  RUTA_PROVEEDORES,
  VALORACION_MAXIMA,
} from "@/config/constants";
import { obtenerMonedaBoda } from "@/lib/bbdd/ajustes";
import {
  contarPorCategoria,
  obtenerCategoria,
  obtenerCategoriasProveedor,
  obtenerComparativa,
  obtenerProveedores,
  type CategoriaProveedor,
  type ProveedorComparado,
} from "@/lib/bbdd/proveedores";
import { t } from "@/lib/copy";
import { formateadorDeImporte } from "@/lib/importe";
import { basesDelPresupuesto } from "@/lib/iva";
import { accesoActual } from "@/lib/sesion";

import { AvisoProveedores } from "../aviso";
import { nombreDelEstado } from "../formato";

import { elegirProveedor } from "./acciones";

/** El título de la pestaña: así el lector de pantalla anuncia a qué pantalla se llega. */
export const metadata: Metadata = { title: t("panel.modulos.proveedores") };

/**
 * BODA-73 · COMPARAR LOS PRESUPUESTOS DE UNA CATEGORÍA
 *
 * Tres fotógrafos, tres PDF, tres correos y una hoja de cálculo a medias. Esta
 * pantalla es esa hoja de cálculo, pero con los datos que ya están en la base y
 * puestos en la misma unidad antes de mirarlos.
 *
 * UNA CATEGORÍA Y NO DOS, Y ESO ES ESTRUCTURAL. La comparativa entra por un
 * único `?categoria=`, así que no hay forma de pedir «fotógrafos y catering» a
 * la vez. No es una limitación: comparar el precio de un fotógrafo con el de un
 * catering no es una comparación, es una suma disfrazada de decisión.
 *
 * ES UNA TABLA DE VERDAD, con `th` de fila y de columna. Un montón de tarjetas
 * queda mejor en una captura y se lee peor: lo que se hace aquí es recorrer una
 * fila —«¿cuánto pide cada uno sin IVA?»— y para eso hay que poder saltar de
 * columna en columna sabiendo en qué concepto se está. Eso es exactamente lo
 * que una tabla le da a un lector de pantalla y una rejilla de `div` no.
 *
 * DESBORDA EN HORIZONTAL, no encoge. Con cuatro candidatos y una pantalla de
 * móvil, la alternativa a desplazar es una tabla de columnas de dos centímetros
 * donde no cabe ni un importe.
 */
export const dynamic = "force-dynamic";

interface Parametros {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const soloTexto = (valor: string | string[] | undefined) =>
  typeof valor === "string" ? valor : "";

export default async function PaginaComparador({ searchParams }: Parametros) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const consulta = await searchParams;
  const categoriaId = soloTexto(consulta.categoria);

  const [categoria, moneda] = await Promise.all([
    obtenerCategoria(categoriaId),
    obtenerMonedaBoda(),
  ]);

  /*
    SIN CATEGORÍA NO HAY COMPARATIVA, Y SE DICE CON PALABRAS. Un `?categoria=`
    que no existe llega de dos sitios reales: un enlace guardado de una
    categoría que después se borró, y una URL escrita a mano. Los dos merecen
    una frase y el camino de vuelta, no una tabla vacía ni un error.
  */
  if (!categoria) {
    return <ElegirCategoria noEsta={categoriaId !== ""} />;
  }

  const candidatos = await obtenerComparativa(categoria.id);
  const euros = moneda ? formateadorDeImporte(moneda) : null;
  const puedeEditar = acceso.rol !== "lector";

  return (
    <>
      <div className="max-w-texto">
        <Titulo2 como="h1">
          {t("panel.proveedores.comparadorTitulo", { categoria: categoria.nombre })}
        </Titulo2>
        <Cuerpo className="mt-pila">
          {t("panel.proveedores.comparadorAyuda", { iva: PORCENTAJE_IVA })}
        </Cuerpo>
      </div>

      <AvisoProveedores estado={soloTexto(consulta.estado)} />

      {candidatos.length === 0 ? (
        <Cuerpo className="mt-bloque max-w-texto text-pequeno text-tinta-suave">
          {t("panel.proveedores.comparadorVacio")}
        </Cuerpo>
      ) : (
        <Tabla
          categoria={categoria}
          candidatos={candidatos}
          euros={euros}
          puedeEditar={puedeEditar}
        />
      )}
    </>
  );
}

/** Una celda vacía no se pinta con un guion: el hueco ya dice que no hay dato. */
function Celda({ children }: { children: ReactNode }) {
  return (
    <td className="border-b border-borde px-interno py-interno-compacto align-top text-cuerpo text-tinta">
      {children}
    </td>
  );
}

/**
 * Un importe, o nada.
 *
 * Existe para no repetir cuatro veces la misma comprobación doble —hay moneda
 * configurada Y hay cifra— y, sobre todo, para que «no se sabe» se pinte
 * exactamente igual que «no hay»: en blanco. Es la mitad de lo que promete el
 * ticket, porque la alternativa era escribir un número inventado.
 */
function Importe({
  valor,
  euros,
}: {
  valor: number | null;
  euros: ((importe: number) => string) | null;
}) {
  if (valor === null || !euros) return null;
  return <span className="tabular-nums">{euros(valor)}</span>;
}

function Concepto({ children }: { children: ReactNode }) {
  return (
    <th
      scope="row"
      className="border-b border-borde px-interno py-interno-compacto text-left align-top text-etiqueta uppercase tracking-etiqueta text-tinta-suave"
    >
      {children}
    </th>
  );
}

function Tabla({
  categoria,
  candidatos,
  euros,
  puedeEditar,
}: {
  categoria: CategoriaProveedor;
  candidatos: ProveedorComparado[];
  euros: ((importe: number) => string) | null;
  puedeEditar: boolean;
}) {
  const bases = candidatos.map((candidato) =>
    basesDelPresupuesto(candidato.importePresupuestado, candidato.ivaIncluido),
  );

  // Filas que sólo tienen sentido si alguien las ha rellenado. Una tabla con
  // tres renglones vacíos hace dudar de los que sí tienen datos.
  const hayDescartes = candidatos.some((candidato) => candidato.motivoDescarte);
  const hayServicios = candidatos.some((candidato) => candidato.servicios.length > 0);

  return (
    <div className="mt-bloque overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {t("panel.proveedores.comparadorTitulo", { categoria: categoria.nombre })}
        </caption>

        <thead>
          <tr>
            {/* La esquina. Vacía a propósito: rotularla obligaría a inventar un
                nombre para «el concepto», que es lo que ya dicen las filas. */}
            <td className="border-b border-borde-fuerte px-interno py-interno-compacto" />
            {candidatos.map((candidato) => (
              <th
                key={candidato.id}
                scope="col"
                className="border-b border-borde-fuerte px-interno py-interno-compacto text-left text-cuerpo text-tinta"
              >
                <Link
                  href={`${RUTA_PROVEEDORES}/${candidato.id}`}
                  className="inline-flex min-h-control-compacto items-center text-tinta-marca underline"
                >
                  {candidato.nombre}
                </Link>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr>
            <Concepto>{t("panel.proveedores.campoPresupuestado")}</Concepto>
            {candidatos.map((candidato, indice) => (
              <Celda key={candidato.id}>
                <Importe valor={candidato.importePresupuestado} euros={euros} />
                {/*
                  EL AVISO VA PEGADO A LA CIFRA QUE NO SE PUEDE INTERPRETAR, y
                  no en una nota al pie: es justo el número que alguien va a
                  comparar con el de al lado dentro de dos segundos.
                */}
                {bases[indice].indeterminado ? (
                  <EtiquetaEstado
                    variante="aviso-marcada"
                    tamano="compacta"
                    forma="recuadro"
                    className="mt-pila"
                  >
                    {t("panel.proveedores.ivaNoLoDice")}
                  </EtiquetaEstado>
                ) : null}
              </Celda>
            ))}
          </tr>

          <tr>
            <Concepto>{t("panel.proveedores.sinIva")}</Concepto>
            {candidatos.map((candidato, indice) => (
              <Celda key={candidato.id}>
                <Importe valor={bases[indice].sinIva} euros={euros} />
              </Celda>
            ))}
          </tr>

          <tr>
            <Concepto>{t("panel.proveedores.conIva", { iva: PORCENTAJE_IVA })}</Concepto>
            {candidatos.map((candidato, indice) => (
              <Celda key={candidato.id}>
                <Importe valor={bases[indice].conIva} euros={euros} />
              </Celda>
            ))}
          </tr>

          <tr>
            <Concepto>{t("panel.proveedores.campoValoracion")}</Concepto>
            {candidatos.map((candidato) => (
              <Celda key={candidato.id}>
                {candidato.valoracion === null
                  ? null
                  : t("panel.proveedores.valoracionDe", {
                      nota: candidato.valoracion,
                      maximo: VALORACION_MAXIMA,
                    })}
              </Celda>
            ))}
          </tr>

          <tr>
            <Concepto>{t("panel.proveedores.campoEstado")}</Concepto>
            {candidatos.map((candidato) => (
              <Celda key={candidato.id}>{nombreDelEstado(candidato.estado)}</Celda>
            ))}
          </tr>

          {hayServicios ? (
            <tr>
              <Concepto>{t("panel.proveedores.queIncluye")}</Concepto>
              {candidatos.map((candidato) => (
                <Celda key={candidato.id}>
                  {candidato.servicios.length === 0 ? null : (
                    <ul className="grid gap-linea text-pequeno text-tinta-suave">
                      {candidato.servicios.map((servicio) => (
                        <li key={servicio}>{servicio}</li>
                      ))}
                    </ul>
                  )}
                </Celda>
              ))}
            </tr>
          ) : null}

          {hayDescartes ? (
            <tr>
              <Concepto>{t("panel.proveedores.motivoDescarte")}</Concepto>
              {candidatos.map((candidato) => (
                <Celda key={candidato.id}>
                  <span className="text-pequeno text-tinta-suave">
                    {candidato.motivoDescarte}
                  </span>
                </Celda>
              ))}
            </tr>
          ) : null}

          {puedeEditar ? (
            <tr>
              <Concepto>{t("panel.proveedores.elegirTitulo")}</Concepto>
              {candidatos.map((candidato) => (
                <Celda key={candidato.id}>
                  {candidato.estado === "contratado" ? (
                    <EtiquetaEstado variante="exito" tamano="compacta">
                      {t("panel.proveedores.yaContratado")}
                    </EtiquetaEstado>
                  ) : (
                    <form action={elegirProveedor}>
                      <input type="hidden" name="categoria_id" value={categoria.id} />
                      <input type="hidden" name="id" value={candidato.id} />
                      {/*
                        El nombre va dentro del nombre accesible: con tres
                        botones idénticos en una fila, «Marcar elegido» a secas
                        obliga a quien escucha a recordar en qué columna está.
                      */}
                      <BotonEnvio
                        jerarquia="secundario"
                        aria-label={t("panel.proveedores.elegirA", {
                          nombre: candidato.nombre,
                        })}
                      >
                        {t("panel.proveedores.elegir")}
                      </BotonEnvio>
                    </form>
                  )}
                </Celda>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>

      <Etiqueta className="mt-elemento">{t("panel.proveedores.comparadorPie")}</Etiqueta>
    </div>
  );
}

/**
 * SIN CATEGORÍA, SE ELIGE UNA. La pestaña «Comparar» llega aquí sin
 * `?categoria=`, y contestar «esa categoría no está» a quien sólo ha pulsado
 * la pestaña era culparle de algo que no ha hecho. Se ofrecen las categorías
 * que tienen algo que comparar —dos candidatos o más, la misma regla que el
 * enlace «Comparar» de la lista— con cuántos hay en cada una.
 *
 * Si la URL traía una categoría que ya no existe —un enlace guardado de una
 * categoría borrada—, se dice primero, y debajo, la misma lista.
 */
async function ElegirCategoria({ noEsta }: { noEsta: boolean }) {
  const [categorias, proveedores] = await Promise.all([
    obtenerCategoriasProveedor(),
    obtenerProveedores(),
  ]);
  const totales = contarPorCategoria(proveedores);
  const comparables = categorias.filter((categoria) => (totales.get(categoria.id) ?? 0) > 1);

  return (
    <div className="max-w-texto">
      <Titulo2 como="h1">
        {noEsta
          ? t("panel.proveedores.comparadorSinCategoriaTitulo")
          : t("panel.proveedores.comparadorElegirTitulo")}
      </Titulo2>
      <Cuerpo className="mt-pila">
        {noEsta
          ? t("panel.proveedores.comparadorSinCategoria")
          : t("panel.proveedores.comparadorElegirAyuda")}
      </Cuerpo>

      {comparables.length === 0 ? (
        <Cuerpo className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.proveedores.comparadorNadaQueComparar")}
        </Cuerpo>
      ) : (
        <ul className="mt-elemento grid gap-linea">
          {comparables.map((categoria) => (
            <li key={categoria.id}>
              <Link
                href={`${RUTA_COMPARADOR}?categoria=${categoria.id}`}
                prefetch={false}
                className="flex min-h-control-compacto items-center justify-between gap-interno rounded-campo border border-borde px-interno text-cuerpo text-tinta transicion-color hover:border-borde-marca hover:bg-superficie-hundida"
              >
                {categoria.nombre}
                <span className="text-pequeno tabular-nums text-tinta-suave">
                  {t("panel.proveedores.comparadorCandidatos", {
                    cuantos: totales.get(categoria.id) ?? 0,
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
