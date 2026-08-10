-- ============================================================================
-- BODA-37/38 · Regalos y dress code
--
-- Las dos secciones que le faltaban a la landing para ser la de la entrega.
-- Van juntas en una migración porque comparten el sitio en el orden —las dos
-- caen entre la playlist y confirmar— y separarlas dejaría un despliegue
-- intermedio con la numeración a medias.
--
-- LO IMPORTANTE DE ESTE FICHERO ES EL IBAN, y no la maquetación.
--
-- `iban_regalos` vive en `configuracion_privada`, que es la tabla que `anon` no
-- puede leer por diseño: se separó de `configuracion_boda` justo porque RLS
-- filtra filas y no columnas, así que la política de lectura pública que
-- necesita la landing habría expuesto la fila entera —presupuesto, aforo y
-- teléfono incluidos—. Esa separación se mantiene: aquí no se abre la tabla ni
-- se mueve la columna.
--
-- En su lugar, una función `security definer` publica DOS CAMPOS y sólo cuando
-- la sección de regalos está encendida. Encender la sección es, literalmente,
-- el acto de publicar la cuenta: no hay un segundo interruptor que se pueda
-- olvidar en la posición equivocada, ni una pantalla que enseñe el número
-- porque nadie se acordó de apagarla.
--
-- La sección entra APAGADA, como ya estaba. Publicar un IBAN en una web que
-- lee cualquiera es una decisión de los novios, no del despliegue.
--
-- Rollback: supabase/migrations/rollback/20260810150100_regalos_y_dresscode.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. A nombre de quién está la cuenta
-- ---------------------------------------------------------------------------
--
-- No se deduce de `configuracion_boda`: allí los nombres son los de pila
-- —«Paloma», «David»— y una transferencia se hace contra el titular completo.
-- Que no cuadre el nombre es la forma más habitual de que un banco rechace un
-- envío, así que es un dato propio y no una concatenación.

alter table public.configuracion_privada
  add column if not exists titular_cuenta text;

do $$
begin
  alter table public.configuracion_privada
    add constraint configuracion_privada_titular_no_vacio
      check (titular_cuenta is null or btrim(titular_cuenta) <> '');
exception
  when duplicate_object then null;
end $$;

comment on column public.configuracion_privada.titular_cuenta is
  'Titular de `iban_regalos`, tal y como lo tiene el banco. Se guarda aparte de '
  'los nombres de `configuracion_boda` porque aquéllos son los de pila y una '
  'transferencia se cursa contra el nombre completo.';

-- ---------------------------------------------------------------------------
-- 2. Qué ponerse
-- ---------------------------------------------------------------------------
--
-- Tabla y no copy fijo: es contenido de esta boda que los novios van a querer
-- retocar —el consejo sobre los tacones sale de conocer el suelo de la finca—
-- y tiene exactamente la forma de `preguntas_frecuentes`, que ya es una tabla.

create table if not exists public.consejos_vestimenta (
  id             uuid primary key default extensions.gen_random_uuid(),
  titulo         text        not null,
  texto          text        not null,
  orden          smallint    not null default 0,
  publicado      boolean     not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint consejos_vestimenta_titulo_no_vacio check (btrim(titulo) <> ''),
  constraint consejos_vestimenta_texto_no_vacio check (btrim(texto) <> '')
);

comment on table public.consejos_vestimenta is
  'Los bloques de la sección «Dress code». Cada fila es un consejo con título '
  '—«Ellas», «Ellos», «Solo dos peticiones»— y su texto.';

create or replace trigger trg_consejos_vestimenta_actualizado_en
  before update on public.consejos_vestimenta
  for each row when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();

create index if not exists idx_consejos_vestimenta_orden
  on public.consejos_vestimenta (orden) where publicado;

alter table public.consejos_vestimenta enable row level security;
alter table public.consejos_vestimenta force row level security;

-- Se cierra todo y se abre sólo lo justo: el default de Supabase concede de más
-- sobre cualquier tabla nueva.
revoke all on public.consejos_vestimenta from public, anon, authenticated;
grant select on public.consejos_vestimenta to anon, authenticated;
grant insert, update, delete on public.consejos_vestimenta to authenticated;

-- Lectura pública de lo publicado: este contenido ES la web pública.
create policy consejos_vestimenta_lectura_publica on public.consejos_vestimenta
  for select to anon, authenticated using (publicado);

create policy consejos_vestimenta_gestion on public.consejos_vestimenta
  for all to authenticated
  using ((select public.puede_editar()))
  with check ((select public.puede_editar()));

-- El contenido de la entrega. `on conflict` no aplica —no hay clave natural—
-- así que se protege con un `where not exists`: la migración se puede volver a
-- aplicar sin duplicar los consejos ni pisar lo que hayan editado los novios.
insert into public.consejos_vestimenta (titulo, texto, orden)
select * from (values
  ('Ellas',
   'Vestido largo o midi. El suelo es de césped y grava: mejor tacón ancho o '
   'sandalia plana bonita. Un chal o chaqueta fina para la noche.',
   0::smallint),
  ('Ellos',
   'Traje en tono medio o claro. La corbata es opcional y la chaqueta se puede '
   'quitar en cuanto acabe la ceremonia: nosotros lo haremos.',
   10::smallint),
  ('Solo dos peticiones',
   'Sin blanco entero, que ese día le toca a Paloma. Y nada de tacón de aguja '
   'fino, os lo agradecerán vuestros pies y el césped.',
   20::smallint)
) as nuevos (titulo, texto, orden)
where not exists (select 1 from public.consejos_vestimenta);

-- ---------------------------------------------------------------------------
-- 3. La cuenta, y sólo si la sección está encendida
-- ---------------------------------------------------------------------------
--
-- `security definer` para poder leer `configuracion_privada`, que `anon` no
-- toca. Devuelve cero filas mientras la sección esté apagada, así que la web no
-- necesita comprobar nada: si pregunta y no hay respuesta, no hay cuenta que
-- enseñar. Y devuelve cero filas también si falta el IBAN, que es el caso del
-- primer día.

create or replace function public.datos_para_regalos()
returns table (iban text, titular text)
language sql
stable
security definer
set search_path to ''
as $function$
  select privada.iban_regalos, privada.titular_cuenta
  from public.configuracion_privada as privada
  where privada.iban_regalos is not null
    and exists (
      select 1
      from public.secciones_landing as seccion
      where seccion.seccion = 'regalos'
        and seccion.visible
    );
$function$;

comment on function public.datos_para_regalos() is
  'El IBAN y su titular para la sección de regalos, o nada. Es la única puerta '
  'por la que sale un dato de `configuracion_privada`, y sólo se abre cuando la '
  'sección está visible: encender la sección ES publicar la cuenta, de modo que '
  'no hay dos interruptores que puedan quedar en desacuerdo.';

revoke all on function public.datos_para_regalos() from public, anon, authenticated;
grant execute on function public.datos_para_regalos() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Las dos secciones, en su sitio del orden
-- ---------------------------------------------------------------------------
--
-- La entrega las pone entre la playlist y confirmar:
--
--   … playlist 75 · [regalos 76] · [dresscode 77] · rsvp 80 …
--
-- `regalos` estaba en el 100, detrás de confirmar, de cuando la sección no
-- tenía forma todavía. Se mueve, y se queda apagada como estaba.

update public.secciones_landing set orden = 76 where seccion = 'regalos';

insert into public.secciones_landing (seccion, visible, orden) values
  ('dresscode', true, 77)
on conflict (seccion) do nothing;
