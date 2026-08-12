"use client";

import { useMemo, useState } from "react";

import { CampoTexto } from "@/components/ui/campo";
import type { ProveedorEnLaAgenda } from "@/lib/bbdd/dia";
import { t } from "@/lib/copy";
import { paraLlamar } from "@/lib/telefono";
import { normalizar } from "@/lib/texto";

/**
 * BODA-101 (#68) · LA AGENDA, CON SU BUSCADOR
 *
 * FILTRA EN EL NAVEGADOR SOBRE LO QUE YA ESTÁ PINTADO, y esa es la decisión que
 * importa. El criterio del ticket es «funciona sin conexión: es lo primero que
 * falla en una finca», así que la lista entera viaja una vez con la página y
 * escribir no consulta nada. Un buscador que pregunta al servidor por cada
 * letra habría sido igual de instantáneo con wifi y estaría muerto justo el día
 * que hace falta.
 *
 * SE BUSCA POR NOMBRE Y POR CATEGORÍA porque las dos son lo que alguien
 * recuerda con prisa: unas veces «Floristería Marisa» y otras, sencillamente,
 * «flores».
 *
 * `normalizar` es el mismo de la búsqueda de invitados: quien teclea con una
 * mano no pone tildes, y «fotografo» tiene que encontrar a «Fotógrafo».
 */
export function ListaAgenda({ proveedores }: { proveedores: ProveedorEnLaAgenda[] }) {
  const [busqueda, setBusqueda] = useState("");

  const encontrados = useMemo(() => {
    const buscado = normalizar(busqueda.trim());
    if (!buscado) return proveedores;

    return proveedores.filter((proveedor) =>
      normalizar(`${proveedor.nombre} ${proveedor.categoria}`).includes(buscado),
    );
  }, [busqueda, proveedores]);

  return (
    <>
      <div className="mt-bloque max-w-texto">
        <CampoTexto
          etiqueta={t("panel.dia.agenda.campoBuscar")}
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          autoComplete="off"
        />
      </div>

      {encontrados.length === 0 ? (
        <p role="status" className="mt-bloque max-w-texto text-pequeno text-tinta-suave">
          {t("panel.dia.agenda.sinResultados")}
        </p>
      ) : (
        <ul className="mt-bloque grid gap-interno">
          {encontrados.map((proveedor) => (
            <li key={proveedor.id}>
              <FichaDeProveedor proveedor={proveedor} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FichaDeProveedor({ proveedor }: { proveedor: ProveedorEnLaAgenda }) {
  /*
    EL TELÉFONO DE LA FICHA CUENTA COMO UN CONTACTO MÁS. Muchos proveedores
    pequeños no tienen a nadie apuntado en `contactos_proveedor`: su número está
    en la ficha y ya. Tratarlos como un caso aparte dejaría media agenda con
    aspecto de vacía.
  */
  const lineas = [
    ...(proveedor.telefono
      ? [
          {
            id: `${proveedor.id}-ficha`,
            nombre: proveedor.personaContacto ?? proveedor.nombre,
            papel: null,
            telefono: proveedor.telefono,
            correo: null,
            esDelDia: false,
          },
        ]
      : []),
    ...proveedor.contactos,
  ];

  return (
    <article className="rounded-campo border border-borde p-elemento">
      <header>
        <h2 className="text-titulo-3 text-tinta">{proveedor.nombre}</h2>
        {proveedor.categoria ? (
          <p className="mt-pila text-etiqueta uppercase tracking-etiqueta text-tinta-suave">
            {proveedor.categoria}
          </p>
        ) : null}
      </header>

      {lineas.length === 0 ? (
        <p className="mt-elemento text-pequeno text-tinta-suave">
          {t("panel.dia.agenda.sinTelefono")}
        </p>
      ) : (
        <ul className="mt-elemento grid gap-interno-compacto">
          {lineas.map((contacto) => (
            <li key={contacto.id} className="flex flex-wrap items-center gap-interno">
              <span className="text-cuerpo text-tinta">
                {contacto.nombre}
                {contacto.papel ? (
                  <span className="text-tinta-suave"> · {contacto.papel}</span>
                ) : null}
              </span>

              {contacto.esDelDia ? (
                <span className="rounded-etiqueta bg-exito-fondo px-interno-compacto py-linea text-pequeno text-exito-tinta">
                  {t("panel.dia.agenda.contactoDelDia")}
                </span>
              ) : null}

              {contacto.telefono ? (
                /*
                  EL NÚMERO ES EL ENLACE, y se enseña entero: cuando una llamada
                  no entra, lo siguiente que hace alguien es dictárselo a otro.
                  Un botón que ponga «Llamar» esconde justo lo que hay que leer.
                */
                <a
                  href={paraLlamar(contacto.telefono)}
                  aria-label={t("panel.dia.agenda.llamarA", { nombre: contacto.nombre })}
                  className="inline-flex min-h-control-compacto items-center text-cuerpo tabular-nums text-tinta-marca underline"
                >
                  {contacto.telefono}
                </a>
              ) : null}

              {contacto.correo ? (
                <a
                  href={`mailto:${contacto.correo}`}
                  aria-label={t("panel.dia.agenda.escribirA", { nombre: contacto.nombre })}
                  className="inline-flex min-h-control-compacto items-center text-pequeno text-tinta-suave underline"
                >
                  {contacto.correo}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
