import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/servidor", () => ({ clienteServidor: vi.fn() }));

const { claveDeMensaje } = await import("@/lib/bbdd/mensajes");

/**
 * BODA-112 · Un mensaje es su grupo y lo que dice, no la fila en que llegó
 *
 * Cambiar la respuesta inserta otra confirmación con el mismo mensaje, y las
 * marcas de leído y destacado lo reconocen por esta clave. Si la clave fuera
 * demasiado estricta, un espacio de más devolvería el mensaje a «nuevo»; si
 * fuera demasiado laxa, dos grupos que escriben lo mismo compartirían marcas.
 */
describe("claveDeMensaje", () => {
  it("el mismo texto del mismo grupo es el mismo mensaje, aunque cambien espacios o mayúsculas", () => {
    expect(claveDeMensaje("g1", "La abuela es  celíaca ")).toBe(
      claveDeMensaje("g1", "la abuela es celiaca"),
    );
  });

  it("el mismo texto en otro grupo es otro mensaje", () => {
    expect(claveDeMensaje("g1", "¡Qué ganas!")).not.toBe(claveDeMensaje("g2", "¡Qué ganas!"));
  });

  it("si el invitado lo reescribe, es otro mensaje", () => {
    expect(claveDeMensaje("g1", "Llegamos a las ocho")).not.toBe(
      claveDeMensaje("g1", "Llegamos a las nueve"),
    );
  });
});
