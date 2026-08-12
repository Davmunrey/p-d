-- Rollback de 20260812090000_alergias_por_mesa.sql
--
-- La vista es de sólo lectura y no guarda nada: soltarla no pierde un dato. Las
-- alergias siguen donde han estado siempre, en `public.invitados.alergias`.
--
-- El `revoke` va primero por costumbre y no por necesidad —`drop view` se lleva
-- sus privilegios— pero deja escrito qué se había concedido, que es lo que hace
-- falta leer cuando alguien audita quién puede ver esta lista.

revoke select on public.v_alergias_por_mesa from authenticated;

drop view if exists public.v_alergias_por_mesa;
