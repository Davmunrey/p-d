-- ============================================================================
-- Confirmar por WhatsApp: fuera el RSVP de la web
--
-- Los invitados ya no confirman en la web: contestan por WhatsApp y los novios
-- lo apuntan en el panel (`confirmaciones` con origen `panel`, que el trigger
-- de plazo no frena). Las puertas públicas que escribían respuestas sobran, y
-- una puerta abierta que nadie usa es una puerta que alguien acaba probando:
--
--   · `registrar_confirmacion()`     — el formulario del RSVP.
--   · `anadir_acompanante()`         — el «¿venís con alguien?» del formulario.
--   · `destinatarios_confirmacion()` — los correos del acuse de recibo.
--
-- Y `obtener_invitacion()` se cambia por `nombre_de_invitacion()`. El enlace
-- personal sigue existiendo —abre la web saludando al grupo y deja proponer
-- canciones—, pero para saludar basta el nombre del grupo. La función vieja
-- devolvía además el menú, las alergias y los mensajes de cada persona, y con
-- el formulario fuera eso ya no lo necesita nadie: un enlace filtrado deja de
-- enseñar datos de salud de una familia y pasa a enseñar cómo se llama.
--
-- EL MISMO CORTAFUEGOS. `nombre_de_invitacion()` pasa por `exigir_cupo_rsvp()`
-- y anota los tokens que no existen, igual que hacía `obtener_invitacion()`:
-- sondear enlaces al azar sigue costando lo mismo. Los aciertos no se anotan
-- —no cuentan para el cupo y la tabla no tiene por qué crecer con cada visita
-- de quien abre su enlace—.
--
-- NO SE BORRA NINGÚN DATO. Las confirmaciones, los mensajes que dejaron y las
-- marcas de leído y destacado se quedan donde están.
--
-- Rollback: supabase/migrations/rollback/20261102100000_confirmacion_por_whatsapp.sql
-- ============================================================================

drop function if exists public.registrar_confirmacion(text, jsonb);
drop function if exists public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text);
drop function if exists public.destinatarios_confirmacion(text);
drop function if exists public.obtener_invitacion(text);

create or replace function public.nombre_de_invitacion(p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_grupo_id uuid;
  v_nombre   text;
begin
  perform public.exigir_cupo_rsvp();

  -- El token se resuelve por su huella. La tabla no contiene el secreto.
  select g.id, g.nombre into v_grupo_id, v_nombre
    from public.grupos_invitacion as g
   where g.huella_token = public.huella_token(p_token);

  -- Un token que no existe se anota y no se dice nada más. No se lanza: abortar
  -- se llevaría el propio registro del intento.
  if v_grupo_id is null then
    perform public.registrar_intento_rsvp(p_token, false);
    return null;
  end if;

  -- Una invitación sin nadie dentro todavía no es de nadie: el enlace existe,
  -- pero no hay a quién saludar. No es un intento fallido —el token es bueno—.
  if not exists (select 1 from public.invitados as i where i.grupo_id = v_grupo_id) then
    return null;
  end if;

  return v_nombre;
end;
$$;

comment on function public.nombre_de_invitacion(text) is
  'El nombre del grupo de un enlace de invitación, para saludarlo en la web; '
  'null si el enlace no vale o el grupo está vacío. Sólo el nombre: ni personas, '
  'ni menús, ni alergias. Pasa por el mismo cortafuegos que el resto de puertas '
  'públicas y anota los tokens que no existen.';

revoke all on function public.nombre_de_invitacion(text) from public, anon, authenticated;
grant execute on function public.nombre_de_invitacion(text) to anon, authenticated;
