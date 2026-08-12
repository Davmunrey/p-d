-- Rollback de 20260811140800_bucket_documentos.sql
--
-- Quita el bucket SÓLO SI ESTÁ VACÍO, igual que el de medios: con ficheros
-- dentro el `delete` fallaría por clave ajena, y si no fallara sería peor —
-- un contrato firmado no existe en ningún otro sitio.
--
-- Si de verdad hay que quitarlo con ficheros dentro, se vacía a mano antes,
-- mirando lo que se borra:
--
--   delete from storage.objects where bucket_id = 'documentos';

delete from storage.buckets as b
 where b.id = 'documentos'
   and not exists (
     select 1 from storage.objects as o where o.bucket_id = b.id
   );
