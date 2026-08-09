import { Cuerpo, Titulo2 } from "@/components/ui/tipografia";
import { t } from "@/lib/copy";

/**
 * ESTADO DE RESERVA
 *
 * Lo que se enseña cuando no hay datos que enseñar: porque la boda todavía no
 * está configurada, o porque no se ha podido preguntar a la base.
 *
 * Dice la verdad y no finge nada. La alternativa —una página con huecos, o
 * peor, con datos de ejemplo— hace que un invitado se crea una fecha que no es.
 */
export function EnPreparacion() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-texto place-items-center px-interno text-center">
      <div>
        <Titulo2 como="h1">{t("portada.enPreparacion")}</Titulo2>
        <Cuerpo className="mt-pila">{t("portada.enPreparacionTexto")}</Cuerpo>
      </div>
    </main>
  );
}
