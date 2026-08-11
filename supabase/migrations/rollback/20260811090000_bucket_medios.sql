-- Rollback de 20260811090000_bucket_medios.sql
--
-- Quita las políticas y devuelve el permiso revocado.
--
-- EL BUCKET NO SE BORRA. `delete from storage.buckets` con objetos dentro falla
-- por clave ajena, y si no fallara sería peor: se llevaría por delante las
-- fotos que alguien subió, que no existen en ningún otro sitio. Deshacer un
-- despliegue no puede borrar el contenido de la boda.
--
-- Sin políticas y con RLS activada, nadie escribe: el bucket se queda ahí,
-- inerte y con sus ficheros intactos, que es exactamente lo que se quiere al
-- volver atrás. Si de verdad hay que quitarlo —una base de pruebas, un proyecto
-- que se tira— hay que vaciarlo antes:
--
--   delete from storage.objects where bucket_id = 'medios';
--   delete from storage.buckets where id = 'medios';

drop policy if exists medios_objetos_publica_leer on storage.objects;
drop policy if exists medios_objetos_colaborador_leer on storage.objects;
drop policy if exists medios_objetos_editor_escribir on storage.objects;

revoke execute on function public.es_ruta_almacenamiento_valida(text) from authenticated;
