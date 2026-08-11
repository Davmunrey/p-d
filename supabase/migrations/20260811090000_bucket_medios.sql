-- ----------------------------------------------------------------------------
-- BODA-29 · EL BUCKET DE MEDIOS, EN UNA MIGRACIÓN
--
-- La tabla `public.medios` y sus políticas existen desde el principio. El
-- BUCKET donde viven los ficheros, no: no estaba en ninguna migración. Al
-- montar esto se comprobó contra el proyecto remoto que `storage.buckets` está
-- **vacío** — o sea, que no es que estuviera configurado a mano y sin versionar:
-- es que no existe. La foto de la portada nunca ha podido cargar, porque
-- `HuecoFoto` compone una URL a un bucket que no está.
--
--
-- POR QUÉ AQUÍ NO HAY NI UNA SOLA POLÍTICA, Y DÓNDE ESTÁ ENTONCES LA GARANTÍA
--
-- Este fichero empezó creando tres políticas sobre `storage.objects`. No se
-- puede, y el motivo importa lo suficiente como para dejarlo escrito:
--
--   · `storage.buckets` y `storage.objects` son de `supabase_storage_admin`.
--   · Las migraciones se aplican como `postgres`, que NO es miembro de ese rol.
--   · `create policy` y `comment on table` exigen ser dueño. `insert`, no.
--
-- Así que de esta tabla se puede escribir una fila y nada más. Intentarlo cuesta
-- un despliegue: falla con «must be owner of table buckets», y falla en el
-- trabajo que levanta un Supabase de verdad, no en el PostgreSQL pelado — donde
-- el rol sí es dueño y todo parece ir bien.
--
-- LA GARANTÍA NO SE PIERDE, CAMBIA DE SITIO. `storage.objects` tiene RLS
-- activada y CERO políticas, y RLS activada sin políticas deniega todo: `anon`
-- no puede escribir ni conociendo la ruta, que es exactamente lo que pedía el
-- ticket. No hace falta añadir una regla para eso; hace falta no añadir ninguna
-- que lo permita. La suite de seguridad lo comprueba en vez de darlo por hecho.
--
-- Y las subidas del panel van por una acción de servidor con la clave de
-- servicio, que comprueba `puede_editar()` y compone ella la ruta. El navegador
-- no recibe nunca un camino de escritura a Storage, así que el prefijo de
-- sección y la travesía de directorios se validan donde se pueden probar de
-- verdad: en nuestro código, con un test E2E.
--
--
-- POR QUÉ EL BUCKET ES PÚBLICO, Y QUÉ SIGNIFICA EXACTAMENTE
--
-- La landing pinta las fotos con `<img src>`. Un navegador pidiendo una imagen
-- NO manda la clave de la API, así que un bucket privado obligaría a firmar cada
-- URL en cada pintado: enlaces que caducan, que no se pueden cachear y que
-- convierten una foto en una petición autenticada. Para una invitación de boda
-- —cuyas fotos están hechas para verse— eso es complejidad a cambio de nada.
--
-- Lo que sí hay que decir claro es el precio: en un bucket público, **quien
-- conozca la ruta exacta de un fichero puede verlo aunque su fila esté sin
-- publicar**. Publicar sigue controlando lo que sale EN LA WEB, que es lo que
-- decide `medios_publica_leer` sobre `public.medios`, pero no esconde el objeto.
-- Se acepta a propósito, y por eso las rutas que compone el panel llevan un
-- identificador aleatorio: no se adivinan probando nombres.
-- ----------------------------------------------------------------------------

/*
  EL TOPE Y LOS TIPOS ESTÁN TAMBIÉN EN `src/config/constants.ts`, A PROPÓSITO.

  El navegador tiene que poder decir «esa foto pesa demasiado» ANTES de subir
  veinte megas por una línea móvil, y el bucket tiene que volver a decirlo por su
  cuenta: una validación que sólo vive en el cliente no es una validación. Son
  dos sitios porque son dos capas distintas, no por descuido — y un test unitario
  comprueba que los dos números coinciden, que es lo que impide que se separen.

  El tope del bucket es el del VÍDEO, que es el mayor de los dos. Storage sólo
  admite un límite por bucket, así que el de las imágenes lo impone la aplicación:
  aquí sólo se corta lo que ni siquiera un vídeo debería pesar.
*/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medios',
  'medios',
  true,
  52428800, -- 50 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
