-- ============================================================================
-- 20260811140800_bucket_documentos.sql
-- Ticket: BODA-72 (#53) · Contratos y documentos de proveedores
--
-- Qué hace este fichero:
--   1. El bucket `documentos`, PRIVADO. Contratos con datos bancarios y
--      firmas: el fichero más sensible de todo el proyecto.
--
-- PRIVADO ES LO CONTRARIO QUE `medios`, Y POR EL MISMO RAZONAMIENTO. Una foto
-- se pinta con `<img src>` y no puede mandar credenciales, así que su bucket
-- es público. Un contrato se descarga tras un clic de alguien con sesión, así
-- que sí puede — y debe— pasar por el servidor: la descarga se sirve con URL
-- firmada de caducidad corta, creada por una acción que antes comprueba
-- `puede_leer()`. Quien conozca la ruta exacta no ve nada.
--
-- NI UNA SOLA POLÍTICA, y no es un descuido: `storage.objects` es de
-- `supabase_storage_admin` y las migraciones corren como `postgres`, que no
-- puede crear políticas ahí (falla con «must be owner» en el despliegue real,
-- aunque en el PostgreSQL de probar-bbdd.sh pase). La garantía es la
-- AUSENCIA: RLS activada y cero políticas deniega todo, y ese estado se rompe
-- añadiendo, no quitando. La suite de seguridad lo afirma en vez de darlo
-- por hecho.
--
-- El tope y los tipos admitidos están duplicados a conciencia en
-- `src/config/constants.ts` (PESO_MAXIMO_DOCUMENTO_MB, TIPOS_DOCUMENTO_ADMITIDOS):
-- el bucket es la última línea de defensa, la aplicación la primera. Un test
-- unitario comprueba que no discrepan.
--
-- Rollback: supabase/migrations/rollback/20260811140800_bucket_documentos.sql
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  20971520, -- 20 MB: un contrato escaneado a doble cara cabe; un vídeo, no.
  array[
    'application/pdf',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
