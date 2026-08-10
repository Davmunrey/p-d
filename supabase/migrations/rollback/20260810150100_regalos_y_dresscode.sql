-- Rollback de 20260810150100_regalos_y_dresscode.sql
--
-- Deja el sistema como si las dos secciones no se hubieran construido. El valor
-- 'dresscode' del enumerado se queda —PostgreSQL no los retira— pero sin fila
-- que lo use no lo ve nadie.
--
-- OJO CON `titular_cuenta`: quitar la columna se lleva por delante el nombre
-- del titular si ya se había rellenado desde el panel. El IBAN no se toca, que
-- estaba antes de esta migración.

drop function if exists public.datos_para_regalos();

drop policy if exists consejos_vestimenta_gestion on public.consejos_vestimenta;
drop policy if exists consejos_vestimenta_lectura_publica on public.consejos_vestimenta;
drop table if exists public.consejos_vestimenta;

alter table public.configuracion_privada
  drop constraint if exists configuracion_privada_titular_no_vacio;
alter table public.configuracion_privada
  drop column if exists titular_cuenta;

delete from public.secciones_landing where seccion = 'dresscode';

-- `regalos` vuelve al 100, detrás de confirmar, que es donde estaba.
update public.secciones_landing set orden = 100 where seccion = 'regalos';
