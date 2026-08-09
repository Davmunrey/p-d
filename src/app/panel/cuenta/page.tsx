import { redirect } from "next/navigation";

import { Boton } from "@/components/ui/boton";
import { CampoTexto } from "@/components/ui/campo";
import { Cuerpo, Etiqueta, Titulo2 } from "@/components/ui/tipografia";
import { LONGITUD_MINIMA_NOMBRE, RUTA_ACCESO } from "@/config/constants";
import { accesoActual, type RolPanel } from "@/lib/sesion";
import { t } from "@/lib/copy";

import { guardarNombre } from "./acciones";

/**
 * MI CUENTA
 *
 * Lo poco que uno puede cambiar de sí mismo: el nombre con el que aparece. El
 * rol se enseña pero no se toca — quién puede qué lo decide un propietario, y
 * un formulario que dejara ascenderse no sería un formulario, sería un agujero.
 * La base lo impide igualmente con el trigger `perfiles_proteger_privilegios`;
 * esto sólo es no ofrecerlo.
 */
export const dynamic = "force-dynamic";

const AVISOS: Record<string, { texto: string; error: boolean }> = {
  guardado: { texto: t("panel.cuenta.guardado"), error: false },
  corto: { texto: t("panel.cuenta.nombreCorto"), error: true },
  error: { texto: t("panel.cuenta.errorGuardar"), error: true },
};

const ROLES: Record<RolPanel, string> = {
  propietario: t("panel.cuenta.roles.propietario"),
  editor: t("panel.cuenta.roles.editor"),
  lector: t("panel.cuenta.roles.lector"),
};

export default async function PaginaCuenta({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const acceso = await accesoActual();
  if (!acceso) redirect(RUTA_ACCESO);

  const { estado } = await searchParams;
  const aviso = estado && estado in AVISOS ? AVISOS[estado] : null;

  return (
    <div className="grid max-w-texto gap-pila">
      <div>
        <Titulo2 como="h1">{t("panel.cuenta.titulo")}</Titulo2>
        <Cuerpo className="mt-pila">{t("panel.cuenta.descripcion")}</Cuerpo>
      </div>

      {aviso ? (
        <p
          // El que sale bien se anuncia como `status` y el que sale mal como
          // `alert`: el primero no debe interrumpir lo que esté leyendo un
          // lector de pantalla, y el segundo sí.
          role={aviso.error ? "alert" : "status"}
          className={`text-pequeno ${aviso.error ? "text-error-tinta" : "text-tinta-marca"}`}
        >
          {aviso.texto}
        </p>
      ) : null}

      <form action={guardarNombre} className="grid gap-elemento">
        <CampoTexto
          name="nombre"
          etiqueta={t("panel.cuenta.nombre")}
          defaultValue={acceso.nombre ?? ""}
          minLength={LONGITUD_MINIMA_NOMBRE}
          required
          autoComplete="name"
        />
        <div>
          <Boton type="submit">{t("panel.cuenta.guardar")}</Boton>
        </div>
      </form>

      <div>
        <Etiqueta>{t("panel.cuenta.rol")}</Etiqueta>
        <Cuerpo className="mt-linea">{ROLES[acceso.rol]}</Cuerpo>
      </div>
    </div>
  );
}
