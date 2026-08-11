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
-- Aquí se crea, con sus políticas, y a partir de ahora una base recién levantada
-- reproduce el almacenamiento igual que reproduce las tablas.
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
-- Se acepta a propósito, y por eso las rutas que genera el panel llevan un
-- identificador aleatorio: no se adivinan probando nombres.
--
-- Escribir es otra cosa y ahí no se cede: sube quien puede editar, y nadie más.
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

comment on table storage.buckets is
  'Los ficheros de la landing. El bucket «medios» lo crea la migración '
  '20260811090000; antes vivía en ninguna parte y la portada no podía tener foto.';


-- ----------------------------------------------------------------------------
-- Políticas sobre los objetos
--
-- `storage.objects` ya trae RLS activada en Supabase. Lo que falta son las
-- reglas, y sin ellas la RLS deniega todo: subir desde el panel fallaría con un
-- «no autorizado» que no se entiende mirando el código de la aplicación.
-- ----------------------------------------------------------------------------

drop policy if exists medios_objetos_publica_leer on storage.objects;
drop policy if exists medios_objetos_colaborador_leer on storage.objects;
drop policy if exists medios_objetos_editor_escribir on storage.objects;

/*
  Leer, cualquiera. Es coherente con que el bucket sea público —lo de arriba— y
  no una segunda decisión: si la política dijera «sólo lo publicado» pero el
  bucket sigue siendo público, la política no estaría protegiendo nada y sí
  daría una falsa sensación de que sí. Mejor una regla que dice la verdad.
*/
create policy medios_objetos_publica_leer on storage.objects
  for select to anon
  using (bucket_id = 'medios');

create policy medios_objetos_colaborador_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'medios' and (select public.puede_leer()));

/*
  ESCRIBIR: SÓLO UN EDITOR, Y SÓLO DENTRO DE UNA CARPETA QUE SEA UNA SECCIÓN.

  El prefijo se comprueba contra el enumerado `seccion_landing`, no contra una
  lista escrita aquí. Ésa es la diferencia entre una regla y un hardcode: el día
  que se añada una sección —ya ha pasado tres veces: paisaje, preboda,
  dresscode— la política la admite sola, sin migración que la persiga.

  Se compara el texto en vez de convertir la ruta al enumerado porque un cast
  inválido LANZA, y una política que lanza devuelve un error de base de datos en
  lugar de un «no puedes». Aquí lo correcto es decir que no.
*/
create policy medios_objetos_editor_escribir on storage.objects
  for all to authenticated
  using (
    bucket_id = 'medios'
    and (select public.puede_editar())
  )
  with check (
    bucket_id = 'medios'
    and (select public.puede_editar())
    and public.es_ruta_almacenamiento_valida(name)
    and exists (
      select 1
        from unnest(enum_range(null::public.seccion_landing)) as seccion
       where seccion::text = split_part(name, '/', 1)
    )
  );

comment on policy medios_objetos_editor_escribir on storage.objects is
  'Sube quien puede editar, y dentro de una carpeta con nombre de sección. El '
  'prefijo sale del enumerado `seccion_landing` para que añadir una sección no '
  'exija tocar esta política. `anon` no aparece en ninguna regla de escritura: '
  'con RLS activada, no estar es que no.';

/*
  `es_ruta_almacenamiento_valida` tiene el EXECUTE revocado a `authenticated`
  —lo hace la migración base—, y una política se evalúa con los permisos de quien
  consulta. Sin esto, subir un fichero fallaría con «permission denied for
  function», que no se parece en nada al problema real.
*/
grant execute on function public.es_ruta_almacenamiento_valida(text) to authenticated;
