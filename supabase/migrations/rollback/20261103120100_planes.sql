-- Rollback de 20261103120100_planes.sql
--
-- Se van la tabla —y con ella los planes escritos—, su fila en
-- `secciones_landing` y las fotos subidas a la sección «Planes» dejan de tener
-- dónde pintarse: se pasan a borrador para que no queden publicadas sin sitio.
begin;

update public.medios set publicado = false where seccion = 'planes';
delete from public.secciones_landing where seccion = 'planes';
drop table if exists public.planes;

commit;
