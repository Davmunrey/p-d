-- Rollback de 20261102200000_fuera_lo_que_nadie_usa.sql
--
-- Vuelve todo a como lo dejó 20261102190100: los eventos y el idioma de cada
-- invitación, las notas privadas, el presupuesto objetivo y el aforo,
-- `invitado_por`, y las dos funciones con su forma de entonces. Los datos de
-- lo retirado no vuelven —en producción no había ninguno—.
--
-- LO QUE NO VUELVE: las tablas `users`, `posts` y `comments`. No eran de este
-- proyecto —el blog de ejemplo de Supabase— y ninguna migración las creó;
-- deshacer este cambio no tiene por qué resucitarlas.

-- 1. El tipo y las columnas
create type public.evento_boda as enum ('ceremonia', 'banquete', 'fiesta');
comment on type public.evento_boda is
  'Eventos a los que se puede invitar por separado: hay gente invitada sólo a la '
  'ceremonia o sólo a la fiesta.';

alter table public.grupos_invitacion
  add column invitado_a public.evento_boda[] not null
    default array['ceremonia', 'banquete', 'fiesta']::public.evento_boda[],
  add column idioma text;

alter table public.grupos_invitacion
  add constraint grupos_invitacion_eventos_no_vacio
    check (cardinality(invitado_a) >= 1 and array_position(invitado_a, null) is null),
  add constraint grupos_invitacion_idioma_bcp_47
    check (idioma is null or idioma ~ '^[a-z]{2}(-[A-Z]{2})?$');

create index if not exists grupos_invitacion_eventos_idx
  on public.grupos_invitacion using gin (invitado_a);

comment on column public.grupos_invitacion.invitado_a is
  'Eventos a los que está invitado el grupo. Array y no tres booleanos porque la '
  'landing y los correos iteran sobre la lista tal cual. Se normaliza (sin '
  'duplicados y ordenado) en un trigger.';
comment on column public.grupos_invitacion.idioma is
  'Idioma preferido del grupo en BCP 47 (es, en, ca). NULL = usar '
  '`public.configuracion_boda.idioma_por_defecto`, para no duplicar el idioma '
  'general en cada fila.';

alter table public.configuracion_privada
  add column presupuesto_objetivo numeric(12,2),
  add column aforo_maximo integer,
  add column notas_privadas text;

alter table public.configuracion_privada
  add constraint configuracion_privada_presupuesto_no_negativo
    check (presupuesto_objetivo is null or presupuesto_objetivo >= 0),
  add constraint configuracion_privada_aforo_maximo_rango
    check (aforo_maximo is null or (aforo_maximo >= 1 and aforo_maximo <= 5000)),
  add constraint configuracion_privada_notas_longitud
    check (notas_privadas is null or char_length(notas_privadas) <= 4000);

comment on column public.configuracion_privada.presupuesto_objetivo is
  'Techo de gasto previsto, contra el que se compara `v_resumen_presupuesto`. '
  'Información comercialmente sensible frente a los propios proveedores.';
comment on column public.configuracion_privada.aforo_maximo is
  'Tope de comensales que admite la finca. El panel avisa cuando las '
  'confirmaciones se acercan al límite.';

alter table public.invitaciones_panel add column invitado_por uuid;

-- 2. Las notas privadas (de 20260803090100_invitados.sql y 20260803090400_rls.sql)
create table public.notas_grupo (
  grupo_id       uuid not null,
  texto          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint notas_grupo_pk primary key (grupo_id),
  constraint notas_grupo_grupo_id_fk foreign key (grupo_id)
    references public.grupos_invitacion (id) on delete cascade,
  constraint notas_grupo_texto_longitud check (texto is null or char_length(texto) <= 2000)
);

create table public.notas_invitado (
  invitado_id    uuid not null,
  texto          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint notas_invitado_pk primary key (invitado_id),
  constraint notas_invitado_invitado_id_fk foreign key (invitado_id)
    references public.invitados (id) on delete cascade,
  constraint notas_invitado_texto_longitud check (texto is null or char_length(texto) <= 2000)
);

comment on table public.notas_grupo is
  'Notas privadas de los novios sobre un grupo ("los primos de Madrid, mesa lejos '
  'de la música"). Tabla aparte y no columna de `grupos_invitacion`: la ruta '
  'pública del RSVP tiene que leer el grupo, y lo que el invitado no debe ver no '
  'puede estar en la fila que se le devuelve. Nunca la toca ninguna función pública.';
comment on table public.notas_invitado is
  'Notas privadas de los novios sobre una persona. Fuera de `invitados` por el '
  'mismo motivo que `notas_grupo`: la ruta pública lee `invitados`.';

create trigger notas_grupo_actualizado_en
  before update on public.notas_grupo
  for each row when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();
create trigger notas_grupo_auditoria
  after insert or delete or update on public.notas_grupo
  for each row execute function public.registrar_auditoria();
create trigger notas_invitado_actualizado_en
  before update on public.notas_invitado
  for each row when (old.* is distinct from new.*)
  execute function public.fijar_actualizado_en();
create trigger notas_invitado_auditoria
  after insert or delete or update on public.notas_invitado
  for each row execute function public.registrar_auditoria();

alter table public.notas_grupo enable row level security;
alter table public.notas_grupo force row level security;
alter table public.notas_invitado enable row level security;
alter table public.notas_invitado force row level security;

create policy notas_grupo_editor_gestionar on public.notas_grupo
  to authenticated
  using ((select public.puede_editar())) with check ((select public.puede_editar()));
create policy notas_invitado_editor_gestionar on public.notas_invitado
  to authenticated
  using ((select public.puede_editar())) with check ((select public.puede_editar()));

revoke all on public.notas_grupo, public.notas_invitado from public, anon;
grant select, insert, update, delete on public.notas_grupo, public.notas_invitado to authenticated;

-- 3. Las funciones, como estaban
create or replace function public.normalizar_eventos_grupo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.invitado_a := array(
    select distinct e from unnest(new.invitado_a) as e order by e
  );
  return new;
end;
$$;

comment on function public.normalizar_eventos_grupo() is
  'Deduplica y ordena `invitado_a`. Sin esto, un PATCH mal construido guarda '
  '{banquete,banquete}: la invitación enseña "Banquete" dos veces y el grupo '
  'desaparece del listado de la fiesta sin que nada haya fallado.';

revoke all on function public.normalizar_eventos_grupo() from public, anon, authenticated;

create trigger grupos_invitacion_normalizar_eventos
  before insert or update of invitado_a on public.grupos_invitacion
  for each row execute function public.normalizar_eventos_grupo();

create or replace function public.congelar_privilegios_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.huella_token, new.invitado_a, new.maximo_acompanantes, new.lado)
     is distinct from
     (old.huella_token, old.invitado_a, old.maximo_acompanantes, old.lado)
     and not public.puede_editar()
  then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            detail  = format('grupo=%s', old.id),
            hint    = 'Sólo un editor puede cambiar los privilegios de una invitación.';
  end if;

  return new;
end;
$$;

comment on function public.congelar_privilegios_grupo() is
  'Impide que el propio invitado se cuele en más eventos, se suba el cupo de '
  'acompañantes o reescriba su token dejando al grupo real fuera de su enlace. '
  'Dentro de las funciones públicas del RSVP `auth.uid()` es NULL, luego '
  '`puede_editar()` es falso y las cuatro columnas quedan congeladas.';

drop function if exists public.crear_grupo_invitacion(text, smallint, public.lado_invitacion);

create function public.crear_grupo_invitacion(
  p_nombre              text,
  p_maximo_acompanantes smallint default 0,
  p_lado                public.lado_invitacion default 'ambos',
  p_invitado_a          public.evento_boda[] default array['ceremonia', 'banquete', 'fiesta']::public.evento_boda[]
)
returns table (grupo_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo_id uuid;
  v_token    text;
begin
  if not public.puede_editar() then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede crear invitaciones.';
  end if;

  v_token := public.generar_token_invitacion();

  insert into public.grupos_invitacion (
    nombre, maximo_acompanantes, lado, invitado_a, huella_token, token_emitido_en
  )
  values (
    p_nombre, p_maximo_acompanantes, p_lado, p_invitado_a,
    public.huella_token(v_token), now()
  )
  returning id into v_grupo_id;

  return query select v_grupo_id, v_token;
end;
$$;

comment on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]) is
  'Crea un grupo y devuelve su enlace en un solo paso, que es lo que necesita el '
  'panel al dar de alta una familia. Sin esto habría que crear el grupo y rotar '
  'el token en dos llamadas, con una ventana en la que el grupo no tiene enlace.';

revoke all on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]) from public, anon, authenticated;
grant execute on function public.crear_grupo_invitacion(text, smallint, public.lado_invitacion, public.evento_boda[]) to authenticated;

-- obtener_invitacion() · como la dejó 20261102190000
drop function if exists public.obtener_invitacion(text);

drop function if exists public.obtener_invitacion(text);

create function public.obtener_invitacion(p_token text)
returns table (
  grupo_id             uuid,
  grupo_nombre         text,
  lado                 public.lado_invitacion,
  invitado_a           public.evento_boda[],
  maximo_acompanantes  smallint,
  acompanantes_usados  bigint,
  idioma               text,
  invitado_id          uuid,
  nombre               text,
  apellidos            text,
  es_nino              boolean,
  es_acompanante       boolean,
  tipo_menu            public.tipo_menu,
  alergias             text,
  estado               public.estado_confirmacion,
  respondido_en        timestamptz,
  necesita_autobus     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_grupo_id uuid;
begin
  perform public.exigir_cupo_rsvp();

  -- El token se resuelve por su huella. La tabla no contiene el secreto.
  select g.id into v_grupo_id
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- RSV01: se anota el fallo y se devuelve vacío. Lanzar aquí borraría el
  -- propio registro del intento al abortar la transacción.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return;
  end if;

  -- Los aciertos no se anotan: no cuentan para el cupo, y esta puerta se abre
  -- en cada visita de quien entra con su enlace.

  -- Tipo de retorno enumerado columna a columna. NO existe aquí `notas`, ni
  -- `huella_token`, ni la dirección postal de nadie: lo que el invitado no debe
  -- ver, sencillamente no se selecciona.
  return query
    select
      g.id,
      g.nombre,
      g.lado,
      g.invitado_a,
      g.maximo_acompanantes,
      (select count(*) from public.invitados as a
        where a.grupo_id = g.id and a.es_acompanante),
      coalesce(g.idioma, c.idioma_por_defecto),
      i.id,
      i.nombre,
      i.apellidos,
      i.es_nino,
      i.es_acompanante,
      i.tipo_menu,
      i.alergias,
      f.estado,
      f.respondido_en,
      f.necesita_autobus
    from public.grupos_invitacion as g
    cross join lateral (
      select cb.idioma_por_defecto from public.configuracion_boda as cb limit 1
    ) as c
    join public.invitados as i on i.grupo_id = g.id
    left join public.confirmaciones as f
      on f.invitado_id = i.id and f.es_vigente
   where g.id = v_grupo_id
   order by i.es_acompanante, i.nombre_completo;
end;
$$;

comment on function public.obtener_invitacion(text) is
  'Única puerta de lectura del formulario de confirmación. CERO FILAS significa '
  'enlace no válido: no lanza excepción, porque al abortar se perdería el '
  'registro del intento y el cortafuegos dejaría de contar. Devuelve el grupo '
  'del token y sus personas, con la respuesta vigente de cada una. El tipo de '
  'retorno se enumera a mano a propósito: con `returns setof public.invitados` '
  'el invitado recibiría también las notas privadas de sus coinvitados, y '
  'cualquier columna que se añadiera en el futuro se publicaría sola.';

revoke all on function public.obtener_invitacion(text) from public, anon, authenticated;
grant execute on function public.obtener_invitacion(text) to anon, authenticated;
