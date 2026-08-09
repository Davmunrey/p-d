-- Dos usuarios para probar el acceso al panel, contra el Supabase local.
--
-- La gracia está en el segundo: existe en `auth.users`, así que Supabase le
-- manda su enlace y el enlace es válido. Lo que no tiene es perfil activo, y
-- por eso no entra. Es el caso que separa «autenticado» de «con acceso», y el
-- que se rompería sin que nadie se enterase si sólo probáramos el camino bueno.
--
-- Solo se aplica en CI, nunca en producción: los usuarios de verdad se crean
-- desde el panel de Supabase.

begin;

-- `gen_salt` y `crypt` viven en `extensions` en Supabase.
set local search_path = public, extensions;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'con-acceso@ejemplo.test',
    crypt('sin-uso-el-acceso-es-por-enlace', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'sin-acceso@ejemplo.test',
    crypt('sin-uso-el-acceso-es-por-enlace', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  )
on conflict (id) do nothing;

-- El primero entra: perfil activo. `designar_primer_propietario` es la vía
-- oficial para el primero, y esquiva el trigger que exige un propietario ya
-- activo — el arranque en frío que se arregló en BODA-14.
select public.designar_primer_propietario(
  '11111111-1111-4111-8111-111111111111',
  'con-acceso@ejemplo.test'
);

-- El segundo NO entra: tiene perfil, pero desactivado. Es lo que le pasa a
-- cualquiera que se registrase por su cuenta.
insert into public.perfiles (usuario_id, correo_electronico, nombre_completo, rol, activo)
values (
  '22222222-2222-4222-8222-222222222222',
  'sin-acceso@ejemplo.test',
  '(PRUEBA) Sin acceso',
  'lector',
  false
)
on conflict (usuario_id) do update set activo = false;

commit;
