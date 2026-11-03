/**
 * EL CAMPO OCULTO QUE DICE «AQUÍ SE PREGUNTÓ POR LA PREBODA».
 *
 * Una casilla sin marcar no viaja en el formulario, así que sin él no habría
 * forma de distinguir «no viene a la preboda» de «no se le preguntó» —porque
 * la web no enseña preboda—. Lo escribe el paso de detalles y lo leen las
 * acciones; vive aparte porque un fichero `"use server"` sólo exporta
 * funciones asíncronas.
 */
export const CAMPO_PREGUNTA_PREBODA = "pregunta-preboda";
