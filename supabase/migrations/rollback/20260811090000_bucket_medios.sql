-- Rollback de 20260811090000_bucket_medios.sql
--
-- Quita el bucket SÓLO SI ESTÁ VACÍO.
--
-- Con ficheros dentro no se toca, y no es prudencia de más: `delete from
-- storage.buckets` con objetos falla por clave ajena, y si no fallara sería
-- peor — se llevaría por delante las fotos que alguien subió, que no existen en
-- ningún otro sitio. Deshacer un despliegue no puede borrar el contenido de la
-- boda.
--
-- Vacío, en cambio, se borra sin pensarlo: es exactamente el estado al que se
-- vuelve, porque antes de esta migración el bucket no existía.
--
-- Si de verdad hay que quitarlo con ficheros dentro —una base de pruebas, un
-- proyecto que se tira— hay que vaciarlo a mano antes, mirando lo que se borra:
--
--   delete from storage.objects where bucket_id = 'medios';
--
-- No hay políticas que deshacer: la migración no crea ninguna. `storage.objects`
-- es de `supabase_storage_admin` y las migraciones corren como `postgres`, que
-- no puede crear políticas ahí. La garantía de que `anon` no escribe viene de
-- que la tabla tiene RLS activada y CERO políticas, que es el estado de partida
-- y no algo que esta migración haya montado.

delete from storage.buckets as b
 where b.id = 'medios'
   and not exists (
     select 1 from storage.objects as o where o.bucket_id = b.id
   );
