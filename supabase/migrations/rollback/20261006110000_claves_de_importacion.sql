-- Reverso de 20261006110000_claves_de_importacion.sql
--
-- Devuelve `importar_invitados()` a comparar con la expresión escrita en línea,
-- `lower(sin_acentos(btrim(...)))`, tal y como la dejó
-- 20261005110000_importar_sin_acentos.sql, y quita las dos funciones de clave.
-- Primero la función que las usa y después ellas: plpgsql no registra la
-- dependencia, así que el `drop` no avisaría si se hiciera al revés.
--
-- La vista previa de la importación llama a `claves_de_importacion()`: tras
-- este rollback, la pantalla de importar falla hasta volver a desplegar la
-- versión anterior del código.

begin;


create or replace function public.importar_invitados(p_filas jsonb)
returns table (grupos_creados integer, personas_creadas integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fila        jsonb;
  v_indice      integer := 0;
  v_grupo_id    uuid;
  v_nombre_gr   text;
  v_lado        public.lado_invitacion;
  v_nombre      text;
  v_apellidos   text;
  v_nino        boolean;
  v_grupos      integer := 0;
  v_personas    integer := 0;
begin
  if not public.puede_editar() then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede importar invitados.';
  end if;

  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'IMP01'
      using errcode = 'invalid_parameter_value',
            hint    = 'Se esperaba una lista de filas.';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_indice := v_indice + 1;

    v_nombre_gr := btrim(coalesce(v_fila ->> 'grupo', ''));
    v_nombre    := btrim(coalesce(v_fila ->> 'nombre', ''));
    v_apellidos := nullif(btrim(coalesce(v_fila ->> 'apellidos', '')), '');
    v_nino      := coalesce((v_fila ->> 'nino')::boolean, false);
    v_lado      := coalesce((v_fila ->> 'lado')::public.lado_invitacion, 'ambos');

    -- La pantalla ya valida fila a fila y en castellano; esto es la red de
    -- seguridad, y el número de fila va en el detalle para poder señalarla.
    if v_nombre_gr = '' or v_nombre = '' then
      raise exception 'IMP02'
        using errcode = 'check_violation',
              detail  = format('fila=%s', v_indice),
              hint    = 'Cada fila necesita grupo y nombre.';
    end if;

    -- Un grupo por nombre, sin distinguir mayúsculas ni acentos: quien
    -- rellena la hoja escribe «Familia Zubeldía» y «familia zubeldia» sin
    -- pensar que son dos invitaciones distintas. Es el mismo criterio que la
    -- vista previa (`clavePersona`), y si hubiera dos grupos que sólo se
    -- distinguen por una tilde, gana el más antiguo, siempre el mismo.
    select g.id into v_grupo_id
      from public.grupos_invitacion as g
     where lower(public.sin_acentos(btrim(g.nombre))) = lower(public.sin_acentos(v_nombre_gr))
     order by g.creado_en, g.id
     limit 1;

    if v_grupo_id is null then
      insert into public.grupos_invitacion (nombre, lado)
      values (v_nombre_gr, v_lado)
      returning id into v_grupo_id;
      v_grupos := v_grupos + 1;
    end if;

    -- DUPLICADOS. La pantalla los enseña en la vista previa, pero entre mirar
    -- y confirmar puede haber pasado cualquier cosa —otra importación, alguien
    -- dando de alta a mano—, así que la comprobación de verdad va aquí dentro,
    -- donde nadie puede colarse en medio.
    if exists (
      select 1
        from public.invitados as i
       where i.grupo_id = v_grupo_id
         and lower(public.sin_acentos(btrim(i.nombre))) = lower(public.sin_acentos(v_nombre))
         and lower(public.sin_acentos(btrim(coalesce(i.apellidos, ''))))
             = lower(public.sin_acentos(coalesce(v_apellidos, '')))
    ) then
      raise exception 'IMP03'
        using errcode = 'unique_violation',
              detail  = format('fila=%s', v_indice),
              hint    = 'Esa persona ya está en esa invitación.';
    end if;

    insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
    values (v_grupo_id, v_nombre, v_apellidos, v_nino);
    v_personas := v_personas + 1;
  end loop;

  grupos_creados   := v_grupos;
  personas_creadas := v_personas;
  return next;
end;
$function$;

comment on function public.importar_invitados(jsonb) is
  'Da de alta en bloque a la gente de un CSV, en UNA transacción: o entran todas '
  'o no entra ninguna. Reutiliza el grupo cuando ya existe uno con ese nombre '
  '(sin distinguir mayúsculas ni acentos, como la vista previa), porque un CSV '
  'trae una fila por persona y una invitación son varias. No emite enlaces: eso '
  'lo hace quien organiza cuando va a mandarlos.';

revoke all on function public.importar_invitados(jsonb) from public, anon, authenticated;
grant execute on function public.importar_invitados(jsonb) to authenticated;

drop function if exists public.claves_de_importacion(text[]);
drop function if exists public.clave_de_importacion(text);

commit;
