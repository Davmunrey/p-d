-- ============================================================================
-- 20260917140000_invitacion_activa_la_cuenta.sql
-- Ticket: BODA-127 (#164)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: que invitar a alguien al panel valga también cuando su
-- cuenta ya existe.
--
--
-- EL FALLO, CONTADO ENTERO.
--
-- `sincronizar_perfil_desde_auth()` mira `invitaciones_panel` en el instante
-- exacto en que nace la cuenta, y sólo en ese. Si el correo no estaba invitado
-- todavía, el perfil nace `lector` e INACTIVO — y su `on conflict` se niega
-- explícitamente a tocar `rol` y `activo` después, que era lo correcto: un
-- cambio de correo no puede reevaluar privilegios.
--
-- El resultado es que el orden importaba y no lo decía nadie, y que la lista de
-- invitados al panel no servía para invitar a nadie que ya tuviera cuenta.
--
-- El primer propietario sí se podía nombrar: para eso está BODA-10, la función
-- `designar_primer_propietario()`, que marca la sesión con un testigo que el
-- guardián reconoce. Pero sólo sirve UNA vez —se niega en cuanto hay un
-- propietario activo—, así que el segundo se quedaba sin camino: el `insert …
-- on conflict do update` de `scripts/crear-propietarios.sh` cae en el `update`
-- (el perfil ya existe, lo creó el trigger del alta) y ahí `auth.uid()` sigue
-- siendo `null` en una sesión de `psql`. PRF01. Comprobado, no supuesto.
--
-- Y el síntoma no llevaba a ninguna parte: la puerta responde «el correo o la
-- contraseña no son correctos», que es lo mismo que responde a una contraseña
-- mal escrita. Le pasó a los novios en su propia web.
--
--
-- LA INVITACIÓN PASA A SER LO QUE YA DECÍA SER.
--
-- Su propio comentario la describe como «correos autorizados a entrar en el
-- panel, con el rol que se les concede». Eso no es un sello con fecha: es una
-- lista. A partir de aquí, escribir en ella reconcilia el perfil que ya exista
-- con esa dirección, y da igual el orden en que hayan pasado las dos cosas.
--
--
-- POR QUÉ ESTO NO ABRE NADA.
--
-- `proteger_privilegios_perfil()` acepta ahora un cambio más, y uno solo: el
-- que se limita a poner el perfil DE ACUERDO CON SU INVITACIÓN — misma cuenta,
-- `activo` a cierto y el rol exacto que la lista concede. Cualquier otra cosa
-- sigue lanzando PRF01.
--
-- Nadie con sesión llega hasta ahí. La política `perfiles_propio_actualizar`
-- ya clava las dos columnas en su `with check` (`rol = rol_declarado()` y
-- `activo = alta_declarada()`), así que un `authenticated` no puede cambiarlas
-- ni para sí mismo; y sobre el perfil de otro no tiene `using` que le deje
-- pasar. `anon` no tiene ni permiso de escritura sobre la tabla. Los dos únicos
-- caminos que alcanzan la excepción son un propietario —que ya podía— y el SQL
-- fuera de banda de la instalación, que es exactamente para quien se abre.
--
--
-- RETIRAR EL ACCESO SIGUE SIENDO DE DOS PASOS, Y CONVIENE SABERLO.
--
-- Desactivar a alguien desde el panel apaga su perfil, pero su invitación sigue
-- en la lista. Volver a guardar esa invitación —cambiarle el rol, por ejemplo—
-- lo reactivaría, porque la lista manda. Para retirar el acceso de verdad se
-- borra también la fila de `invitaciones_panel`.
--
-- Rollback: supabase/migrations/rollback/20260917140000_invitacion_activa_la_cuenta.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. La invitación alcanza a la cuenta que ya existía
-- ----------------------------------------------------------------------------

create or replace function public.aplicar_invitacion_panel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `new.correo_electronico` ya viene normalizado: lo hace el trigger
  -- `invitaciones_panel_normalizar_correo`, que es BEFORE y corre antes que
  -- éste. Del lado de `auth.users` hay que normalizar aquí, porque ese esquema
  -- es de Supabase y no se toca.
  update public.perfiles as p
     set rol    = new.rol,
         activo = true
   where p.usuario_id = (
           select u.id
             from auth.users as u
            where lower(btrim(u.email)) = new.correo_electronico
            limit 1
         )
     -- Sin esto, cada `update` de la lista tocaría el perfil aunque no
     -- cambiara nada, y `perfiles_actualizado_en` mentiría sobre cuándo se
     -- modificó por última vez.
     and (p.rol, p.activo) is distinct from (new.rol, true);

  return null;
end;
$$;

comment on function public.aplicar_invitacion_panel() is
  'Pone el perfil de acuerdo con su invitación. Existe porque `sincronizar_perfil_'
  'desde_auth()` sólo mira la lista en el instante del alta: sin esto, quien se '
  'registraba antes de ser invitado quedaba inactivo para siempre. SECURITY '
  'DEFINER porque la instalación ocurre sin sesión y `auth.uid()` es null.';

revoke execute on function public.aplicar_invitacion_panel() from public, anon, authenticated;

-- `of` y no a secas: el trigger de `actualizado_en` ya escribe en la fila, y sin
-- acotar las columnas se dispararía a sí mismo en cadena.
create or replace trigger invitaciones_panel_aplicar
  after insert or update of correo_electronico, rol on public.invitaciones_panel
  for each row execute function public.aplicar_invitacion_panel();

-- ----------------------------------------------------------------------------
-- 2. El guardián deja pasar la reconciliación, y nada más
-- ----------------------------------------------------------------------------

-- SE PARTE DE LA VERSIÓN DE BODA-10, NO DE LA ORIGINAL. `20260803090700_
-- arranque.sql` ya redefinió esta función para admitir el testigo del arranque
-- en frío; copiar la de la migración base lo habría borrado sin que nada
-- fallara hasta la próxima instalación desde cero.
create or replace function public.proteger_privilegios_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Excepción de arranque (BODA-10): la establece
  -- `public.designar_primer_propietario` durante su propia transacción y sólo
  -- vive dentro de ella.
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
     -- LA ÚNICA PUERTA NUEVA: que el cambio se limite a poner este perfil de
     -- acuerdo con su invitación. Misma cuenta, alta a cierto, y el rol exacto
     -- que concede la lista. Un ascenso que la lista no respalde sigue siendo
     -- PRF01.
     and not (
       new.usuario_id = old.usuario_id
       and new.activo
       and exists (
         select 1
           from public.invitaciones_panel as i
           join auth.users as u
             on lower(btrim(u.email)) = i.correo_electronico
          where u.id = new.usuario_id
            and i.rol = new.rol
       )
     )
  then
    raise exception 'PRF01'
      using errcode  = 'insufficient_privilege',
            detail   = format('perfil=%s', old.id),
            hint     = 'Sólo un propietario puede cambiar el rol o el alta de un perfil.';
  end if;

  return new;
end;
$$;

comment on function public.proteger_privilegios_perfil() is
  'Impide que nadie se ascienda a sí mismo. Lanza el código estable PRF01: el '
  'texto visible vive en content/copy.es.json, no incrustado en la base de datos, '
  'y el identificador afectado viaja en DETAIL, que PostgREST no devuelve al '
  'cliente. Dos excepciones, las dos acotadas: el testigo del arranque en frío '
  '(BODA-10) y, desde BODA-127, el cambio que sólo pone el perfil de acuerdo con '
  'su fila de `invitaciones_panel`. No alcanza la segunda nadie con sesión: '
  '`perfiles_propio_actualizar` ya clava `rol` y `activo` en su WITH CHECK.';

comment on table public.invitaciones_panel is
  'Correos autorizados a entrar en el panel, con el rol que se les concede. Manda '
  'ella: un alta en `auth.users` cuyo correo NO esté aquí genera un perfil '
  'inactivo y sin permisos —registrarse no concede absolutamente nada— y escribir '
  'aquí pone al día el perfil que ya existiera con esa dirección, sin importar en '
  'qué orden pasaron las dos cosas. Retirar el acceso son dos pasos: desactivar '
  'el perfil y borrar esta fila. Sólo `propietario` la gestiona.';

comment on column public.invitaciones_panel.rol is
  'Rol que recibe la persona. Desde BODA-127 cambiarlo aquí SÍ alcanza a un perfil '
  'ya creado, que es lo que permite arreglar un alta hecha antes de tiempo.';

commit;
