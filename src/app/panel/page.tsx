import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { t } from "@/lib/copy";

/**
 * RESUMEN — la portada del panel
 *
 * Los números de la boda son BODA-43 y llegan con su propia consulta. Hasta
 * entonces esto dice lo que hay y por qué el menú es corto, en lugar de
 * enseñar unas cifras de mentira que habría que acordarse de quitar.
 *
 * El acceso ya lo ha comprobado el layout: aquí no se repite.
 */
export default function PaginaResumen() {
  return (
    <div className="grid max-w-texto gap-pila">
      <Titulo2 como="h1">{t("panel.resumen.titulo")}</Titulo2>
      <Cuerpo>{t("panel.resumen.descripcion")}</Cuerpo>
      <p className="text-pequeno text-tinta-suave">{t("panel.resumen.enConstruccion")}</p>
    </div>
  );
}
