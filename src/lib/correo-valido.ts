import { FORMA_CORREO } from "@/config/constants";

/**
 * ¿Aceptaría la base este correo? La misma pregunta que hace su CHECK, hecha
 * antes de escribir para poder decir QUÉ campo está mal en vez de un genérico.
 *
 * Suelto y sin dependencias de servidor, como `esTelefonoValido`: lo usan
 * acciones de varias pantallas y no tiene por qué arrastrar nada más.
 */
export function esCorreoValido(correo: string): boolean {
  return FORMA_CORREO.test(correo.trim());
}
