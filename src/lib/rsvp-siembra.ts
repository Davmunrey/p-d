import type { PersonaInvitada } from "@/lib/bbdd/rsvp";
import type { Borrador } from "@/lib/rsvp-borrador";

/**
 * SIEMBRA EL BORRADOR CON LO QUE YA ESTÁ EN LA BASE
 *
 * Quien vuelve a abrir el formulario —para cambiar el menú de su hija, o
 * porque al final sí viene— tiene que encontrarse sus respuestas, no un
 * formulario en blanco que le obligue a recordar qué contestó cada uno.
 *
 * Una vez y sólo una (`sembrado`): a partir de ahí manda lo que se escribe,
 * aunque contradiga a la base. Y sin pisar nada que el borrador ya tenga: si
 * alguien desmarca el autobús y vuelve atrás, sigue desmarcado.
 */
export function sembrarDesdeLaBase(borrador: Borrador, personas: PersonaInvitada[]): Borrador {
  if (borrador.sembrado) return borrador;

  const sembrado: Borrador = {
    ...borrador,
    asistencia: { ...borrador.asistencia },
    menu: { ...borrador.menu },
    alergias: { ...borrador.alergias },
    autobus: { ...borrador.autobus },
    sembrado: true,
  };

  for (const persona of personas) {
    const { id } = persona;
    if (
      sembrado.asistencia[id] === undefined &&
      (persona.estado === "confirmado" || persona.estado === "rechazado")
    ) {
      sembrado.asistencia[id] = persona.estado;
    }
    if (sembrado.menu[id] === undefined) sembrado.menu[id] = persona.tipoMenu;
    if (sembrado.alergias[id] === undefined && persona.alergias !== null) {
      sembrado.alergias[id] = persona.alergias;
    }
    if (sembrado.autobus[id] === undefined && persona.necesitaAutobus !== null) {
      sembrado.autobus[id] = persona.necesitaAutobus;
    }
  }
  return sembrado;
}
