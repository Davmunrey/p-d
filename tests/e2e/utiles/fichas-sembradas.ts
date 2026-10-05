import postgres from "postgres";

import { RUTA_INVITADOS, RUTA_PROVEEDORES } from "../../../src/config/constants";

/**
 * LAS FICHAS CON PARÁMETRO, CON UNA FILA DE VERDAD DETRÁS
 *
 * `/panel/invitados/[id]` y `/panel/proveedores/[id]` no se pueden recorrer
 * sin un identificador, y por eso se quedaban fuera de axe y del repaso móvil
 * —cada spec decía que las miraba el otro, y no las miraba ninguno—. Son dos
 * de las pantallas más densas del panel: formularios largos, listas de gente y
 * contactos, y ahora el «Corregir datos» de cada persona.
 *
 * Se siembra lo mínimo para que se pinten llenas, por SQL y con su marca, y se
 * borra por la marca al acabar.
 */
const MARCA = "(DES) E2E Fichas";

function conexion(cadena: string) {
  return postgres(cadena, { max: 1, prepare: false, onnotice: () => {} });
}

export async function sembrarFichas(cadena: string): Promise<string[]> {
  const sql = conexion(cadena);
  try {
    const sello = Date.now();
    const [grupo] = await sql<{ id: string }[]>`
      insert into public.grupos_invitacion (nombre)
      values (${`${MARCA} Familia ${sello}`})
      returning id
    `;
    await sql`
      insert into public.invitados (grupo_id, nombre, apellidos, correo_electronico)
      values (${grupo.id}, '(DES) Ficha', 'Con dos apellidos', 'ficha@ejemplo.test'),
             (${grupo.id}, '(DES) Otra', null, null)
    `;

    const [categoria] = await sql<{ id: string }[]>`
      select id from public.categorias_proveedor order by orden, nombre limit 1
    `;
    const [proveedor] = await sql<{ id: string }[]>`
      insert into public.proveedores (categoria_id, nombre, telefono, importe_presupuestado)
      values (${categoria.id}, ${`${MARCA} Proveedor ${sello}`}, '+34 600 000 000', 1500)
      returning id
    `;
    await sql`
      insert into public.contactos_proveedor (proveedor_id, nombre, papel, telefono)
      values (${proveedor.id}, '(DES) Contacto', 'jefa de sala', '+34 600 111 222')
    `;

    return [`${RUTA_INVITADOS}/${grupo.id}`, `${RUTA_PROVEEDORES}/${proveedor.id}`];
  } finally {
    await sql.end();
  }
}

export async function limpiarFichas(cadena: string): Promise<void> {
  const sql = conexion(cadena);
  try {
    const como = `${MARCA}%`;
    await sql`
      delete from public.contactos_proveedor
       where proveedor_id in (select id from public.proveedores where nombre like ${como})
    `;
    await sql`delete from public.proveedores where nombre like ${como}`;
    await sql`delete from public.grupos_invitacion where nombre like ${como}`;
  } finally {
    await sql.end();
  }
}
