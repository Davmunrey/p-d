-- ============================================================================
-- 20260919170000_invitacion_crea_el_perfil_si_falta.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: que invitar a alguien al panel valga TAMBIÉN cuando su
-- cuenta existe en `auth.users` pero no tiene fila en `perfiles`.
--
--
-- EL HUECO QUE QUEDABA, Y CÓMO SE CAE POR ÉL.
--
-- BODA-127 arregló que el orden no importara: escribir en `invitaciones_panel`
-- pone al día el perfil que ya exista con esa dirección. Su comentario lo dice
-- así —«sin importar en qué orden pasaron las dos cosas»— y es verdad salvo en
-- un caso, porque `aplicar_invitacion_panel()` es un UPDATE y nada más:
--
--     update public.perfiles as p
--        set rol = new.rol, activo = true
--      where p.usuario_id = (select u.id from auth.users ...)
--
-- Un UPDATE que no encuentra fila no falla: no hace nada. Así que con la cuenta
-- creada y el perfil ausente, invitar a alguien es una operación que devuelve
-- éxito y no cambia nada en ninguna parte.
--
-- Y EL PERFIL PUEDE FALTAR DE VERDAD. Lo crea `sincronizar_perfil_desde_auth()`
-- en el alta, y esa función termina así, a propósito:
--
--     exception when others then
--       raise warning 'No se pudo sincronizar el perfil de %: %', new.id, sqlerrm;
--       return new;
--
-- Se traga cualquier fallo para no tumbar el alta de Supabase Auth, que es lo
-- correcto —un 500 opaco al registrarse es peor— pero deja la puerta abierta a
-- una cuenta sin perfil, y el aviso se queda en los registros del servidor. A
-- eso se suman las cuentas creadas antes de que ese trigger existiera.
--
-- EL SÍNTOMA NO LLEVA A NINGUNA PARTE, otra vez. Quien lo sufre acierta su
-- contraseña, la puerta le contesta «esta cuenta existe, pero todavía no tiene
-- acceso al panel», y quien intenta arreglarlo escribe la invitación —la
-- operación documentada para esto— y no pasa nada. Ni error, ni cambio, ni
-- rastro. Sólo se ve mirando `perfiles` a mano.
--
--
-- LO QUE CAMBIA, Y POR QUÉ NO ABRE NADA.
--
-- La función pasa de UPDATE a INSERT … ON CONFLICT: si hay cuenta y no hay
-- perfil, lo crea ya activo y con el rol que la lista concede. No es un permiso
-- nuevo: es exactamente el mismo que el UPDATE concedía un milisegundo después
-- de que el trigger del alta hubiera hecho su trabajo. La diferencia es que
-- ahora no depende de que lo hiciera.
--
-- Sigue sin alcanzarla nadie con sesión. `invitaciones_panel` sólo la escribe un
-- `propietario` —su política lo exige— o el SQL fuera de banda de la
-- instalación. Un `authenticated` no puede insertar en esa tabla, así que no
-- puede provocar este INSERT ni para sí mismo.
--
-- El nombre se compone igual que en el alta: el de los metadatos, si no la
-- parte del correo antes de la arroba, y si no un nombre de respaldo. La
-- columna es `not null` con un CHECK de 1 a 120, así que las tres ramas tienen
-- que dar algo y ninguna puede pasarse.
--
-- Rollback: supabase/migrations/rollback/20260919170000_invitacion_crea_el_perfil_si_falta.sql
-- ============================================================================

begin;

create or replace function public.aplicar_invitacion_panel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario auth.users%rowtype;
begin
  -- `new.correo_electronico` ya viene normalizado: lo hace el trigger
  -- `invitaciones_panel_normalizar_correo`, que es BEFORE y corre antes que
  -- éste. Del lado de `auth.users` hay que normalizar aquí, porque ese esquema
  -- es de Supabase y no se toca.
  select u.* into v_usuario
    from auth.users as u
   where lower(btrim(u.email)) = new.correo_electronico
   limit 1;

  -- Sin cuenta todavía no hay nada que poner al día: cuando se cree, el trigger
  -- del alta leerá esta misma fila y nacerá con su rol. Ése es el otro orden, y
  -- ése ya funcionaba.
  if v_usuario.id is null then
    return null;
  end if;

  insert into public.perfiles (usuario_id, correo_electronico, nombre_completo, rol, activo)
  values (
    v_usuario.id,
    new.correo_electronico,
    coalesce(
      nullif(btrim(v_usuario.raw_user_meta_data ->> 'nombre_completo'), ''),
      nullif(split_part(new.correo_electronico, '@', 1), ''),
      'Colaborador ' || left(v_usuario.id::text, 8)
    ),
    new.rol,
    true
  )
  on conflict (usuario_id) do update
    set rol    = excluded.rol,
        activo = true
    -- Sin esto, cada `update` de la lista tocaría el perfil aunque no cambiara
    -- nada, y `perfiles_actualizado_en` mentiría sobre cuándo se modificó por
    -- última vez.
    where (public.perfiles.rol, public.perfiles.activo)
          is distinct from (excluded.rol, true);

  return null;
end;
$$;

comment on function public.aplicar_invitacion_panel() is
  'Pone el perfil de acuerdo con su invitación, y lo CREA si la cuenta existe y '
  'el perfil no. Existe porque `sincronizar_perfil_desde_auth()` sólo mira la '
  'lista en el instante del alta —sin esto, quien se registraba antes de ser '
  'invitado quedaba inactivo para siempre— y hace el insert porque esa misma '
  'función se traga sus errores para no tumbar el alta de Auth: una cuenta sin '
  'perfil es posible, y contra ella un UPDATE no hacía nada y no lo decía. '
  'SECURITY DEFINER porque la instalación ocurre sin sesión y `auth.uid()` es null.';

commit;
