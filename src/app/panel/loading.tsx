import { t } from "@/lib/copy";

/**
 * ESTADO DE CARGA
 *
 * Sin este fichero, Next deja la pantalla anterior congelada mientras trae la
 * siguiente: se pincha en un módulo, no pasa nada visible, y se vuelve a
 * pinchar. Con él, el marco —navegación y cabecera— se queda en su sitio y
 * sólo cambia el contenido, que es lo que de verdad está cargando.
 *
 * Es texto y no un esqueleto animado a propósito: un esqueleto que no se
 * parece a lo que viene después miente sobre lo que va a aparecer.
 */
export default function CargandoPanel() {
  return (
    <p role="status" className="text-pequeno text-tinta-suave">
      {t("panel.cargando")}
    </p>
  );
}
