-- Rollback de 20260810230100_motivo_descarte.sql
--
-- Quita la vista y las restricciones. `motivo_descarte` se queda: dice por qué
-- se descartó a cada proveedor y eso lo escribió una persona a mano. Si de
-- verdad sobra, se borra a continuación y a conciencia:
--
--   alter table public.proveedores drop column motivo_descarte;

drop view if exists public.v_categorias_sin_contratar;

alter table public.proveedores
  drop constraint if exists proveedores_descartado_con_motivo;
alter table public.proveedores
  drop constraint if exists proveedores_motivo_descarte_longitud;
