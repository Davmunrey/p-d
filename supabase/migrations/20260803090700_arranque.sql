-- BODA-10 · Arranque en frío del primer propietario
--
-- PROBLEMA QUE RESUELVE
--
-- `perfiles.activo` nace en false y el trigger `proteger_privilegios_perfil`
-- exige que YA exista un propietario activo para poder activar a nadie. En una
-- base de datos recién desplegada no existe ninguno, así que el candado se
-- cierra sobre sí mismo: nadie puede entrar jamás, ni siquiera el superusuario.
--
-- Se detectó ejecutando las migraciones contra un Postgres real y siguiendo el
-- flujo completo de acceso. Ninguna revisión del SQL lo habría visto: cada
-- pieza es correcta por separado.
--
-- CÓMO SE RESUELVE
--
-- Una función de arranque que:
--   * solo puede ejecutar `service_role` (la clave de servidor, que nunca sale
--     del backend y no está en el bundle del cliente);
--   * se niega a actuar si ya existe un propietario activo, de modo que no
--     sirve para escalar privilegios más adelante;
--   * marca la sesión con un testigo que el trigger reconoce, para poder
--     escribir sin desactivar la protección para todos los demás.
--
-- El trigger pasa a admitir esa única excepción, explícita y acotada.

-- ---------------------------------------------------------------------------
-- 1. El trigger admite el testigo de arranque
-- ---------------------------------------------------------------------------

create or replace function public.proteger_privilegios_perfil()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Excepción de arranque: la establece `public.designar_primer_propietario`
  -- durante su propia transacción y solo vive dentro de ella.
  if coalesce(current_setting('boda.arranque_en_curso', true), 'no') = 'si' then
    return new;
  end if;

  if (new.rol, new.activo, new.usuario_id)
     is distinct from (old.rol, old.activo, old.usuario_id)
     and not exists (
       select 1
         from public.perfiles as p
        where p.usuario_id = auth.uid()
          and p.rol = 'propietario'
          and p.activo
     )
  then
    raise exception 'PRF01'
      using errcode  = 'insufficient_privilege',
            detail   = format('perfil=%s', old.id),
            hint     = 'Sólo un propietario puede cambiar el rol o el alta de un perfil.';
  end if;

  return new;
end;
$function$;

comment on function public.proteger_privilegios_perfil() is
  'Impide que nadie se auto-promocione. Única excepción: el arranque en frío, '
  'acotado a la transacción de designar_primer_propietario().';

-- ---------------------------------------------------------------------------
-- 2. Designación del primer propietario
-- ---------------------------------------------------------------------------

create or replace function public.designar_primer_propietario(
  p_usuario_id uuid,
  p_nombre_completo text default null
)
returns public.perfiles
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_perfil public.perfiles;
begin
  if p_usuario_id is null then
    raise exception 'ARR01'
      using errcode = 'null_value_not_allowed',
            hint    = 'Hace falta el identificador del usuario de auth.users.';
  end if;

  -- Solo sirve una vez. Después, los cambios de rol pasan por el trigger como
  -- cualquier otro, así que esta función no es una puerta trasera permanente.
  if exists (
    select 1 from public.perfiles as p where p.rol = 'propietario' and p.activo
  ) then
    raise exception 'ARR02'
      using errcode = 'unique_violation',
            hint    = 'Ya hay un propietario activo: usad el panel para dar de alta a los demás.';
  end if;

  if not exists (select 1 from auth.users as u where u.id = p_usuario_id) then
    raise exception 'ARR03'
      using errcode = 'foreign_key_violation',
            hint    = 'Ese usuario no existe todavía: que inicie sesión una vez y repetid.';
  end if;

  perform set_config('boda.arranque_en_curso', 'si', true);

  insert into public.perfiles as pf (usuario_id, nombre_completo, correo_electronico, rol, activo)
  select
    u.id,
    coalesce(p_nombre_completo, split_part(coalesce(u.email, 'sin nombre'), '@', 1)),
    u.email,
    'propietario',
    true
  from auth.users as u
  where u.id = p_usuario_id
  on conflict (usuario_id) do update
    set rol    = 'propietario',
        activo = true,
        nombre_completo = coalesce(p_nombre_completo, pf.nombre_completo)
  returning * into v_perfil;

  perform set_config('boda.arranque_en_curso', 'no', true);

  return v_perfil;
end;
$function$;

comment on function public.designar_primer_propietario(uuid, text) is
  'Arranque en frío: convierte al primer usuario en propietario activo. '
  'Falla si ya existe uno. Solo ejecutable por service_role.';

-- La clave de servicio vive únicamente en el servidor. Ni anon ni un usuario
-- autenticado pueden llamar a esto.
revoke all on function public.designar_primer_propietario(uuid, text) from public;
revoke all on function public.designar_primer_propietario(uuid, text) from anon;
revoke all on function public.designar_primer_propietario(uuid, text) from authenticated;
grant execute on function public.designar_primer_propietario(uuid, text) to service_role;
