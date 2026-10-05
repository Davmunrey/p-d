import { PantallaEstado } from "@/components/marketing/pantalla-estado";
import { t } from "@/lib/copy";

/**
 * ESTADO DE RESERVA
 *
 * Lo que se enseña cuando no hay datos que enseñar, y por cuál de los dos
 * motivos, porque no se le dice lo mismo a quien llega antes de tiempo que a
 * quien llega en mitad de una avería:
 *
 *   · `preparacion`: la boda todavía no está configurada. «Estamos preparando
 *     la web» es la verdad.
 *   · `averia`: no se ha podido preguntar a la base. Ahí «estamos preparando
 *     la web» describía una web a medio montar cuando lo que hay es un fallo
 *     pasajero, y no tranquilizaba a quien ya había confirmado.
 *
 * Dice la verdad y no finge nada. La alternativa —una página con huecos, o
 * peor, con datos de ejemplo— hace que un invitado se crea una fecha que no es.
 */
export function EnPreparacion({
  motivo = "preparacion",
}: {
  motivo?: "preparacion" | "averia";
}) {
  return motivo === "averia" ? (
    <PantallaEstado titulo={t("portada.noDisponible")} texto={t("portada.noDisponibleTexto")} />
  ) : (
    <PantallaEstado
      titulo={t("portada.enPreparacion")}
      texto={t("portada.enPreparacionTexto")}
    />
  );
}
