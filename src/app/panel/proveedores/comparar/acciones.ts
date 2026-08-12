"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { RUTA_ACCESO, RUTA_COMPARADOR, RUTA_PROVEEDORES } from "@/config/constants";
import { obtenerContratadosDeCategoria } from "@/lib/bbdd/proveedores";
import { clienteServidor, hayAutenticacion } from "@/lib/supabase/servidor";

import { type EstadoProveedores } from "../estado";

/**
 * BODA-73 · ELEGIR, QUE ES PARA LO QUE SE COMPARA
 *
 * Vive aquí y no en `../acciones.ts` por una razón práctica: todo lo de allí
 * vuelve a la lista o a la ficha, y esto tiene que volver a la comparativa
 * —con su categoría puesta— para que quien acaba de decidir vea el resultado
 * sobre la misma tabla que estaba mirando. Mezclarlo obligaría a que todas las
 * acciones del módulo supieran de un tercer destino que sólo usa una.
 *
 * NO HAY UNA SEGUNDA PUERTA A «CONTRATADO».
 *
 * Ése era el riesgo de este ticket. `cambiarEstado` es el único camino a
 * contratado justamente para que el aviso de «ya hay otro contratado en esta
 * categoría» no se pueda esquivar, y un botón nuevo que escribiera el estado
 * por su cuenta lo esquivaría — precisamente en la pantalla donde uno está
 * mirando a tres candidatos, que es donde más fácil es contratar al segundo sin
 * darse cuenta.
 *
 * Así que aquí se comprueba lo mismo, y cuando hay otro contratado NO se
 * escribe nada: se manda a la ficha con la confirmación de siempre, que enseña
 * a quién y ya tiene su botón. Un solo aviso, un solo sitio donde arreglarlo.
 */

function texto(datos: FormData, campo: string): string {
  return String(datos.get(campo) ?? "").trim();
}

/**
 * De vuelta a la comparativa de SU categoría.
 *
 * La categoría viaja en la URL igual que llegó: sin ella, la vuelta sería una
 * comparativa vacía preguntando qué comparar.
 */
function volver(estado: EstadoProveedores, categoriaId: string): never {
  const consulta = new URLSearchParams({ categoria: categoriaId, estado });
  redirect(`${RUTA_COMPARADOR}?${consulta.toString()}`);
}

export async function elegirProveedor(datos: FormData): Promise<void> {
  const categoriaId = texto(datos, "categoria_id");
  const id = texto(datos, "id");
  // Sin categoría no hay a dónde volver: se cae a la lista, que siempre existe.
  if (!categoriaId) redirect(`${RUTA_PROVEEDORES}?estado=no-existe`);
  if (!id) volver("no-existe", categoriaId);

  if (!hayAutenticacion) redirect(RUTA_ACCESO);
  const supabase = await clienteServidor();

  /*
    ANTES DE ESCRIBIR, LA MISMA PREGUNTA QUE HACE LA FICHA. Si ya hay alguien
    contratado en esta categoría, esto no decide: manda a la pantalla que
    enseña a quién y pide confirmación. Ver la cabecera del fichero.
  */
  const otros = await obtenerContratadosDeCategoria(categoriaId, id);
  if (otros.length > 0) {
    redirect(`${RUTA_PROVEEDORES}/${id}?estado=confirmar-contratado`);
  }

  const { data, error } = await supabase
    .from("proveedores")
    .update({
      estado: "contratado",
      /*
        Y SE LIMPIA EL MOTIVO DE DESCARTE. `proveedores_descarte_con_motivo`
        prohíbe que un proveedor no descartado conserve uno, así que elegir a
        alguien que se había descartado antes —que es un caso normalísimo:
        vuelve a estar libre la fecha— fallaría con un error de la base que no
        dice nada.
      */
      motivo_descarte: null,
    })
    .eq("id", id)
    .eq("categoria_id", categoriaId)
    .select("id");

  if (error) {
    // Cero filas y sin error es RLS callando: un lector no contrata a nadie.
    console.error("No se pudo marcar el proveedor elegido:", error);
    volver("error", categoriaId);
  }
  if (!data?.length) volver("sin-permiso", categoriaId);

  // La lista de proveedores y el resumen de «qué falta por cerrar» acaban de
  // cambiar, y no es la ruta a la que se redirige: revalidarla no compite.
  revalidatePath(RUTA_PROVEEDORES);

  volver("elegido", categoriaId);
}
