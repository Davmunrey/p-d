import type { PersonaInvitada } from "@/lib/bbdd/rsvp";
import type { Borrador } from "@/lib/rsvp-borrador";

/**
 * LO QUE YA ESTABA GUARDADO, DENTRO DEL BORRADOR
 *
 * El formulario del RSVP pinta lo que hay en el borrador, y el envío final
 * escribe lo que hay en el borrador. Si el borrador está vacío —no había
 * cookie, caducó, se borró al enviar, o los novios han añadido a alguien a una
 * familia que ya había contestado— el formulario salía en blanco en lo que no
 * tenía respaldo de la base, y al enviar se ESCRIBÍA ese blanco:
 *
 *  - el autobús salía desmarcado y se guardaba `false` para todos;
 *  - la canción y el mensaje salían vacíos y se guardaban a `null`, y el
 *    mensaje de la familia desaparecía de la bandeja del panel;
 *  - y había que volver a contestar la asistencia de todos, cuando sólo
 *    faltaba la persona nueva.
 *
 * Aquí se rellenan los HUECOS del borrador con lo que la base tiene guardado de
 * cada persona. Sólo los huecos: lo que el invitado ya ha escrito en este
 * borrador manda siempre. Lo usan la página, para enseñarlo, y la acción, para
 * que lo que se escribe sea lo que se vio.
 *
 * Una persona que nunca ha contestado no aporta nada: su asistencia sigue sin
 * marcar, y el envío final sigue negándose a darla de baja por omisión.
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
    // La canción y el mensaje son del grupo y viven en una sola de sus filas.
    if (!sembrado.cancion && persona.cancionSolicitada) {
      sembrado.cancion = persona.cancionSolicitada;
    }
    if (!sembrado.mensaje && persona.mensaje) sembrado.mensaje = persona.mensaje;
  }

  return sembrado;
}
